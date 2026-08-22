"""Federated Averaging (FedAvg) Implementation for Federated Clinical Intelligence.

Milestone 4 in the FEDNET Development Sequence:
CENTRAL DATASET -> NON-IID HOSPITAL PARTITIONS -> THREE INDEPENDENT LOCAL MODELS -> FedAvg ROUND 1

Formula:
W_global = sum_{k=1}^K (n_k / N_total) * W_k

DISCLAIMER:
Experimental ML research algorithm. NOT clinically validated for medical diagnosis.
"""

import copy
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split

from federated.model.pytorch_baseline import (
    ClinicalTabularMLP,
    evaluate_pytorch_model,
    set_seed,
    train_pytorch_baseline,
)
from federated.partitioning.hospital_partition import (
    HOSPITAL_NAMES,
    load_hospital_data,
)
from federated.preprocessing.diabetes import (
    build_preprocessing_pipeline,
    clean_diabetes_data,
    prepare_train_test_data,
)


def count_parameters(model: nn.Module) -> int:
    """Calculate the total number of trainable model parameters."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def fedavg_aggregate(
    client_state_dicts: List[Dict[str, torch.Tensor]],
    sample_counts: List[int],
) -> Dict[str, torch.Tensor]:
    """Perform weighted Federated Averaging (FedAvg) across client parameter updates.

    W_global = sum_{k=1}^K (n_k / N_total) * W_k

    Args:
        client_state_dicts: List of state_dict dictionaries from participating nodes.
        sample_counts: Number of local training samples contributed by each node.

    Returns:
        aggregated_state_dict: Aggregated global model parameter dictionary.
    """
    if len(client_state_dicts) != len(sample_counts):
        raise ValueError("Number of client state_dicts must match number of sample counts.")

    total_samples = sum(sample_counts)
    if total_samples == 0:
        raise ValueError("Total sample count across clients cannot be zero.")

    aggregated_state_dict: Dict[str, torch.Tensor] = {}

    for key in client_state_dicts[0].keys():
        # Compute weighted sum for each parameter tensor
        weighted_param = sum(
            client_state_dicts[i][key].float() * (sample_counts[i] / total_samples)
            for i in range(len(client_state_dicts))
        )
        aggregated_state_dict[key] = weighted_param

    return aggregated_state_dict


def run_federated_round_1(
    raw_data_path: str = "data/raw/diabetes.csv",
    hospitals_dir: str = "data/hospitals",
    output_dir: str = "data/processed",
    random_state: int = 42,
    epochs: int = 100,
    batch_size: int = 8,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
) -> Dict[str, Any]:
    """Execute ONE complete Federated Averaging (FedAvg) round across Apollo, KEM, and Fortis."""
    set_seed(random_state)

    print("=" * 75)
    print("  FEDNET MILESTONE 4: FEDERATED LEARNING (FedAvg) — ROUND 1")
    print("  Participating Clinical Nodes: Apollo, KEM, Fortis")
    print("=" * 75)
    print("\n[NOTE] Privacy Guarantee: Hospital patient rows never leave their local node.")
    print("       Only model parameter weights are collected and aggregated.\n")

    # Step 1: Initialize ONE Global Model (Round 0)
    global_model_round_0 = ClinicalTabularMLP(in_features=28, hidden_dim1=16, hidden_dim2=8)
    num_params = count_parameters(global_model_round_0)

    # Prepare Global Benchmark Test Set (23 samples) for objective evaluation
    _, X_global_test, _, y_global_test, _ = prepare_train_test_data(
        filepath=raw_data_path,
        test_size=0.2,
        random_state=random_state,
    )
    # Fit benchmark preprocessor strictly on raw training partition to transform global test set
    raw_df = clean_diabetes_data(prepare_train_test_data(raw_data_path)[0].iloc[0:0].assign(**load_hospital_data("apollo")) if False else load_hospital_data("apollo"))
    # Use standard pipeline fit on training split for global test evaluation
    global_preprocessor = build_preprocessing_pipeline()
    X_raw_all, y_raw_all, _ = clean_diabetes_data(load_hospital_data("apollo").iloc[0:0].assign(**{}) if False else pd.read_csv(raw_data_path))
    X_tr_raw, _, _, _ = train_test_split(
        X_raw_all, y_raw_all, test_size=0.2, random_state=random_state, stratify=y_raw_all
    )
    global_preprocessor.fit(X_tr_raw)
    X_global_test_proc = global_preprocessor.transform(X_global_test)

    # Evaluate Global Model Before Aggregation (Round 0 Initial State)
    metrics_before = evaluate_pytorch_model(
        model=global_model_round_0,
        X_test_proc=X_global_test_proc,
        y_test=y_global_test.values,
    )

    print("-" * 75)
    print("GLOBAL MODEL SPECIFICATION")
    print("-" * 75)
    print(f"Architecture:            Linear(28, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)")
    print(f"Total Model Parameters:  {num_params}")
    print(f"Global Test Set Size:    {len(y_global_test)} samples (T1: {(y_global_test == 1).sum()}, Other: {(y_global_test == 0).sum()})")
    print(f"Initial State (R0 Acc):  {metrics_before['accuracy']:.4f} ({metrics_before['accuracy']*100:.2f}%)")

    # Step 2: Local Hospital Training (Starting from exact same global weights)
    print("\n" + "-" * 75)
    print("STEP 1: LOCAL HOSPITAL TRAINING ROUND")
    print("-" * 75)

    client_state_dicts: List[Dict[str, torch.Tensor]] = []
    client_sample_counts: List[int] = []
    hospital_training_info: Dict[str, Any] = {}

    for name in HOSPITAL_NAMES:
        # Load local private data ONLY
        df_local = load_hospital_data(name, base_dir=hospitals_dir)
        X_h, y_h, _ = clean_diabetes_data(df_local)

        X_tr, X_te, y_tr, y_te = train_test_split(
            X_h, y_h, test_size=0.2, random_state=random_state, stratify=y_h
        )

        prep_local = build_preprocessing_pipeline()
        X_tr_proc = prep_local.fit_transform(X_tr)
        X_te_proc = prep_local.transform(X_te)

        # Dispatch global weights: load exact copy of global model into hospital node
        local_model = copy.deepcopy(global_model_round_0)

        # Train local model on hospital private dataset
        local_model, loss_hist = train_pytorch_baseline(
            X_train_proc=X_tr_proc,
            y_train=y_tr.values,
            in_features=28,
            hidden_dim1=16,
            hidden_dim2=8,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            weight_decay=weight_decay,
            seed=random_state,
        )

        # Evaluate on local test partition
        m_local = evaluate_pytorch_model(local_model, X_te_proc, y_te.values)

        train_samples = len(X_tr)
        client_state_dicts.append(local_model.state_dict())
        client_sample_counts.append(train_samples)

        hospital_training_info[name] = {
            "name": name.upper(),
            "total_samples": len(df_local),
            "train_samples": train_samples,
            "test_samples": len(X_te),
            "metrics": m_local,
            "initial_loss": loss_hist[0],
            "final_loss": loss_hist[-1],
        }

        print(f"[{name.upper()}] Node Training Complete:")
        print(f"  Training Samples Contributed (n_{name[0]}): {train_samples}")
        print(f"  Local Validation Accuracy:            {m_local['accuracy']:.4f} ({m_local['accuracy']*100:.2f}%)")
        print(f"  Local Loss Progression:               {loss_hist[0]:.4f} -> {loss_hist[-1]:.4f}")

    total_fed_samples = sum(client_sample_counts)

    # Step 3: Server-side Weighted FedAvg Aggregation
    print("\n" + "-" * 75)
    print("STEP 2: WEIGHTED FEDERATED AGGREGATION (FedAvg)")
    print("-" * 75)
    for name, count in zip(HOSPITAL_NAMES, client_sample_counts):
        weight_pct = (count / total_fed_samples) * 100
        print(f"  - {name.upper():<8}: n = {count:>2} samples (weight = {weight_pct:.2f}%)")

    aggregated_weights = fedavg_aggregate(
        client_state_dicts=client_state_dicts,
        sample_counts=client_sample_counts,
    )

    # Step 4: Construct Global Model Round 1
    global_model_round_1 = ClinicalTabularMLP(in_features=28, hidden_dim1=16, hidden_dim2=8)
    global_model_round_1.load_state_dict(aggregated_weights)

    # Step 5: Global Evaluation on Benchmark Test Set
    metrics_after = evaluate_pytorch_model(
        model=global_model_round_1,
        X_test_proc=X_global_test_proc,
        y_test=y_global_test.values,
    )

    cm_before = metrics_before["confusion_matrix"]
    cm_after = metrics_after["confusion_matrix"]

    print("\n" + "-" * 75)
    print("GLOBAL MODEL EVALUATION: BEFORE vs AFTER FedAvg ROUND 1")
    print("-" * 75)
    print(f"  {'Metric':<18} | {'Global Model (R0)':<20} | {'Global FedAvg (R1)':<20}")
    print(f"  {'-'*18} | {'-'*20} | {'-'*20}")
    print(f"  {'Accuracy':<18} | {metrics_before['accuracy']:<20.4f} | {metrics_after['accuracy']:<20.4f}")
    print(f"  {'Precision':<18} | {metrics_before['precision']:<20.4f} | {metrics_after['precision']:<20.4f}")
    print(f"  {'Recall':<18} | {metrics_before['recall']:<20.4f} | {metrics_after['recall']:<20.4f}")
    print(f"  {'F1 Score':<18} | {metrics_before['f1_score']:<20.4f} | {metrics_after['f1_score']:<20.4f}")
    print(f"  {'ROC-AUC':<18} | {metrics_before['roc_auc']:<20.4f} | {metrics_after['roc_auc']:<20.4f}")

    print("\n  Global Confusion Matrix (Round 1, N=23):")
    print(f"    [[TN={cm_after[0][0]}, FP={cm_after[0][1]}],")
    print(f"     [FN={cm_after[1][0]}, TP={cm_after[1][1]}]]")
    print(f"    - True Negatives (Correct Non-T1): {cm_after[0][0]}")
    print(f"    - False Positives (Other as T1):   {cm_after[0][1]}")
    print(f"    - False Negatives (T1 as Other):   {cm_after[1][0]}")
    print(f"    - True Positives (Correct T1):     {cm_after[1][1]}")

    # Step 6: Save outputs
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = out_dir / "federated_round_1_metrics.json"
    model_path = out_dir / "global_model_round_1.pt"

    results = {
        "milestone": "Milestone 4: One Complete FedAvg Round",
        "round": 1,
        "model_architecture": {
            "type": "ClinicalTabularMLP",
            "in_features": 28,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "output_dim": 1,
            "num_parameters": num_params,
        },
        "training_samples_by_hospital": {
            "apollo": hospital_training_info["apollo"]["train_samples"],
            "kem": hospital_training_info["kem"]["train_samples"],
            "fortis": hospital_training_info["fortis"]["train_samples"],
            "total_federated_samples": total_fed_samples,
        },
        "local_hospital_metrics": {
            name: hospital_training_info[name]["metrics"] for name in HOSPITAL_NAMES
        },
        "global_model_before_aggregation": metrics_before,
        "global_model_after_fedavg": metrics_after,
        "hyperparameters": {
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "random_state": random_state,
        },
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    torch.save(
        {
            "round": 1,
            "model_state_dict": global_model_round_1.state_dict(),
            "in_features": 28,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "num_parameters": num_params,
            "metrics": metrics_after,
        },
        model_path,
    )

    print("\n" + "=" * 75)
    print(f"  Artifacts saved successfully:")
    print(f"  - Round 1 Metrics JSON: {metrics_path.resolve()}")
    print(f"  - Global Model Round 1: {model_path.resolve()}")
    print("=" * 75)

    return results


if __name__ == "__main__":
    import pandas as pd
    run_federated_round_1()
