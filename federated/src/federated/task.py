from __future__ import annotations

import zlib
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset


DATA_PATH = Path(__file__).parents[2] / "data" / "Healthcare_dataset.csv"
POOL_PATH = Path(__file__).parents[2] / "data" / "presentation_pool.csv"
CLIENT_COUNT = 3
TARGET = "Test Results"
CATEGORICAL = [
    "Gender",
    "Blood Type",
    "Medical Condition",
    "Admission Type",
    "Medication",
    "Insurance Provider",
]
NUMERIC = ["Age", "Billing Amount", "Room Number", "Length of Stay"]
LABELS = {"Abnormal": 0, "Inconclusive": 1, "Normal": 2}


@dataclass
class ClientData:
    train: TensorDataset
    validation: TensorDataset


def _read_training_rows() -> pd.DataFrame:
    frame = pd.read_csv(DATA_PATH)
    frame["_source_row"] = frame.index
    if POOL_PATH.exists():
        pool_rows = pd.read_csv(POOL_PATH, usecols=["_source_row"])
        frame = frame[~frame["_source_row"].isin(pool_rows["_source_row"])]
    return frame.reset_index(drop=True)


def _features(
    frame: pd.DataFrame,
    columns: list[str] | None = None,
    means: pd.Series | None = None,
    stds: pd.Series | None = None,
) -> tuple[pd.DataFrame, list[str], pd.Series, pd.Series]:
    dates = pd.to_datetime(frame["Date of Admission"])
    discharge = pd.to_datetime(frame["Discharge Date"])
    values = frame[NUMERIC[:-1]].copy()
    values["Length of Stay"] = (discharge - dates).dt.days.clip(lower=0)
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
    frame["_client"] = frame["Hospital"].map(
        lambda hospital: zlib.crc32(hospital.encode("utf-8")) % CLIENT_COUNT
    )
    client = frame[frame["_client"] == client_id].sample(frac=1, random_state=42)
    split = int(len(client) * 0.8)
    train_frame, validation_frame = client.iloc[:split], client.iloc[split:]

    train_features, columns, means, stds = _features(train_frame)
    validation_features, _, _, _ = _features(validation_frame, columns, means, stds)
    train_x = torch.tensor(train_features.to_numpy(), dtype=torch.float32)
    validation_x = torch.tensor(validation_features.to_numpy(), dtype=torch.float32)
    train_y = torch.tensor(train_frame[TARGET].map(LABELS).to_numpy(), dtype=torch.long)
    validation_y = torch.tensor(validation_frame[TARGET].map(LABELS).to_numpy(), dtype=torch.long)

    return (
        DataLoader(TensorDataset(train_x, train_y), batch_size=batch_size, shuffle=True),
        DataLoader(TensorDataset(validation_x, validation_y), batch_size=batch_size),
        train_x.shape[1],
    )


def input_size() -> int:
    return _features(_read_training_rows())[0].shape[1]
