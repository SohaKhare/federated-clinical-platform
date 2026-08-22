"""Independent Local Training & Evaluation for Simulated Hospital Nodes.

Milestone 3 in the FEDNET Development Sequence:
CENTRAL DATASET -> NON-IID HOSPITAL PARTITIONS -> THREE INDEPENDENT LOCAL MODELS -> LOCAL METRICS

Simulates isolated hospital execution:
- Apollo trains exclusively on Apollo private data
- KEM trains exclusively on KEM private data
- Fortis trains exclusively on Fortis private data

DISCLAIMER:
Experimental ML research benchmark. NOT clinically validated for diagnosis.
"""

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
from sklearn.model_selection import train_test_split

from federated.model.pytorch_baseline import (
    ClinicalTabularMLP,
    evaluate_pytorch_model,
    train_pytorch_baseline,
)
from federated.partitioning.hospital_partition import (
    HOSPITAL_NAMES,
    create_hospital_partitions,
    load_hospital_data,
    save_hospital_partitions,
)
from federated.preprocessing.diabetes import (
    build_preprocessing_pipeline,
    clean_diabetes_data,
)


def train_and_evaluate_single_hospital(
    hospital_name: str,
    base_dir: str = "data/hospitals",
    test_size: float = 0.2,
    random_state: int = 42,
    epochs: int = 100,
    batch_size: int = 8,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
) -> Dict[str, Any]:
    """Train and evaluate an isolated PyTorch model on a single hospital's private dataset."""
    # 1. Load ONLY that hospital's private data
    df_hospital = load_hospital_data(hospital_name, base_dir=base_dir)

    # 2. Clean features using authoritative rules
    X, y, missing_counts = clean_diabetes_data(df_hospital)

    # 3. Stratified split locally
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    # 4. Leakage-safe preprocessing fit strictly on local X_train
    preprocessor = build_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)

    # 5. Initialize and train fresh PyTorch model
    in_features = X_train_proc.shape[1]
    model, loss_history = train_pytorch_baseline(
        X_train_proc=X_train_proc,
        y_train=y_train.values,
        in_features=in_features,
        hidden_dim1=16,
        hidden_dim2=8,
        epochs=epochs,
        batch_size=batch_size,
        learning_rate=learning_rate,
        weight_decay=weight_decay,
        seed=random_state,
    )

    # 6. Evaluate model on local test set
    metrics = evaluate_pytorch_model(
        model=model,
        X_test_proc=X_test_proc,
        y_test=y_test.values,
    )

    t1_total = int((y == 1).sum())
    other_total = int((y == 0).sum())
    t1_train = int((y_train == 1).sum())
    other_train = int((y_train == 0).sum())
    t1_test = int((y_test == 1).sum())
    other_test = int((y_test == 0).sum())

    return {
        "hospital_name": hospital_name.capitalize(),
        "total_samples": len(df_hospital),
        "class_distribution": {
            "type_1": t1_total,
            "other": other_total,
            "type_1_percentage": (t1_total / len(df_hospital)) * 100,
        },
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "train_breakdown": {"type_1": t1_train, "other": other_train},
        "test_breakdown": {"type_1": t1_test, "other": other_test},
        "training": {
            "epochs": epochs,
            "batch_size": batch_size,
            "initial_loss": loss_history[0],
            "final_loss": loss_history[-1],
        },
        "metrics": {
            "accuracy": metrics["accuracy"],
            "precision": metrics["precision"],
            "recall": metrics["recall"],
            "f1_score": metrics["f1_score"],
            "roc_auc": metrics["roc_auc"],
            "confusion_matrix": metrics["confusion_matrix"],
        },
    }


