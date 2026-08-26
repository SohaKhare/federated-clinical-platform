from __future__ import annotations

import json
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


# federated.service writes FEDERATION_NODE_IDS/FEDERATION_PATIENTS_BY_PARTITION
# just before a run starts. This MUST be os.environ, not a plain module
# global: Flower's ClientApp (assign_client/load_client_data below) runs
# inside Ray's ClientAppActor, a *separate OS process* from the HTTP server —
# env vars are inherited by that child process, a Python global set at
# runtime in the parent is not (the actor re-imports this module fresh and
# never sees it). Confirmed live: switching this to a module-level dict
# silently made every ClientApp call see an empty/default context, since
# ServerApp (same-process thread) worked fine but ClientApp (separate
# process) didn't.
def participating_clients(default: int = 3) -> int:
    """Number of simulated hospital clients for this run.

    Read at call time (not import time) since it depends on FEDERATION_NODE_IDS,
    which federated.service sets just before training starts. Falls back to
    the standalone default when unset.
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


def _real_rows_for_client(client_id: int) -> pd.DataFrame | None:
    patients_by_partition = json.loads(os.environ.get("FEDERATION_PATIENTS_BY_PARTITION", "{}"))
    patients = patients_by_partition.get(str(client_id))
    if not patients:
        return None

    rows = []
    for patient in patients:
        sex = str(patient.get("sex", "M")).lower()
        symptoms = [str(symptom).lower() for symptom in patient.get("symptoms", [])]
        conditions = patient.get("health_conditions") or {}
        rows.append({
            "age": float(patient.get("age", 0)),
            "sex": "1" if sex in ("m", "male", "1") else "0",
            "cp": "4" if any("chest" in symptom for symptom in symptoms) else "1",
            "trestbps": float(conditions.get("trestbps", 120)),
            "chol": float(conditions.get("chol", 200)),
            "fbs": "1" if conditions.get("fbs") in (1, "1", True) else "0",
            "restecg": str(conditions.get("restecg", "0")),
            "thalach": float(conditions.get("thalach", 150)),
            "exang": "1" if conditions.get("exang") in (1, "1", True) else "0",
            "oldpeak": float(conditions.get("oldpeak", 0)),
            "slope": str(conditions.get("slope", "1")),
            "ca": str(conditions.get("ca", "0")),
            "thal": str(conditions.get("thal", "3")),
            "target": 1 if patient.get("diagnosed_diseases") else 0,
        })

    return pd.DataFrame(rows)


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

    real_rows = _real_rows_for_client(client_id)
    if real_rows is not None:
        train_frame = pd.concat([train_frame, real_rows], ignore_index=True)

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
