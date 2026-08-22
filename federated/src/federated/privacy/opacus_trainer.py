"""Differential Privacy Training with Opacus for Local Clinical Nodes.

Milestone 5A in the FEDNET Development Sequence:
CENTRAL DATASET -> NON-IID HOSPITAL PARTITIONS -> THREE LOCAL MODELS -> FedAvg ROUND 1 -> OPACUS DP (APOLLO)

Pipeline:
Apollo Local Dataset -> Preprocessing -> ClinicalTabularMLP -> Opacus PrivacyEngine -> DP-SGD -> DP Model Checkpoint

DISCLAIMER:
Experimental ML research algorithm. NOT clinically validated for medical diagnosis.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from opacus import PrivacyEngine
from opacus.validators import ModuleValidator
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

from federated.model.pytorch_baseline import (
    ClinicalTabularMLP,
    evaluate_pytorch_model,
    set_seed,
)
from federated.partitioning.hospital_partition import load_hospital_data
from federated.preprocessing.diabetes import (
    build_preprocessing_pipeline,
    clean_diabetes_data,
)

# Explicit Privacy and Training Configuration
DEFAULT_DELTA: float = 1e-5
DEFAULT_MAX_GRAD_NORM: float = 1.0
DEFAULT_NOISE_MULTIPLIER: float = 0.5
DEFAULT_EPOCHS: int = 10
DEFAULT_BATCH_SIZE: int = 8
DEFAULT_LR: float = 0.01
DEFAULT_WEIGHT_DECAY: float = 1e-3
DEFAULT_SEED: int = 42


def validate_model_for_opacus(model: nn.Module) -> Tuple[bool, List[str]]:
    """Validate whether the PyTorch model architecture is compatible with Opacus DP-SGD."""
    errors = ModuleValidator.validate(model, strict=False)
    is_valid = len(errors) == 0
    error_messages = [str(err) for err in errors]
    return is_valid, error_messages


def train_opacus_dp_hospital(
    hospital_name: str = "apollo",
    hospitals_dir: str = "data/hospitals",
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
    """Train a Differentially Private (DP-SGD) PyTorch model for a single hospital using Opacus."""
    set_seed(random_state)

    # 1. Load ONLY that hospital's private dataset
    df_local = load_hospital_data(hospital_name, base_dir=hospitals_dir)
    X, y, _ = clean_diabetes_data(df_local)

    # 2. Local stratified split
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    # 3. Leakage-safe preprocessing fitted strictly on local X_train
    preprocessor = build_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)

    in_features = X_train_proc.shape[1]

    # Convert to PyTorch tensors and DataLoader
    X_train_t = torch.tensor(X_train_proc, dtype=torch.float32)
    y_train_t = torch.tensor(y_train.values, dtype=torch.float32).unsqueeze(1)

    train_dataset = TensorDataset(X_train_t, y_train_t)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)

    # 4. Initialize fresh PyTorch model & validate with Opacus ModuleValidator
    model = ClinicalTabularMLP(in_features=in_features, hidden_dim1=16, hidden_dim2=8)
    is_valid, validation_errors = validate_model_for_opacus(model)
    if not is_valid:
        model = ModuleValidator.fix(model)

    # Balanced class weighting
    num_pos = float((y_train == 1).sum())
    num_neg = float((y_train == 0).sum())
    pos_weight = torch.tensor([num_neg / max(num_pos, 1.0)], dtype=torch.float32)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)

    # 5. Attach Opacus PrivacyEngine for per-sample clipping and noise injection
    privacy_engine = PrivacyEngine()
    dp_model, dp_optimizer, dp_loader = privacy_engine.make_private(
        module=model,
        optimizer=optimizer,
        data_loader=train_loader,
        noise_multiplier=noise_multiplier,
        max_grad_norm=max_grad_norm,
    )

    # 6. Execute DP-SGD training loop
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

    # 7. Calculate exact cumulative privacy expenditure (epsilon) via Opacus accountant
    epsilon = privacy_engine.get_epsilon(delta=delta)

    # 8. Evaluate on local test set (using underlying module for clean inference)
    eval_model = dp_model._module if hasattr(dp_model, "_module") else dp_model
    metrics = evaluate_pytorch_model(
        model=eval_model,
        X_test_proc=X_test_proc,
        y_test=y_test.values,
    )

    train_info = {
        "hospital_name": hospital_name.capitalize(),
        "total_samples": len(df_local),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "class_distribution": {
            "type_1": int((y == 1).sum()),
            "other": int((y == 0).sum()),
        },
        "train_breakdown": {
            "type_1": int((y_train == 1).sum()),
            "other": int((y_train == 0).sum()),
        },
        "test_breakdown": {
            "type_1": int((y_test == 1).sum()),
            "other": int((y_test == 0).sum()),
        },
        "privacy_parameters": {
            "delta": delta,
            "max_grad_norm": max_grad_norm,
            "noise_multiplier": noise_multiplier,
            "calculated_epsilon": epsilon,
        },
        "training_parameters": {
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "initial_loss": loss_history[0],
            "final_loss": loss_history[-1],
        },
        "metrics": metrics,
    }

    return eval_model, privacy_engine, train_info, loss_history


def run_apollo_dp_experiment(
    hospital_name: str = "apollo",
    hospitals_dir: str = "data/hospitals",
    output_dir: str = "data/processed",
    non_private_metrics_path: str = "data/processed/hospital_local_metrics.json",
    random_state: int = DEFAULT_SEED,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    learning_rate: float = DEFAULT_LR,
    weight_decay: float = DEFAULT_WEIGHT_DECAY,
    max_grad_norm: float = DEFAULT_MAX_GRAD_NORM,
    noise_multiplier: float = DEFAULT_NOISE_MULTIPLIER,
    delta: float = DEFAULT_DELTA,
) -> Dict[str, Any]:
    """Run end-to-end Milestone 5A Opacus experiment on Apollo node and compare against non-private model."""
    print("=" * 75)
    print("  FEDNET MILESTONE 5A: DIFFERENTIAL PRIVACY (OPACUS) — APOLLO NODE")
    print("=" * 75)
    print("\n[NOTE] Privacy Mechanism: DP-SGD with per-sample gradient clipping & calibrated Gaussian noise.")
    print("       Privacy accountant: Opacus RDP / GDP Accountant.\n")

    # Step 1: Model validation check
    test_model = ClinicalTabularMLP(in_features=28, hidden_dim1=16, hidden_dim2=8)
    is_valid, errors = validate_model_for_opacus(test_model)
    print("-" * 75)
    print("OPACUS MODEL VALIDATION")
    print("-" * 75)
    print(f"Architecture:            Linear(28, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)")
    print(f"Opacus Validator Status: {'COMPATIBLE (No architectural fixes needed)' if is_valid else f'FIXED ({errors})'}")

    # Step 2: Privacy parameters display
    print("\n" + "-" * 75)
    print("PRIVACY & TRAINING HYPERPARAMETERS")
    print("-" * 75)
    print(f"Target Delta (delta):    {delta}")
    print(f"Max Gradient Norm (C):   {max_grad_norm}")
    print(f"Noise Multiplier (sigma):{noise_multiplier}")
    print(f"Training Epochs:         {epochs}")
    print(f"Batch Size:              {batch_size}")
    print(f"Learning Rate:           {learning_rate}")
    print(f"Random Seed:             {random_state}")

    # Step 3: Run DP-SGD Training
    eval_model, privacy_engine, train_info, loss_history = train_opacus_dp_hospital(
        hospital_name=hospital_name,
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

    epsilon = train_info["privacy_parameters"]["calculated_epsilon"]
    dp_metrics = train_info["metrics"]
    cm_dp = dp_metrics["confusion_matrix"]

    print("\n" + "-" * 75)
    print("DP-SGD TRAINING CONVERGENCE & PRIVACY ACCOUNTING")
    print("-" * 75)
    print(f"Initial Training Loss:   {loss_history[0]:.4f}")
    print(f"Final Training Loss:     {loss_history[-1]:.4f}")
    print(f"Privacy Budget Expended: epsilon = {epsilon:.4f} at delta = {delta}")

    # Step 4: Load existing Non-Private Apollo metrics for comparison
    np_path = Path(non_private_metrics_path)
    non_private_apollo_metrics = None
    if np_path.is_file():
        with open(np_path, "r", encoding="utf-8") as f:
            h_data = json.load(f)
            non_private_apollo_metrics = (
                h_data.get("hospital_local_results", {})
                .get(hospital_name.lower(), {})
                .get("metrics", None)
            )

    np_acc = non_private_apollo_metrics.get("accuracy", 0.0) if non_private_apollo_metrics else 0.0
    np_prec = non_private_apollo_metrics.get("precision", 0.0) if non_private_apollo_metrics else 0.0
    np_rec = non_private_apollo_metrics.get("recall", 0.0) if non_private_apollo_metrics else 0.0
    np_f1 = non_private_apollo_metrics.get("f1_score", 0.0) if non_private_apollo_metrics else 0.0
    np_roc = non_private_apollo_metrics.get("roc_auc", 0.0) if non_private_apollo_metrics else 0.0
    np_cm = non_private_apollo_metrics.get("confusion_matrix", [[0, 0], [0, 0]]) if non_private_apollo_metrics else [[0, 0], [0, 0]]

    # Step 5: Side-by-Side Comparison Table (Privacy / Utility Trade-off)
    print("\n" + "-" * 75)
    print("SIDE-BY-SIDE COMPARISON: NON-PRIVATE vs OPACUS DIFFERENTIAL PRIVACY (APOLLO)")
    print("-" * 75)
    print(f"  {'Metric':<18} | {'Non-Private Apollo':<20} | {'Opacus DP (Apollo)':<20}")
    print(f"  {'-'*18} | {'-'*20} | {'-'*20}")
    print(f"  {'Accuracy':<18} | {np_acc:<20.4f} | {dp_metrics['accuracy']:<20.4f}")
    print(f"  {'Precision':<18} | {np_prec:<20.4f} | {dp_metrics['precision']:<20.4f}")
    print(f"  {'Recall':<18} | {np_rec:<20.4f} | {dp_metrics['recall']:<20.4f}")
    print(f"  {'F1 Score':<18} | {np_f1:<20.4f} | {dp_metrics['f1_score']:<20.4f}")
    print(f"  {'ROC-AUC':<18} | {np_roc:<20.4f} | {dp_metrics['roc_auc']:<20.4f}")
    print(f"  {'Epsilon':<18} | {'Infinity (No DP)':<20} | {epsilon:<20.4f}")
    print(f"  {'Delta':<18} | {'0.0':<20} | {delta:<20.4e}")


    print("\n  Confusion Matrices (Apollo Local Test Set, N=8):")
    print(f"    Non-Private Apollo: TN={np_cm[0][0]}, FP={np_cm[0][1]}, FN={np_cm[1][0]}, TP={np_cm[1][1]}")
    print(f"    Opacus DP Apollo:   TN={cm_dp[0][0]}, FP={cm_dp[0][1]}, FN={cm_dp[1][0]}, TP={cm_dp[1][1]}")

    # Step 6: Save Artifacts
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = out_dir / "apollo_dp_metrics.json"
    model_path = out_dir / "apollo_dp_model.pt"

    results = {
        "milestone": "Milestone 5A: Differential Privacy with Opacus (Apollo Node)",
        "hospital": hospital_name.capitalize(),
        "privacy_parameters": train_info["privacy_parameters"],
        "training_parameters": train_info["training_parameters"],
        "cohort_summary": {
            "total_samples": train_info["total_samples"],
            "train_samples": train_info["train_samples"],
            "test_samples": train_info["test_samples"],
            "class_distribution": train_info["class_distribution"],
        },
        "dp_metrics": dp_metrics,
        "comparison_with_non_private": {
            "non_private": {
                "accuracy": np_acc,
                "precision": np_prec,
                "recall": np_rec,
                "f1_score": np_f1,
                "roc_auc": np_roc,
                "confusion_matrix": np_cm,
                "epsilon": "Infinity",
                "delta": 0.0,
            },
            "opacus_dp": {
                "accuracy": dp_metrics["accuracy"],
                "precision": dp_metrics["precision"],
                "recall": dp_metrics["recall"],
                "f1_score": dp_metrics["f1_score"],
                "roc_auc": dp_metrics["roc_auc"],
                "confusion_matrix": cm_dp,
                "epsilon": epsilon,
                "delta": delta,
            },
        },
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    torch.save(
        {
            "hospital": hospital_name.capitalize(),
            "model_state_dict": eval_model.state_dict(),
            "in_features": 28,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "privacy_parameters": train_info["privacy_parameters"],
            "metrics": dp_metrics,
        },
        model_path,
    )

    print("\n" + "=" * 75)
    print(f"  Artifacts saved successfully:")
    print(f"  - Apollo DP Metrics JSON: {metrics_path.resolve()}")
    print(f"  - Apollo DP Model:        {model_path.resolve()}")
    print("=" * 75)

    return results


def run_all_hospitals_dp_experiment(
    hospitals_dir: str = "data/hospitals",
    output_dir: str = "data/processed",
    non_private_metrics_path: str = "data/processed/hospital_local_metrics.json",
    random_state: int = DEFAULT_SEED,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    learning_rate: float = DEFAULT_LR,
    weight_decay: float = DEFAULT_WEIGHT_DECAY,
    max_grad_norm: float = DEFAULT_MAX_GRAD_NORM,
    noise_multiplier: float = DEFAULT_NOISE_MULTIPLIER,
    delta: float = DEFAULT_DELTA,
) -> Dict[str, Any]:
    """Run independent Opacus DP-SGD training across all three hospital nodes: Apollo, KEM, and Fortis."""
    print("=" * 80)
    print("  FEDNET MILESTONE 5B: INDEPENDENT DIFFERENTIAL PRIVACY (OPACUS) — ALL 3 NODES")
    print("  Participating Clinical Nodes: Apollo, KEM, Fortis")
    print("=" * 80)
    print("\n[NOTE] Privacy Mechanism: DP-SGD with per-sample gradient clipping & calibrated Gaussian noise.")
    print("       Privacy accountant: Opacus RDP / GDP Accountant independently per hospital.\n")

    # Step 1: Model validation check
    test_model = ClinicalTabularMLP(in_features=28, hidden_dim1=16, hidden_dim2=8)
    is_valid, errors = validate_model_for_opacus(test_model)
    print("-" * 80)
    print("OPACUS MODEL VALIDATION")
    print("-" * 80)
    print(f"Architecture:            Linear(28, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)")
    print(f"Opacus Validator Status: {'COMPATIBLE (No architectural fixes needed)' if is_valid else f'FIXED ({errors})'}")

    print("\n" + "-" * 80)
    print("SHARED PRIVACY & TRAINING HYPERPARAMETERS")
    print("-" * 80)
    print(f"Target Delta (delta):    {delta}")
    print(f"Max Gradient Norm (C):   {max_grad_norm}")
    print(f"Noise Multiplier (sigma):{noise_multiplier}")
    print(f"Training Epochs:         {epochs}")
    print(f"Batch Size:              {batch_size}")
    print(f"Learning Rate:           {learning_rate}")
    print(f"Random Seed:             {random_state}")

    # Load non-private metrics for comparison
    np_path = Path(non_private_metrics_path)
    non_private_data = {}
    if np_path.is_file():
        with open(np_path, "r", encoding="utf-8") as f:
            h_data = json.load(f)
            non_private_data = h_data.get("hospital_local_results", {})

    hospital_dp_results = {}
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    hospital_names = ["apollo", "kem", "fortis"]

    for name in hospital_names:
        print("\n" + "-" * 80)
        print(f"RUNNING INDEPENDENT DP-SGD TRAINING: {name.upper()}")
        print("-" * 80)

        eval_model, privacy_engine, train_info, loss_history = train_opacus_dp_hospital(
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

        eps = train_info["privacy_parameters"]["calculated_epsilon"]
        m = train_info["metrics"]
        cm = m["confusion_matrix"]

        # Fetch matching non-private metrics
        np_h = non_private_data.get(name, {}).get("metrics", {})
        np_acc = np_h.get("accuracy", 0.0)
        np_prec = np_h.get("precision", 0.0)
        np_rec = np_h.get("recall", 0.0)
        np_f1 = np_h.get("f1_score", 0.0)
        np_roc = np_h.get("roc_auc", 0.0)
        np_cm = np_h.get("confusion_matrix", [[0, 0], [0, 0]])

        print(f"[{name.upper()}] Training Complete:")
        print(f"  Samples: Total={train_info['total_samples']} | Train={train_info['train_samples']} (T1:{train_info['train_breakdown']['type_1']}, Other:{train_info['train_breakdown']['other']}) | Test={train_info['test_samples']} (T1:{train_info['test_breakdown']['type_1']}, Other:{train_info['test_breakdown']['other']})")
        print(f"  Loss: Initial={loss_history[0]:.4f} -> Final={loss_history[-1]:.4f}")
        print(f"  Opacus Expended Epsilon: epsilon = {eps:.4f} at delta = {delta}")
        print(f"  Accuracy:         {m['accuracy']:.4f} ({m['accuracy']*100:.2f}%)")
        print(f"  Precision:        {m['precision']:.4f}")
        print(f"  Recall:           {m['recall']:.4f}")
        print(f"  F1 Score:         {m['f1_score']:.4f}")
        print(f"  ROC-AUC:          {m['roc_auc']:.4f}")
        print(f"  Confusion Matrix: [[TN={cm[0][0]}, FP={cm[0][1]}], [FN={cm[1][0]}, TP={cm[1][1]}]]")

        h_result = {
            "hospital": name.capitalize(),
            "cohort_summary": {
                "total_samples": train_info["total_samples"],
                "train_samples": train_info["train_samples"],
                "test_samples": train_info["test_samples"],
                "class_distribution": train_info["class_distribution"],
                "train_breakdown": train_info["train_breakdown"],
                "test_breakdown": train_info["test_breakdown"],
            },
            "privacy_parameters": train_info["privacy_parameters"],
            "training_parameters": train_info["training_parameters"],
            "dp_metrics": m,
            "comparison_with_non_private": {
                "non_private": {
                    "accuracy": np_acc,
                    "precision": np_prec,
                    "recall": np_rec,
                    "f1_score": np_f1,
                    "roc_auc": np_roc,
                    "confusion_matrix": np_cm,
                    "epsilon": "Infinity",
                    "delta": 0.0,
                },
                "opacus_dp": {
                    "accuracy": m["accuracy"],
                    "precision": m["precision"],
                    "recall": m["recall"],
                    "f1_score": m["f1_score"],
                    "roc_auc": m["roc_auc"],
                    "confusion_matrix": cm,
                    "epsilon": eps,
                    "delta": delta,
                },
            },
        }
        hospital_dp_results[name] = h_result

        # Save individual hospital JSON & PT checkpoint
        h_metrics_path = out_dir / f"{name}_dp_metrics.json"
        h_model_path = out_dir / f"{name}_dp_model.pt"

        with open(h_metrics_path, "w", encoding="utf-8") as f:
            json.dump(h_result, f, indent=2)

        torch.save(
            {
                "hospital": name.capitalize(),
                "model_state_dict": eval_model.state_dict(),
                "in_features": 28,
                "hidden_dim1": 16,
                "hidden_dim2": 8,
                "privacy_parameters": train_info["privacy_parameters"],
                "metrics": m,
            },
            h_model_path,
        )

    # Step 4: Summary Table Across All 3 Hospitals
    print("\n" + "-" * 80)
    print("CROSS-HOSPITAL DIFFERENTIAL PRIVACY SUMMARY & COMPARISON")
    print("-" * 80)
    print(f"  {'Hospital':<10} | {'Type':<12} | {'Accuracy':<10} | {'Precision':<10} | {'Recall':<10} | {'F1 Score':<10} | {'ROC-AUC':<10} | {'Epsilon':<10}")
    print(f"  {'-'*10} | {'-'*12} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*10}")

    for name in hospital_names:
        r = hospital_dp_results[name]["comparison_with_non_private"]
        np_m = r["non_private"]
        dp_m = r["opacus_dp"]
        print(f"  {name.upper():<10} | {'Non-Private':<12} | {np_m['accuracy']:<10.4f} | {np_m['precision']:<10.4f} | {np_m['recall']:<10.4f} | {np_m['f1_score']:<10.4f} | {np_m['roc_auc']:<10.4f} | {'Infinity':<10}")
        print(f"  {name.upper():<10} | {'Opacus DP':<12} | {dp_m['accuracy']:<10.4f} | {dp_m['precision']:<10.4f} | {dp_m['recall']:<10.4f} | {dp_m['f1_score']:<10.4f} | {dp_m['roc_auc']:<10.4f} | {dp_m['epsilon']:<10.4f}")
        print(f"  {'-'*10} | {'-'*12} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*10}")

    # Save combined all_hospitals_dp_metrics.json
    all_metrics_path = out_dir / "all_hospitals_dp_metrics.json"
    combined_summary = {
        "milestone": "Milestone 5B: Independent Differentially Private Local Training for All 3 Hospitals",
        "privacy_configuration": {
            "delta": delta,
            "max_grad_norm": max_grad_norm,
            "noise_multiplier": noise_multiplier,
            "epochs": epochs,
            "batch_size": batch_size,
            "seed": random_state,
        },
        "hospitals": hospital_dp_results,
    }
    with open(all_metrics_path, "w", encoding="utf-8") as f:
        json.dump(combined_summary, f, indent=2)

    print("\n" + "=" * 80)
    print("  Artifacts saved successfully:")
    for name in hospital_names:
        print(f"  - {name.capitalize()} DP Metrics JSON:  {out_dir / f'{name}_dp_metrics.json'}")
        print(f"  - {name.capitalize()} DP Model Checkpoint: {out_dir / f'{name}_dp_model.pt'}")
    print(f"  - Combined Summary JSON:    {all_metrics_path.resolve()}")
    print("=" * 80)

    return combined_summary


if __name__ == "__main__":
    run_all_hospitals_dp_experiment()

