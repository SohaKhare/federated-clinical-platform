"""Model definitions and baseline training for the Federated Clinical Platform."""

import torch
from torch import nn


class ClinicalModel(nn.Module):
    """Small tabular classifier used by the active heart-disease demo."""

    def __init__(self, input_size: int) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, 32),
            nn.ReLU(),
            nn.Linear(32, 2),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.network(features)


def build_baseline_model(*args, **kwargs):
    from federated.model.baseline import build_baseline_model as _build
    return _build(*args, **kwargs)


def train_and_evaluate_baseline(*args, **kwargs):
    from federated.model.baseline import train_and_evaluate_baseline as _train
    return _train(*args, **kwargs)


def run_pytorch_baseline_experiment(*args, **kwargs):
    from federated.model.pytorch_baseline import run_pytorch_baseline_experiment as _run
    return _run(*args, **kwargs)


def run_hospital_simulation_experiment(*args, **kwargs):
    from federated.model.local_trainer import run_hospital_simulation_experiment as _run
    return _run(*args, **kwargs)



__all__ = [
    "build_baseline_model",
    "train_and_evaluate_baseline",
    "run_pytorch_baseline_experiment",
    "run_hospital_simulation_experiment",
]


