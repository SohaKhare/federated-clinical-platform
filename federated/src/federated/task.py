from __future__ import annotations

import os
import zlib
from pathlib import Path

import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset


DATA_PATH = Path(__file__).parents[2] / "data" / "heart_disease_cleveland.csv"
POOL_PATH = Path(__file__).parents[2] / "data" / "heart_presentation_pool.csv"
CATEGORICAL = ["sex", "cp", "fbs", "restecg", "exang", "slope", "ca", "thal"]
NUMERIC = ["age", "trestbps", "chol", "thalach", "oldpeak"]
FEATURE_COLUMNS = [
    "age", "sex", "cp", "trestbps", "chol", "fbs", "restecg", "thalach",
    "exang", "oldpeak", "slope", "ca", "thal",
]


def participating_clients(default: int = 3) -> int:
    """Number of simulated hospital clients for this run.

    federated.service sets FEDERATION_NODE_IDS to the round's real hospital
    list just before training starts, so this must be read at call time (not
    import time). Falls back to the standalone default when unset.
    """
    raw = os.environ.get("FEDERATION_NODE_IDS", "")
    return len([node for node in raw.split(",") if node]) or default


def _read_training_rows() -> pd.DataFrame:
    frame = pd.read_csv(DATA_PATH, header=None, names=FEATURE_COLUMNS + ["target"]).replace("?", pd.NA)
    frame = frame.dropna().reset_index(names="_source_row")
    frame["target"] = (frame["target"].astype(float) > 0).astype(int)
    if POOL_PATH.exists():
        pool_rows = pd.read_csv(POOL_PATH, usecols=["_source_row"])
        frame = frame[~frame["_source_row"].isin(pool_rows["_source_row"])]
    return frame.reset_index(drop=True)


def assign_client(source_row: int) -> int:
    return zlib.crc32(str(source_row).encode("utf-8")) % participating_clients()


def _features(
    frame: pd.DataFrame,
    columns: list[str] | None = None,
    means: pd.Series | None = None,
    stds: pd.Series | None = None,
) -> tuple[pd.DataFrame, list[str], pd.Series, pd.Series]:
    values = frame[NUMERIC].astype(float).copy()
    means = values.mean() if means is None else means
    stds = values.std().replace(0, 1) if stds is None else stds
    values = (values - means) / stds
    encoded = pd.get_dummies(frame[CATEGORICAL].astype(str), dtype=float)
    result = pd.concat([values.reset_index(drop=True), encoded.reset_index(drop=True)], axis=1)
    if columns is not None:
        result = result.reindex(columns=columns, fill_value=0)
    return result, list(result.columns), means, stds


def load_client_data(client_id: int, batch_size: int) -> tuple[DataLoader, DataLoader, int]:
    frame = _read_training_rows()
    frame["_client"] = frame["_source_row"].map(assign_client)
    client = frame[frame["_client"] == client_id].sample(frac=1, random_state=42)
    split = int(len(client) * 0.8)
    train_frame, validation_frame = client.iloc[:split], client.iloc[split:]
    columns = _features(frame)[1]
    train_features, _, means, stds = _features(train_frame, columns)
    validation_features, _, _, _ = _features(validation_frame, columns, means, stds)
    train_x = torch.tensor(train_features.to_numpy(), dtype=torch.float32)
    validation_x = torch.tensor(validation_features.to_numpy(), dtype=torch.float32)
    train_y = torch.tensor(train_frame["target"].to_numpy(), dtype=torch.long)
    validation_y = torch.tensor(validation_frame["target"].to_numpy(), dtype=torch.long)
    return (
        DataLoader(TensorDataset(train_x, train_y), batch_size=batch_size, shuffle=True),
        DataLoader(TensorDataset(validation_x, validation_y), batch_size=batch_size),
        train_x.shape[1],
    )


def input_size() -> int:
    return len(_features(_read_training_rows())[1])
