"""Federated Averaging (FedAvg) Implementation for COVID-19 Clinical Intelligence.

Federated learning orchestration across 41 simulated hospital nodes:
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
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from federated.aggregation.fedavg import count_parameters, fedavg_aggregate
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


def run_covid_federated_round_1(
    raw_data_path: str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
    hospitals_dir: str = "data/covid_hospitals",
    output_dir: str = "data/processed",
    random_state: int = 42,
    epochs: int = 10,
    rounds: int = 5,
    batch_size: int = 8,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
) -> Dict[str, Any]:
    """Execute complete Federated Averaging (FedAvg) rounds across all 41 COVID hospital nodes."""
    set_seed(random_state)

    print("=" * 80)
    print(f"  FEDNET MODEL #2: FEDERATED LEARNING (FedAvg) — {rounds} ROUNDS")
    print("  Participating Clinical Nodes: 41 COVID Hospital Clients")
    print("=" * 80)
    print("\n[NOTE] Privacy Guarantee: Hospital patient rows never leave their local node.")
    print("       Only model parameter weights and sample counts are transferred.\n")

    # 1. Prepare Global Benchmark Train and Test Split (Patient-Level Deduplicated)
    X_train, X_test, y_train, y_test, df_train, df_test, summary = prepare_covid_train_test_data(
        filepath=raw_data_path, test_size=0.2, random_state=random_state
    )

    # Fit benchmark preprocessor strictly on raw training partition
    preprocessor = build_covid_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)
    in_features = X_train_proc.shape[1]

    # Global train class weighting
    num_pos = float((y_train == 1).sum())
    num_neg = float((y_train == 0).sum())
    pos_weight_val = num_neg / max(num_pos, 1.0)
    pos_weight = torch.tensor([pos_weight_val], dtype=torch.float32)

    # 2. Initialize Global Model (Round 0)
    global_model = CovidMortalityMLP(in_features=in_features, hidden_dim1=16, hidden_dim2=8)
    num_params = count_parameters(global_model)

    # Evaluate Global Model Before Training (Round 0 Initial State)
    metrics_r0 = evaluate_covid_model(
        model=global_model,
        X_test_proc=X_test_proc,
        y_test=y_test.values,
    )

    print("-" * 80)
    print("GLOBAL MODEL SPECIFICATION")
    print("-" * 80)
    print(f"Architecture:            Linear({in_features}, 16) -> ReLU -> Linear(16, 8) -> ReLU -> Linear(8, 1)")
    print(f"Total Parameters:        {num_params}")
    print(f"Global Test Set:         {len(y_test)} patients (Deaths: {(y_test == 1).sum()}, Non-deaths: {(y_test == 0).sum()})")
    print(f"Initial State (R0 Acc):  {metrics_r0['accuracy']:.4f} | R0 ROC-AUC: {metrics_r0['roc_auc']:.4f}\n")

    # 3. Partition training cohort across 41 hospitals
    hospital_ids = sorted(df_train["hospital_id"].unique())
    print(f"Training Hospital Nodes: {len(hospital_ids)} participating clients")

    round_metrics_history: List[Dict[str, Any]] = []
    final_client_metrics: Dict[str, Any] = {}

    for r in range(1, rounds + 1):
        print(f"\n--- FEDERATED ROUND {r}/{rounds} ---")
        client_state_dicts: List[Dict[str, torch.Tensor]] = []
        client_sample_counts: List[int] = []
        participating_clients: List[str] = []
        local_losses: List[float] = []
        local_accuracies: List[float] = []

        for hid in hospital_ids:
            h_mask = (df_train["hospital_id"] == hid)
            n_k = int(h_mask.sum())
            if n_k == 0:
                continue

            h_name = f"hospital_{hid}"
            participating_clients.append(h_name)
            client_sample_counts.append(n_k)

            X_k_proc = X_train_proc[h_mask.values]
            y_k = y_train.values[h_mask.values]

            # Dispatch: copy current global weights into local model
            local_model = copy.deepcopy(global_model)
            local_optimizer = optim.AdamW(local_model.parameters(), lr=learning_rate, weight_decay=weight_decay)
            local_criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

            k_dataset = TensorDataset(
                torch.tensor(X_k_proc, dtype=torch.float32),
                torch.tensor(y_k, dtype=torch.float32).unsqueeze(1),
            )
            bs = int(min(batch_size, n_k))
            k_loader = DataLoader(k_dataset, batch_size=bs, shuffle=True)

            local_model.train()
            last_epoch_loss = 0.0
            for epoch in range(epochs):
                epoch_loss = 0.0
                for batch_x, batch_y in k_loader:
                    local_optimizer.zero_grad()
                    logits = local_model(batch_x)
                    loss = local_criterion(logits, batch_y)
                    loss.backward()
                    local_optimizer.step()
                    epoch_loss += loss.item() * len(batch_x)
                last_epoch_loss = epoch_loss / len(k_dataset)

            local_losses.append(last_epoch_loss)

            # Evaluate local model
            local_eval = evaluate_covid_model(local_model, X_k_proc, y_k)
            local_accuracies.append(local_eval["accuracy"])
            if r == rounds:
                final_client_metrics[h_name] = {
                    "samples": n_k,
                    "local_loss": last_epoch_loss,
                    "accuracy": local_eval["accuracy"],
                    "roc_auc": local_eval["roc_auc"],
                }

            client_state_dicts.append(copy.deepcopy(local_model.state_dict()))

        # Server Weighted FedAvg Aggregation
        aggregated_state_dict = fedavg_aggregate(client_state_dicts, client_sample_counts)
        global_model.load_state_dict(aggregated_state_dict)

        # Global Evaluation on Untouched Benchmark Test Set
        global_eval = evaluate_covid_model(global_model, X_test_proc, y_test.values)

        mean_local_loss = float(np.mean(local_losses))
        mean_local_acc = float(np.mean(local_accuracies))

        print(f"  Round {r} Summary:")
        print(f"    Participating Clients: {len(participating_clients)} | Mean Local Loss: {mean_local_loss:.4f} | Mean Local Acc: {mean_local_acc:.4f}")
        print(f"    Global Test Accuracy:  {global_eval['accuracy']:.4f}")
        print(f"    Global Test Recall:    {global_eval['recall']:.4f} | Precision: {global_eval['precision']:.4f} | F1: {global_eval['f1_score']:.4f}")
        print(f"    Global Test ROC-AUC:   {global_eval['roc_auc']:.4f} | PR-AUC: {global_eval['pr_auc']:.4f}")
        print(f"    Global Confusion Mat:  TN={global_eval['true_negatives']}, FP={global_eval['false_positives']}, FN={global_eval['false_negatives']}, TP={global_eval['true_positives']}")

        round_metrics_history.append({
            "round": r,
            "participating_clients": len(participating_clients),
            "total_samples": sum(client_sample_counts),
            "mean_local_loss": mean_local_loss,
            "mean_local_accuracy": mean_local_acc,
            "global_metrics": global_eval,
        })

    # Save Artifacts
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fedavg_metrics_path = out_dir / "covid_mortality_fedavg_metrics.json"

    results = {
        "experiment": f"COVID-19 41-Hospital FedAvg ({rounds} Rounds)",
        "model_architecture": {
            "type": "CovidMortalityMLP",
            "in_features": in_features,
            "hidden_dim1": 16,
            "hidden_dim2": 8,
            "output_dim": 1,
            "num_parameters": num_params,
        },
        "hyperparameters": {
            "rounds": rounds,
            "local_epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "random_state": random_state,
            "pos_weight": pos_weight_val,
        },
        "dataset_summary": {
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "total_hospitals": len(hospital_ids),
        },
        "global_model_before_aggregation": metrics_r0,
        "global_model_after_fedavg": round_metrics_history[-1]["global_metrics"],
        "round_history": round_metrics_history,
        "final_client_metrics": final_client_metrics,
    }

    with open(fedavg_metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 80)
    print(f"FedAvg Artifact Saved: {fedavg_metrics_path.resolve()}")
    print("=" * 80)

    return results


if __name__ == "__main__":
    run_covid_federated_round_1()
