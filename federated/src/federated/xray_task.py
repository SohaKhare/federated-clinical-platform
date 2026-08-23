from __future__ import annotations

import os
import zlib
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset

from federated.model import SHARED_LABELS


DATA_DIR = Path(os.environ.get("XRAY_DATA_DIR", Path(__file__).parents[2] / "data" / "xray"))
NIH_LABELS_CSV = DATA_DIR / "nih" / "Data_Entry_2017.csv"
CHEXPERT_TRAIN_CSV = DATA_DIR / "chexpert" / "train.csv"
INSTITUTIONS = ["nih", "chexpert"]
IMG_SIZE = 224
MEAN = 0.5
STD = 0.5
VAL_FRACTION = 0.1
SPLIT_SEED = 42

NIH_TO_SHARED = {
    "Atelectasis": "Atelectasis",
    "Cardiomegaly": "Cardiomegaly",
    "Consolidation": "Consolidation",
    "Edema": "Edema",
    "Effusion": "Pleural Effusion",
}
CHEXPERT_TO_SHARED = {label: label for label in SHARED_LABELS}


class ChestXrayDataset(Dataset):
    def __init__(self, image_paths: list[Path], targets: np.ndarray) -> None:
        self.image_paths = image_paths
        self.targets = torch.tensor(targets, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.image_paths)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        with Image.open(self.image_paths[index]) as img:
            img = img.convert("L").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
            pixels = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).unsqueeze(0)
        return (pixels - MEAN) / STD, self.targets[index]


def _patient_split_mask(patients: pd.Series) -> tuple[torch.Tensor, torch.Tensor]:
    keep_val = patients.map(lambda p: zlib.crc32(f"{p}:{SPLIT_SEED}".encode("utf-8")) % 100 < VAL_FRACTION * 100)
    validation = torch.tensor(keep_val.to_numpy())
    return ~validation, validation


def _load_nih_manifest() -> pd.DataFrame:
    if not NIH_LABELS_CSV.exists():
        raise FileNotFoundError(
            f"Missing {NIH_LABELS_CSV}. Download NIH ChestX-ray14 labels "
            "(https://nihcc.app.box.com/v/ChestXray14) and place Data_Entry_2017.csv there."
        )
    frame = pd.read_csv(NIH_LABELS_CSV)
    image_dirs = sorted(DATA_DIR.glob("nih/images*"))
    lookup: dict[str, Path] = {}
    for folder in image_dirs:
        for file in folder.glob("*.png"):
            lookup[file.name] = file
    rows = []
    for _, record in frame.iterrows():
        path = lookup.get(record["Image Index"])
        if path is None:
            continue
        findings = set(str(record["Finding Labels"]).split("|"))
        target = [
            1.0 if any(NIH_TO_SHARED[f] == label for f in findings if f in NIH_TO_SHARED) else 0.0
            for label in SHARED_LABELS
        ]
        rows.append({"path": str(path), "patient": str(record["Image Index"]).split("_")[0], **dict(zip(SHARED_LABELS, target))})
    return pd.DataFrame(rows)


def _resolve_chexpert_path(relative: str) -> Path | None:
    relative = relative.replace("\\", "/")
    for root in (CHEXPERT_TRAIN_CSV.parent, CHEXPERT_TRAIN_CSV.parent.parent):
        candidate = root / relative
        if candidate.exists():
            return candidate
    parts = Path(relative).parts[-4:]
    for root in (CHEXPERT_TRAIN_CSV.parent, CHEXPERT_TRAIN_CSV.parent.parent):
        candidate = root.joinpath(*parts)
        if candidate.exists():
            return candidate
    return None


def _load_chexpert_manifest() -> pd.DataFrame:
    if not CHEXPERT_TRAIN_CSV.exists():
        raise FileNotFoundError(
            f"Missing {CHEXPERT_TRAIN_CSV}. Download CheXpert-v1.0-small "
            "(https://stanfordmlgroup.github.io/projects/chexpert/) and place its train.csv + images under that folder."
        )
    frame = pd.read_csv(CHEXPERT_TRAIN_CSV)
    frame = frame[frame["Path"].str.contains("frontal")].reset_index(drop=True)
    rows = []
    for _, record in frame.iterrows():
        path = _resolve_chexpert_path(str(record["Path"]))
        if path is None:
            continue
        target = []
        for label in SHARED_LABELS:
            value = record[CHEXPERT_TO_SHARED[label]]
            target.append(1.0 if value == 1.0 else 0.0)
        patient = Path(str(record["Path"])).parts[-3]
        rows.append({"path": str(path), "patient": patient, **dict(zip(SHARED_LABELS, target))})
    return pd.DataFrame(rows)


def _manifest(client_id: int) -> pd.DataFrame:
    loaders = {0: _load_nih_manifest, 1: _load_chexpert_manifest}
    if client_id not in loaders:
        raise ValueError(f"client_id must be one of {sorted(loaders)}, got {client_id}")
    frame = loaders[client_id]()
    if frame.empty:
        raise RuntimeError(f"No images found for institution '{INSTITUTIONS[client_id]}'. Check the dataset layout under {DATA_DIR}.")
    return frame.sample(frac=1, random_state=SPLIT_SEED).reset_index(drop=True)


def load_client_data(client_id: int, batch_size: int) -> tuple[DataLoader, DataLoader, int]:
    frame = _manifest(client_id)
    train_mask, validation_mask = _patient_split_mask(frame["patient"])
    train_frame, validation_frame = frame[train_mask.numpy()], frame[validation_mask.numpy()]

    def make_subset(subset: pd.DataFrame) -> ChestXrayDataset:
        targets = subset[SHARED_LABELS].to_numpy(dtype=np.float32)
        return ChestXrayDataset([Path(p) for p in subset["path"]], targets)

    train_set = make_subset(train_frame)
    validation_set = make_subset(validation_frame)
    generator = torch.Generator().manual_seed(SPLIT_SEED)
    return (
        DataLoader(train_set, batch_size=batch_size, shuffle=True, generator=generator),
        DataLoader(validation_set, batch_size=batch_size),
        len(SHARED_LABELS),
    )


def auroc_score(probabilities: torch.Tensor, targets: torch.Tensor) -> float:
    scores = []
    for column in range(targets.shape[1]):
        y = targets[:, column]
        if y.min() == y.max():
            continue
        order = probabilities[:, column].argsort()
        ranks = torch.empty_like(order, dtype=torch.float32)
        sorted_scores = probabilities[order, column]
        start = 0
        while start < len(order):
            end = start + 1
            while end < len(order) and sorted_scores[end] == sorted_scores[start]:
                end += 1
            ranks[order[start:end]] = (start + end - 1) / 2.0 + 1.0
            start = end
        positives = y.sum()
        negatives = len(y) - positives
        rank_sum_positive = ranks[y == 1].sum()
        scores.append((rank_sum_positive - positives * (positives + 1) / 2).item() / (positives * negatives).item())
    return sum(scores) / len(scores) if scores else 0.5
