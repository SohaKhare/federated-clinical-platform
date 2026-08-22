"""PyTorch Tabular Baseline MLP for Centralized Binary COVID-19 Mortality Prediction.

Model #2 in FEDNET Platform:
DATA -> CLEANING & DEDUPLICATION -> LEAK-FREE PREPROCESSING -> PYTORCH TABULAR MLP

DISCLAIMER:
Experimental machine learning model developed strictly for research and validation
within the FEDNET platform. NOT clinically validated for direct medical diagnosis.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader, TensorDataset

from federated.preprocessing.covid import (
    COVID_LEAKAGE_EXCLUDED_FEATURES,
    SELECTED_18_FEATURES,
    build_covid_preprocessing_pipeline,
    load_raw_covid_data,
    prepare_covid_train_test_data,
)


class CovidMortalityMLP(nn.Module):
    """Tabular Multi-Layer Perceptron (MLP) for COVID-19 admission-time mortality prediction.

    Hidden architecture mirrors the FEDNET clinical tabular MLP architecture:
    Linear(in_features, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)
    """

    def __init__(
        self,
        in_features: int = 35,
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


def train_covid_pytorch_baseline(
    X_train_proc: np.ndarray,
    y_train: np.ndarray,
    in_features: int = 35,
    hidden_dim1: int = 16,
    hidden_dim2: int = 8,
    epochs: int = 100,
    batch_size: int = 16,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
    seed: int = 42,
) -> Tuple[CovidMortalityMLP, List[float], float]:
    """Train the CovidMortalityMLP on preprocessed training data with positive class weighting."""
    set_seed(seed)

    X_train_t = torch.tensor(X_train_proc, dtype=torch.float32)
    y_train_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)

    dataset = TensorDataset(X_train_t, y_train_t)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model = CovidMortalityMLP(
        in_features=in_features,
        hidden_dim1=hidden_dim1,
        hidden_dim2=hidden_dim2,
    )

    # Class weighting calculated strictly from training split
    num_pos = float((y_train == 1).sum())
    num_neg = float((y_train == 0).sum())
    calculated_pos_weight = num_neg / max(num_pos, 1.0)
    pos_weight = torch.tensor([calculated_pos_weight], dtype=torch.float32)

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)

    loss_history: List[float] = []
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

    return model, loss_history, calculated_pos_weight


def evaluate_covid_model(
    model: CovidMortalityMLP,
    X_test_proc: np.ndarray,
    y_test: np.ndarray,
    threshold: float = 0.5,
) -> Dict[str, Any]:
    """Evaluate the trained COVID-19 model on the test split with comprehensive clinical metrics."""
    model.eval()
    X_test_t = torch.tensor(X_test_proc, dtype=torch.float32)

    with torch.no_grad():
        logits = model(X_test_t)
        probs = torch.sigmoid(logits).cpu().numpy().flatten()
        preds = (probs >= threshold).astype(int)

    acc = float(accuracy_score(y_test, preds))
    prec = float(precision_score(y_test, preds, zero_division=0))
    rec = float(recall_score(y_test, preds, zero_division=0))
    f1 = float(f1_score(y_test, preds, zero_division=0))

    try:
        roc_auc = float(roc_auc_score(y_test, probs))
    except (ValueError, IndexError):
        roc_auc = 0.5

    try:
        pr_auc = float(average_precision_score(y_test, probs))
    except (ValueError, IndexError):
        pr_auc = float((y_test == 1).mean()) if len(y_test) > 0 else 0.0

    cm = confusion_matrix(y_test, preds, labels=[0, 1])
    tn, fp, fn, tp = [int(v) for v in cm.ravel().tolist()]

    specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    sensitivity = float(rec)

    return {
        "threshold": float(threshold),
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "sensitivity": sensitivity,
        "specificity": specificity,
        "confusion_matrix": cm.tolist(),
        "true_negatives": tn,
        "false_positives": fp,
        "false_negatives": fn,
        "true_positives": tp,
        "mortality_precision": prec,
        "mortality_recall": rec,
        "mortality_f1": f1,
        "probabilities": probs.tolist(),
        "predictions": preds.tolist(),
    }



def run_covid_baseline_experiment(
    data_path: str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
    output_dir: str = "data/processed",
    test_size: float = 0.2,
    random_state: int = 42,
    epochs: int = 100,
    batch_size: int = 16,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
) -> Dict[str, Any]:
    """Execute end-to-end COVID-19 centralized baseline experiment and save artifacts."""
    print("=" * 75)
    print("  FEDNET MODEL #2: COVID-19 CENTRALIZED BASELINE EXPERIMENT")
    print("  Target: Admission-Time Mortality Prediction (d347 == 'Death')")
    print("=" * 75)

    # 1. Load and split raw dataset with patient-level deduplication
    X_train, X_test, y_train, y_test, df_train, df_test, summary = prepare_covid_train_test_data(
        filepath=data_path,
        test_size=test_size,
        random_state=random_state,
    )

    # 2. Fit preprocessing pipeline ONLY on X_train (Zero Data Leakage)
    preprocessor = build_covid_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)

    total_patients = summary["total_dedup_patients"]
    raw_feature_count = len(SELECTED_18_FEATURES)
    encoded_features = X_train_proc.shape[1]
    train_count = len(X_train)
    test_count = len(X_test)
    train_deaths = int((y_train == 1).sum())
    train_non_deaths = int((y_train == 0).sum())
    test_deaths = int((y_test == 1).sum())
    test_non_deaths = int((y_test == 0).sum())

    print("-" * 75)
    print("DATASET & PREPROCESSING CHARACTERISTICS")
    print("-" * 75)
    print(f"Raw CSV Rows / Columns:  {summary['total_raw_rows']} rows x 1130 columns")
    print(f"Duplicate Patient IDs:   {summary['duplicate_patient_ids']} IDs (deduplicated to {total_patients} unique patients)")
    print(f"Features (Selected):     {raw_feature_count} admission-time features (1 numerical, 17 categorical)")
    print(f"Features (Encoded):      {encoded_features} input dimensions after OneHot/StandardScaler")
    print(f"Class Balance (Overall): Deaths={summary['deaths_after_dedup']} ({summary['mortality_rate_after_dedup']:.2f}%), Non-deaths={summary['non_deaths_after_dedup']}")
    print(f"Train Split (N={train_count}):   Deaths={train_deaths} ({train_deaths/train_count*100:.2f}%), Non-deaths={train_non_deaths}")
    print(f"Test Split  (N={test_count}):   Deaths={test_deaths} ({test_deaths/test_count*100:.2f}%), Non-deaths={test_non_deaths}")

    # 3. Train PyTorch Model
    print("\n" + "-" * 75)
    print("PYTORCH MODEL ARCHITECTURE & HYPERPARAMETERS")
    print("-" * 75)
    print(f"Architecture:            Linear({encoded_features}, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)")
    print(f"Optimizer:               AdamW(lr={learning_rate}, weight_decay={weight_decay})")
    print(f"Training Config:         Epochs={epochs}, BatchSize={batch_size}, Seed={random_state}")

    model, loss_history, pos_weight_val = train_covid_pytorch_baseline(
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

    print(f"Positive Class Weight:   {pos_weight_val:.4f} (calculated strictly from train split: {train_non_deaths}/{train_deaths})")
    print(f"Training Loss:           Initial = {loss_history[0]:.4f} -> Final = {loss_history[-1]:.4f}")

    # 4. Evaluate on test set
    metrics = evaluate_covid_model(
        model=model,
        X_test_proc=X_test_proc,
        y_test=y_test.values,
    )

    print("\n" + "-" * 75)
    print("EVALUATION ON UNTOUCHED PATIENT-LEVEL TEST SET (N=235)")
    print("-" * 75)
    print(f"  Accuracy:              {metrics['accuracy']:.4f}")
    print(f"  Precision:             {metrics['precision']:.4f}")
    print(f"  Recall (Sensitivity):  {metrics['recall']:.4f}")
    print(f"  Specificity:           {metrics['specificity']:.4f}")
    print(f"  F1 Score:              {metrics['f1_score']:.4f}")
    print(f"  ROC-AUC:               {metrics['roc_auc']:.4f}")
    print(f"  PR-AUC:                {metrics['pr_auc']:.4f}")
    print(f"  Confusion Matrix:      TN={metrics['true_negatives']}, FP={metrics['false_positives']}, FN={metrics['false_negatives']}, TP={metrics['true_positives']}")
    print(f"  Mortality Recall:      {metrics['mortality_recall']:.4f}")
    print(f"  Mortality Precision:   {metrics['mortality_precision']:.4f}")
    print(f"  Mortality F1:          {metrics['mortality_f1']:.4f}")

    # 5. Save Artifacts
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = out_dir / "covid_mortality_baseline_metrics.json"
    model_path = out_dir / "covid_mortality_model.pt"
    preprocessor_path = out_dir / "covid_mortality_preprocessor.pkl"

    results = {
        "model_type": "CovidMortalityMLP",
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
            "pos_weight": pos_weight_val,
        },
        "dataset_summary": {
            "total_raw_rows": summary["total_raw_rows"],
            "total_unique_patients": total_patients,
            "selected_features": SELECTED_18_FEATURES,
            "raw_feature_count": raw_feature_count,
            "encoded_features": encoded_features,
            "train_samples": train_count,
            "test_samples": test_count,
            "train_deaths": train_deaths,
            "train_non_deaths": train_non_deaths,
            "test_deaths": test_deaths,
            "test_non_deaths": test_non_deaths,
            "train_mortality_rate_percent": float((train_deaths / train_count) * 100),
            "test_mortality_rate_percent": float((test_deaths / test_count) * 100),
        },
        "metrics": {
            "accuracy": metrics["accuracy"],
            "precision": metrics["precision"],
            "recall": metrics["recall"],
            "f1_score": metrics["f1_score"],
            "roc_auc": metrics["roc_auc"],
            "pr_auc": metrics["pr_auc"],
            "sensitivity": metrics["sensitivity"],
            "specificity": metrics["specificity"],
            "confusion_matrix": metrics["confusion_matrix"],
            "true_negatives": metrics["true_negatives"],
            "false_positives": metrics["false_positives"],
            "false_negatives": metrics["false_negatives"],
            "true_positives": metrics["true_positives"],
            "mortality_precision": metrics["mortality_precision"],
            "mortality_recall": metrics["mortality_recall"],
            "mortality_f1": metrics["mortality_f1"],
        },
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "in_features": encoded_features,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "hyperparameters": results["hyperparameters"],
        },
        model_path,
    )

    joblib.dump(preprocessor, preprocessor_path)

    print("\n" + "=" * 75)
    print("COVID-19 BASELINE ARTIFACTS SAVED:")
    print(f"  - Metrics JSON:  {metrics_path.resolve()}")
    print(f"  - PyTorch Model: {model_path.resolve()}")
    print(f"  - Preprocessor:  {preprocessor_path.resolve()}")
    print("=" * 75)

    return results


if __name__ == "__main__":
    run_covid_baseline_experiment()
