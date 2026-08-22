"""Differential Privacy Training with Opacus for Local COVID-19 Clinical Nodes.

Multi-center DP-SGD Training across 41 simulated hospital nodes:
- Opacus PrivacyEngine with per-sample gradient clipping (C=1.0) and Gaussian noise (sigma=0.5)
- Exact epsilon calculation using PRV accountant per client
- Saves data/processed/covid_mortality_dp_metrics.json

DISCLAIMER:
Experimental machine learning research algorithm. NOT clinically validated for medical diagnosis.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from opacus import PrivacyEngine
from opacus.validators import ModuleValidator
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

from federated.model.covid_baseline import (
    CovidMortalityMLP,
    evaluate_covid_model,
    set_seed,
)
from federated.partitioning.covid_hospital_partition import (
    create_covid_hospital_partitions,
    load_covid_hospital_data,
    save_covid_hospital_partitions,
)
from federated.preprocessing.covid import (
    COVID_LEAKAGE_EXCLUDED_FEATURES,
    SELECTED_18_FEATURES,
    build_covid_preprocessing_pipeline,
    clean_covid_data,
    prepare_covid_train_test_data,
)

# Standardized Privacy and Training Configuration
DEFAULT_DELTA: float = 1e-5
DEFAULT_MAX_GRAD_NORM: float = 1.0
DEFAULT_NOISE_MULTIPLIER: float = 0.5
DEFAULT_EPOCHS: int = 10
DEFAULT_BATCH_SIZE: int = 8
DEFAULT_LR: float = 0.01
DEFAULT_WEIGHT_DECAY: float = 1e-3
DEFAULT_SEED: int = 42


def validate_covid_model_for_opacus(model: nn.Module) -> Tuple[bool, List[str]]:
    """Validate whether the PyTorch model architecture is compatible with Opacus DP-SGD."""
    errors = ModuleValidator.validate(model, strict=False)
    is_valid = len(errors) == 0
    error_messages = [str(err) for err in errors]
    return is_valid, error_messages


def train_opacus_dp_covid_hospital(
    hospital_name: str,
    hospitals_dir: str = "data/covid_hospitals",
    test_size: float = 0.2,
    random_state: int = DEFAULT_SEED,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    learning_rate: float = DEFAULT_LR,
    weight_decay: float = DEFAULT_WEIGHT_DECAY,
    max_grad_norm: float = DEFAULT_MAX_GRAD_NORM,
    noise_multiplier: float = DEFAULT_NOISE_MULTIPLIER,
    delta: float = DEFAULT_DELTA,
) -> Tuple[nn.Module, PrivacyEngine, Dict[str, Any], List[float]]:
    """Train a Differentially Private (DP-SGD) PyTorch model for a single COVID hospital."""
    set_seed(random_state)

    # 1. Load private dataset
    df_local = load_covid_hospital_data(hospital_name, base_dir=hospitals_dir)
    X, y, df_dedup, _ = clean_covid_data(df_local)

    # 2. Local train/test split (if sufficient samples, else train-only with fallback)
    has_both_classes = len(y.unique()) > 1
    can_stratify = has_both_classes and (y == 1).sum() >= 2 and (y == 0).sum() >= 2 and len(y) >= 5

    if can_stratify:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y
        )
    elif len(y) >= 5:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state
        )
    else:
        # Small node: train on all, evaluate on all
        X_train, X_test, y_train, y_test = X.copy(), X.copy(), y.copy(), y.copy()

    # 3. Leak-free preprocessing fit on X_train
    preprocessor = build_covid_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)
    in_features = X_train_proc.shape[1]

    # Convert to PyTorch tensors and DataLoader
    X_train_t = torch.tensor(X_train_proc, dtype=torch.float32)
    y_train_t = torch.tensor(y_train.values, dtype=torch.float32).unsqueeze(1)

    train_dataset = TensorDataset(X_train_t, y_train_t)
    actual_batch_size = int(min(batch_size, len(X_train)))
    train_loader = DataLoader(train_dataset, batch_size=actual_batch_size, shuffle=True)

    # 4. Initialize model
    model = CovidMortalityMLP(in_features=in_features, hidden_dim1=16, hidden_dim2=8)
    model.train()
    is_valid, validation_errors = validate_covid_model_for_opacus(model)
    if not is_valid:
        model = ModuleValidator.fix(model)


    # Class weighting
    num_pos = float((y_train == 1).sum())
    num_neg = float((y_train == 0).sum())
    pos_weight = torch.tensor([num_neg / max(num_pos, 1.0)], dtype=torch.float32) if num_pos > 0 else torch.tensor([1.0], dtype=torch.float32)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)

    # 5. Attach Opacus PrivacyEngine
    privacy_engine = PrivacyEngine()
    dp_model, dp_optimizer, dp_loader = privacy_engine.make_private(
        module=model,
        optimizer=optimizer,
        data_loader=train_loader,
        noise_multiplier=noise_multiplier,
        max_grad_norm=max_grad_norm,
    )

    # 6. DP-SGD training loop
    loss_history: List[float] = []
    for epoch in range(epochs):
        dp_model.train()
        epoch_loss = 0.0
        for batch_x, batch_y in dp_loader:
            dp_optimizer.zero_grad()
            logits = dp_model(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            dp_optimizer.step()
            epoch_loss += loss.item() * len(batch_x)

        epoch_loss /= len(train_dataset)
        loss_history.append(epoch_loss)

    # 7. Privacy expenditure calculation
    epsilon = privacy_engine.get_epsilon(delta=delta)

    # 8. Evaluate on local test partition
    eval_model = dp_model._module if hasattr(dp_model, "_module") else dp_model
    metrics = evaluate_covid_model(
        model=eval_model,
        X_test_proc=X_test_proc,
        y_test=y_test.values,
    )

    train_info: Dict[str, Any] = {
        "hospital_name": hospital_name,
        "total_samples": len(df_local),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "class_distribution": {
            "deaths": int((y == 1).sum()),
            "non_deaths": int((y == 0).sum()),
        },
        "privacy_parameters": {
            "delta": delta,
            "max_grad_norm": max_grad_norm,
            "noise_multiplier": noise_multiplier,
            "calculated_epsilon": float(epsilon),
        },
        "training_parameters": {
            "epochs": epochs,
            "batch_size": actual_batch_size,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "initial_loss": float(loss_history[0]),
            "final_loss": float(loss_history[-1]),
        },
        "metrics": metrics,
    }

    return eval_model, privacy_engine, train_info, loss_history


def run_all_covid_hospitals_dp_experiment(
    raw_data_path: str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
    hospitals_dir: str = "data/covid_hospitals",
    output_dir: str = "data/processed",
    random_state: int = DEFAULT_SEED,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    learning_rate: float = DEFAULT_LR,
    weight_decay: float = DEFAULT_WEIGHT_DECAY,
    max_grad_norm: float = DEFAULT_MAX_GRAD_NORM,
    noise_multiplier: float = DEFAULT_NOISE_MULTIPLIER,
    delta: float = DEFAULT_DELTA,
) -> Dict[str, Any]:
    """Execute Differentially Private (DP-SGD) training across all 41 COVID hospital nodes."""
    print("=" * 80)
    print("  FEDNET MODEL #2: DIFFERENTIAL PRIVACY (DP-SGD) ACROSS ALL 41 COVID HOSPITALS")
    print("=" * 80)

    # 1. Partition dataset across 41 hospitals and save partitions
    hospital_dfs, partition_summary = create_covid_hospital_partitions(
        raw_data_path=raw_data_path,
        random_state=random_state,
    )
    save_covid_hospital_partitions(hospital_dfs, base_dir=hospitals_dir)

    print(f"Total Hospitals:         {len(hospital_dfs)}")
    print(f"Total Partitioned Rows:  {partition_summary['total_partitioned_patients']}")
    print(f"Target Delta (delta):    {delta}")
    print(f"Max Gradient Norm (C):   {max_grad_norm}")
    print(f"Noise Multiplier (sigma):{noise_multiplier}")
    print(f"Local DP-SGD Config:     Epochs={epochs}, BatchSize={batch_size}, LR={learning_rate}, Seed={random_state}\n")

    # Global Benchmark Test Partition for evaluation
    _, _, _, _, _, df_test_global, _ = prepare_covid_train_test_data(
        filepath=raw_data_path, test_size=0.2, random_state=random_state
    )

    all_hospital_results: Dict[str, Any] = {}
    hospital_epsilons: Dict[str, float] = {}

    for name in hospital_dfs.keys():
        eval_model, privacy_engine, train_info, _ = train_opacus_dp_covid_hospital(
            hospital_name=name,
            hospitals_dir=hospitals_dir,
            test_size=0.2,
            random_state=random_state,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            weight_decay=weight_decay,
            max_grad_norm=max_grad_norm,
            noise_multiplier=noise_multiplier,
            delta=delta,
        )

        all_hospital_results[name] = train_info
        hospital_epsilons[name] = train_info["privacy_parameters"]["calculated_epsilon"]

    eps_vals = list(hospital_epsilons.values())
    min_eps = float(min(eps_vals))
    max_eps = float(max(eps_vals))
    mean_eps = float(np.mean(eps_vals))

    print("-" * 80)
    print("LOCAL DIFFERENTIAL PRIVACY SUMMARY (41 HOSPITALS)")
    print("-" * 80)
    print(f"  Minimum Epsilon:       {min_eps:.4f}")
    print(f"  Maximum Epsilon:       {max_eps:.4f}")
    print(f"  Mean Epsilon:          {mean_eps:.4f}")
    print(f"  Fixed Delta:           {delta}")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    dp_metrics_path = out_dir / "covid_mortality_dp_metrics.json"

    results = {
        "experiment": "COVID-19 41-Hospital Local Differential Privacy (DP-SGD)",
        "privacy_parameters": {
            "delta": delta,
            "max_grad_norm": max_grad_norm,
            "noise_multiplier": noise_multiplier,
            "min_epsilon": min_eps,
            "max_epsilon": max_eps,
            "mean_epsilon": mean_eps,
        },
        "training_parameters": {
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "random_state": random_state,
        },
        "total_hospitals": len(hospital_dfs),
        "hospital_epsilons": hospital_epsilons,
        "hospital_metrics": all_hospital_results,
    }

    with open(dp_metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nArtifact saved successfully: {dp_metrics_path.resolve()}\n")
    return results


if __name__ == "__main__":
    run_all_covid_hospitals_dp_experiment()
