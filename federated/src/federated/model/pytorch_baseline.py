"""PyTorch Tabular Baseline MLP for Centralized Binary Diabetes Classification.

Milestone 2 in the FEDNET Development Sequence:
DATA -> CLEANING -> CENTRALIZED BASELINE -> PYTORCH MODEL

DISCLAIMER:
This is an experimental machine learning baseline developed strictly for research
and validation purposes within the FEDNET project. It is NOT clinically validated
and must NOT be used as a medical diagnostic system.
"""

import json
from pathlib import Path
from typing import Any, Dict, Tuple

import joblib
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader, TensorDataset

from federated.preprocessing.diabetes import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    NUMERICAL_FEATURES,
    build_preprocessing_pipeline,
    load_raw_data,
    prepare_train_test_data,
)


class ClinicalTabularMLP(nn.Module):
    """Small Tabular Multi-Layer Perceptron (MLP) for clinical diabetes classification.

    Designed with regularization and compact layer sizes tailored for small tabular cohorts.
    """

    def __init__(
        self,
        in_features: int = 28,
        hidden_dim1: int = 16,
        hidden_dim2: int = 8,
    ) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(in_features, hidden_dim1),
            nn.ReLU(),
            nn.Linear(hidden_dim1, hidden_dim2),
            nn.ReLU(),
            nn.Linear(hidden_dim2, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass returning unscaled raw logits."""
        return self.network(x)


def set_seed(seed: int = 42) -> None:
    """Set global seeds for full reproducibility across torch, numpy, and python."""
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)


def train_pytorch_baseline(
    X_train_proc: np.ndarray,
    y_train: np.ndarray,
    in_features: int = 28,
    hidden_dim1: int = 16,
    hidden_dim2: int = 8,
    epochs: int = 100,
    batch_size: int = 16,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
    seed: int = 42,
) -> Tuple[ClinicalTabularMLP, list]:
    """Train the ClinicalTabularMLP on preprocessed training data."""
    set_seed(seed)

    X_train_t = torch.tensor(X_train_proc, dtype=torch.float32)
    y_train_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)

    dataset = TensorDataset(X_train_t, y_train_t)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model = ClinicalTabularMLP(
        in_features=in_features,
        hidden_dim1=hidden_dim1,
        hidden_dim2=hidden_dim2,
    )

    # Balanced class weighting matching logistic regression's balanced weighting
    num_pos = float((y_train == 1).sum())
    num_neg = float((y_train == 0).sum())
    pos_weight = torch.tensor([num_neg / max(num_pos, 1.0)], dtype=torch.float32)

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)

    loss_history = []
    for epoch in range(epochs):
        model.train()
        epoch_loss = 0.0
        for batch_x, batch_y in loader:
            optimizer.zero_grad()
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * len(batch_x)

        epoch_loss /= len(dataset)
        loss_history.append(epoch_loss)

    return model, loss_history


def evaluate_pytorch_model(
    model: ClinicalTabularMLP,
    X_test_proc: np.ndarray,
    y_test: np.ndarray,
) -> Dict[str, Any]:
    """Evaluate the trained PyTorch model on the test split."""
    model.eval()
    X_test_t = torch.tensor(X_test_proc, dtype=torch.float32)

    with torch.no_grad():
        logits = model(X_test_t)
        probs = torch.sigmoid(logits).cpu().numpy().flatten()
        preds = (probs >= 0.5).astype(int)

    acc = float(accuracy_score(y_test, preds))
    prec = float(precision_score(y_test, preds, zero_division=0))
    rec = float(recall_score(y_test, preds, zero_division=0))
    f1 = float(f1_score(y_test, preds, zero_division=0))
    roc_auc = float(roc_auc_score(y_test, probs))
    cm = confusion_matrix(y_test, preds).tolist()

    return {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "roc_auc": roc_auc,
        "confusion_matrix": cm,
        "probabilities": probs.tolist(),
        "predictions": preds.tolist(),
    }


def run_pytorch_baseline_experiment(
    data_path: str = "data/raw/diabetes.csv",
    output_dir: str = "data/processed",
    test_size: float = 0.2,
    random_state: int = 42,
    epochs: int = 100,
    batch_size: int = 16,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
) -> Dict[str, Any]:
    """Execute end-to-end PyTorch tabular baseline experiment and compare with Logistic Regression."""
    print("=" * 70)
    print("  FEDNET MILESTONE 2: PYTORCH TABULAR BASELINE EXPERIMENT")
    print("  Target: Type 1 Diabetes (clv9=1) vs Other Diabetes Types (clv9!=1)")
    print("=" * 70)
    print("\n[NOTE] Experimental ML baseline strictly for clinical ML research.\n")

    # Step 1: Load and split raw dataset
    df_raw = load_raw_data(data_path)
    X_train, X_test, y_train, y_test, missing_counts = prepare_train_test_data(
        filepath=data_path,
        test_size=test_size,
        random_state=random_state,
    )

    # Step 2: Fit preprocessing pipeline ONLY on X_train (Zero Data Leakage)
    preprocessor = build_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)

    total_samples = len(df_raw)
    total_features = len(FEATURE_COLUMNS)
    encoded_features = X_train_proc.shape[1]
    type1_count = int((df_raw["clv9"] == 1).sum())
    other_count = int((df_raw["clv9"] != 1).sum())
    train_count = len(X_train)
    test_count = len(X_test)

    print("-" * 70)
    print("DATASET & PREPROCESSING CHARACTERISTICS")
    print("-" * 70)
    print(f"Dataset Shape:           {df_raw.shape[0]} rows x {df_raw.shape[1]} columns")
    print(f"Features (Original):     {total_features} (11 numerical, 7 categorical)")
    print(f"Features (After OneHot): {encoded_features} encoded input features")
    print(f"Class Distribution:      Type 1 (Class 1)={type1_count} ({type1_count / total_samples * 100:.1f}%), Other (Class 0)={other_count} ({other_count / total_samples * 100:.1f}%)")
    print(f"Stratified Split:        Train={train_count} (T1: {(y_train == 1).sum()}, Other: {(y_train == 0).sum()}) | Test={test_count} (T1: {(y_test == 1).sum()}, Other: {(y_test == 0).sum()})")

    # Step 3: Train PyTorch Tabular MLP
    print("\n" + "-" * 70)
    print("PYTORCH MODEL ARCHITECTURE & HYPERPARAMETERS")
    print("-" * 70)
    print(f"Architecture:            Linear({encoded_features}, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)")
    print(f"Optimizer & Loss:        AdamW(lr={learning_rate}, weight_decay={weight_decay}), BCEWithLogitsLoss(pos_weight=balanced)")
    print(f"Training Config:         Epochs={epochs}, BatchSize={batch_size}, Seed={random_state}")

    model, loss_history = train_pytorch_baseline(
        X_train_proc=X_train_proc,
        y_train=y_train.values,
        in_features=encoded_features,
        hidden_dim1=16,
        hidden_dim2=8,
        epochs=epochs,
        batch_size=batch_size,
        learning_rate=learning_rate,
        weight_decay=weight_decay,
        seed=random_state,
    )

    print(f"Training Complete:       Initial Loss = {loss_history[0]:.4f} -> Final Loss = {loss_history[-1]:.4f}")

    # Step 4: Evaluate on test set
    pt_metrics = evaluate_pytorch_model(
        model=model,
        X_test_proc=X_test_proc,
        y_test=y_test.values,
    )

    # Step 5: Load existing Logistic Regression baseline metrics for comparison
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    lr_metrics_path = out_dir / "baseline_metrics.json"

    lr_metrics = None
    if lr_metrics_path.is_file():
        with open(lr_metrics_path, "r", encoding="utf-8") as f:
            lr_data = json.load(f)
            lr_metrics = lr_data.get("metrics", {})

    print("\n" + "-" * 70)
    print("SIDE-BY-SIDE COMPARISON: LOGISTIC REGRESSION vs PYTORCH MLP")
    print("-" * 70)
    lr_acc = lr_metrics.get("accuracy", 0.0) if lr_metrics else 0.0
    lr_prec = lr_metrics.get("precision", 0.0) if lr_metrics else 0.0
    lr_rec = lr_metrics.get("recall", 0.0) if lr_metrics else 0.0
    lr_f1 = lr_metrics.get("f1_score", 0.0) if lr_metrics else 0.0
    lr_roc = lr_metrics.get("roc_auc", 0.0) if lr_metrics else 0.0
    lr_cm = lr_metrics.get("confusion_matrix", [[0, 0], [0, 0]]) if lr_metrics else [[0, 0], [0, 0]]

    print(f"  {'Metric':<18} | {'Logistic Regression':<20} | {'PyTorch Tabular MLP':<20}")
    print(f"  {'-'*18} | {'-'*20} | {'-'*20}")
    print(f"  {'Accuracy':<18} | {lr_acc:<20.4f} | {pt_metrics['accuracy']:<20.4f}")
    print(f"  {'Precision':<18} | {lr_prec:<20.4f} | {pt_metrics['precision']:<20.4f}")
    print(f"  {'Recall':<18} | {lr_rec:<20.4f} | {pt_metrics['recall']:<20.4f}")
    print(f"  {'F1 Score':<18} | {lr_f1:<20.4f} | {pt_metrics['f1_score']:<20.4f}")
    print(f"  {'ROC-AUC':<18} | {lr_roc:<20.4f} | {pt_metrics['roc_auc']:<20.4f}")

    print("\n  Confusion Matrices (Test Set, N=23):")
    print(f"    Logistic Regression: TN={lr_cm[0][0]}, FP={lr_cm[0][1]}, FN={lr_cm[1][0]}, TP={lr_cm[1][1]}")
    pt_cm = pt_metrics["confusion_matrix"]
    print(f"    PyTorch Tabular MLP: TN={pt_cm[0][0]}, FP={pt_cm[0][1]}, FN={pt_cm[1][0]}, TP={pt_cm[1][1]}")

    # Step 6: Save PyTorch artifacts
    pt_metrics_path = out_dir / "pytorch_metrics.json"
    pt_model_path = out_dir / "pytorch_model.pt"

    results = {
        "model_type": "PyTorch_ClinicalTabularMLP",
        "architecture": {
            "input_dim": encoded_features,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "output_dim": 1,
        },
        "hyperparameters": {
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "random_state": random_state,
        },
        "dataset_summary": {
            "raw_shape": list(df_raw.shape),
            "total_samples": total_samples,
            "total_features": total_features,
            "encoded_features": encoded_features,
            "class_distribution": {"type_1": type1_count, "other": other_count},
            "train_samples": train_count,
            "test_samples": test_count,
        },
        "metrics": {
            "accuracy": pt_metrics["accuracy"],
            "precision": pt_metrics["precision"],
            "recall": pt_metrics["recall"],
            "f1_score": pt_metrics["f1_score"],
            "roc_auc": pt_metrics["roc_auc"],
            "confusion_matrix": pt_metrics["confusion_matrix"],
        },
        "comparison_with_baseline": {
            "logistic_regression": {
                "accuracy": lr_acc,
                "precision": lr_prec,
                "recall": lr_rec,
                "f1_score": lr_f1,
                "roc_auc": lr_roc,
                "confusion_matrix": lr_cm,
            },
            "pytorch_mlp": {
                "accuracy": pt_metrics["accuracy"],
                "precision": pt_metrics["precision"],
                "recall": pt_metrics["recall"],
                "f1_score": pt_metrics["f1_score"],
                "roc_auc": pt_metrics["roc_auc"],
                "confusion_matrix": pt_metrics["confusion_matrix"],
            },
        },
    }

    with open(pt_metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "in_features": encoded_features,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "hyperparameters": results["hyperparameters"],
        },
        pt_model_path,
    )

    print("\n" + "=" * 70)
    print(f"  Artifacts saved successfully:")
    print(f"  - Metrics JSON:  {pt_metrics_path.resolve()}")
    print(f"  - PyTorch Model: {pt_model_path.resolve()}")
    print("=" * 70)

    return results


if __name__ == "__main__":
    run_pytorch_baseline_experiment()