def run_hospital_simulation_experiment(
    raw_data_path: str = "data/raw/diabetes.csv",
    hospitals_dir: str = "data/hospitals",
    output_dir: str = "data/processed",
    random_state: int = 42,
    epochs: int = 100,
    batch_size: int = 8,
    learning_rate: float = 0.01,
    weight_decay: float = 1e-3,
) -> Dict[str, Any]:
    """Execute complete Milestone 3 non-IID partitioning and 3 local hospital model trainings."""
    print("=" * 75)
    print("  FEDNET MILESTONE 3: SIMULATED HOSPITAL PARTITIONING & LOCAL TRAINING")
    print("  Simulating 3 Independent Clinical Nodes: Apollo, KEM, Fortis")
    print("=" * 75)
    print("\n[NOTE] Experimental ML baseline strictly for clinical ML research.\n")

    # Step 1: Create and save non-IID partitions
    hospital_dfs, partition_summary = create_hospital_partitions(
        raw_data_path=raw_data_path,
        random_state=random_state,
    )
    saved_paths = save_hospital_partitions(hospital_dfs, base_dir=hospitals_dir)

    print("-" * 75)
    print("NON-IID HOSPITAL PARTITION REPORT")
    print("-" * 75)
    print(f"Total Raw Records:        {partition_summary['total_records_raw']}")
    print(f"Total Across Hospitals:   {partition_summary['total_partitioned']}")
    print(f"Duplicate Records:        {partition_summary['duplicate_records']}")
    print(f"Records Lost:             {partition_summary['records_lost']}")
    print(f"Global Type 1 Count:      {partition_summary['global_type1_count']} / {partition_summary['total_records_raw']} ({partition_summary['global_type1_percentage']:.2f}%)")
    print(f"Global Other Count:       {partition_summary['global_other_count']} / {partition_summary['total_records_raw']} ({100 - partition_summary['global_type1_percentage']:.2f}%)\n")

    print(f"  {'Hospital':<10} | {'Total':<7} | {'Type 1':<8} | {'Other':<7} | {'Type 1 %':<10} | {'Saved Location':<30}")
    print(f"  {'-'*10} | {'-'*7} | {'-'*8} | {'-'*7} | {'-'*10} | {'-'*30}")
    for name in HOSPITAL_NAMES:
        h_info = partition_summary["hospitals"][name]
        loc = str(saved_paths[name])
        print(f"  {h_info['name']:<10} | {h_info['total_samples']:<7} | {h_info['type_1_count']:<8} | {h_info['other_count']:<7} | {h_info['type_1_percentage']:<9.2f}% | {loc:<30}")

    # Step 2: Train and evaluate independent local models
    print("\n" + "-" * 75)
    print("INDEPENDENT LOCAL MODEL TRAINING & EVALUATION")
    print("-" * 75)

    hospital_results = {}
    for name in HOSPITAL_NAMES:
        res = train_and_evaluate_single_hospital(
            hospital_name=name,
            base_dir=hospitals_dir,
            random_state=random_state,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            weight_decay=weight_decay,
        )
        hospital_results[name] = res

        m = res["metrics"]
        cm = m["confusion_matrix"]
        print(f"\n[{res['hospital_name'].upper()}] Local Model Results:")
        print(f"  Samples: Total={res['total_samples']} | Train={res['train_samples']} (T1:{res['train_breakdown']['type_1']}, Other:{res['train_breakdown']['other']}) | Test={res['test_samples']} (T1:{res['test_breakdown']['type_1']}, Other:{res['test_breakdown']['other']})")
        print(f"  Accuracy:         {m['accuracy']:.4f} ({m['accuracy']*100:.2f}%)")
        print(f"  Precision:        {m['precision']:.4f}")
        print(f"  Recall:           {m['recall']:.4f}")
        print(f"  F1 Score:         {m['f1_score']:.4f}")
        print(f"  ROC-AUC:          {m['roc_auc']:.4f}")
        print(f"  Confusion Matrix: [[TN={cm[0][0]}, FP={cm[0][1]}], [FN={cm[1][0]}, TP={cm[1][1]}]]")

    # Step 3: Comparative Summary Table
    print("\n" + "-" * 75)
    print("CROSS-HOSPITAL LOCAL METRICS COMPARISON")
    print("-" * 75)
    print(f"  {'Metric':<18} | {'Apollo (High T1)':<18} | {'KEM (Moderate T1)':<18} | {'Fortis (Balanced)':<18}")
    print(f"  {'-'*18} | {'-'*18} | {'-'*18} | {'-'*18}")

    metrics_keys = [
        ("Accuracy", "accuracy"),
        ("Precision", "precision"),
        ("Recall", "recall"),
        ("F1 Score", "f1_score"),
        ("ROC-AUC", "roc_auc"),
    ]
    for label, k in metrics_keys:
        a_val = hospital_results["apollo"]["metrics"][k]
        k_val = hospital_results["kem"]["metrics"][k]
        f_val = hospital_results["fortis"]["metrics"][k]
        print(f"  {label:<18} | {a_val:<18.4f} | {k_val:<18.4f} | {f_val:<18.4f}")

    # Step 4: Save combined metrics
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = out_dir / "hospital_local_metrics.json"

    combined_results = {
        "milestone": "Milestone 3: Simulated Hospital Partitioning & Local Training",
        "partition_summary": partition_summary,
        "hospital_local_results": hospital_results,
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(combined_results, f, indent=2)

    print("\n" + "=" * 75)
    print(f"  Artifacts saved successfully:")
    print(f"  - Local Metrics JSON: {metrics_path.resolve()}")
    for name, p in saved_paths.items():
        print(f"  - {name.capitalize()} Data CSV:   {p.resolve()}")
    print("=" * 75)

    return combined_results


if __name__ == "__main__":
    run_hospital_simulation_experiment()
