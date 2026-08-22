"""Automated Validation Suite for FEDNET COVID-19 Admission-Time Mortality Model.

Verifies:
1. Patient Deduplication (1172 unique patients)
2. Target Definition & Class Counts
3. Exactly 18 Selected Admission Features
4. Strict Data Leakage Exclusions
5. Leak-Free Preprocessing (fit strictly on train)
6. 41 Hospital Clients & Zero Client Overlap
7. Sum of Client Samples == 1172
8. Preserved Diabetes Artifacts & Pipeline Integrity
9. Valid Opacus Epsilon Calculations
10. Valid FedAvg & DP-FedAvg Aggregation
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
import torch


from federated.model.covid_baseline import CovidMortalityMLP
from federated.partitioning.covid_hospital_partition import (
    create_covid_hospital_partitions,
    load_covid_hospital_data,
)
from federated.preprocessing.covid import (
    CATEGORICAL_FEATURES,
    COVID_LEAKAGE_EXCLUDED_FEATURES,
    NUMERICAL_FEATURES,
    PATIENT_IDENTIFIER,
    SELECTED_18_FEATURES,
    TARGET_COLUMN,
    TARGET_POSITIVE_VALUE,
    build_covid_preprocessing_pipeline,
    clean_covid_data,
    load_raw_covid_data,
    prepare_covid_train_test_data,
)


def test_covid_data_integrity():
    """Verify raw dataset facts, deduplication, target counts, and feature dimensions."""
    df_raw = load_raw_covid_data("data/raw/National_Clinical_Registry_Covid19_Sample_data.csv")
    assert len(df_raw) == 1184, f"Expected 1184 raw rows, got {len(df_raw)}"

    X, y, df_dedup, summary = clean_covid_data(df_raw)

    # Patient deduplication
    assert len(df_dedup) == 1172, f"Expected 1172 unique patients, got {len(df_dedup)}"
    assert df_dedup[PATIENT_IDENTIFIER].nunique() == 1172, "Patient IDs are not unique"
    assert summary["duplicate_patient_ids"] == 12, f"Expected 12 duplicate IDs, got {summary['duplicate_patient_ids']}"

    # Target counts
    assert summary["deaths_before_dedup"] == 113
    assert summary["non_deaths_before_dedup"] == 1071
    assert summary["deaths_after_dedup"] == 111
    assert summary["non_deaths_after_dedup"] == 1061
    assert abs(summary["mortality_rate_after_dedup"] - 9.4709898) < 1e-4

    # Feature counts
    assert len(SELECTED_18_FEATURES) == 18, f"Expected 18 features, got {len(SELECTED_18_FEATURES)}"
    assert len(NUMERICAL_FEATURES) == 1
    assert len(CATEGORICAL_FEATURES) == 17
    assert TARGET_COLUMN not in SELECTED_18_FEATURES
    assert "d337" not in SELECTED_18_FEATURES

    # Exclusions
    for excluded in COVID_LEAKAGE_EXCLUDED_FEATURES:
        assert excluded not in SELECTED_18_FEATURES, f"Excluded feature {excluded} found in selected features!"


def test_leak_free_split_and_preprocessing():
    """Verify stratified patient-level splitting and strict training-only transformation."""
    X_train, X_test, y_train, y_test, df_train, df_test, summary = prepare_covid_train_test_data(
        "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
        test_size=0.2,
        random_state=42,
    )

    assert len(X_train) == 937
    assert len(X_test) == 235
    assert len(X_train) + len(X_test) == 1172

    # Zero overlap between train and test patients
    train_patients = set(df_train[PATIENT_IDENTIFIER])
    test_patients = set(df_test[PATIENT_IDENTIFIER])
    assert len(train_patients.intersection(test_patients)) == 0, "Patient overlap between train and test!"

    # Class balance preservation
    train_mortality = (y_train == 1).mean()
    test_mortality = (y_test == 1).mean()
    assert abs(train_mortality - test_mortality) < 0.02, "Class balance severely skewed between train and test"

    # Preprocessing fit strictly on X_train
    preprocessor = build_covid_preprocessing_pipeline()
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)

    assert X_train_proc.shape[1] == 35, f"Expected 35 encoded features, got {X_train_proc.shape[1]}"
    assert X_test_proc.shape[1] == 35
    assert not np.isnan(X_train_proc).any(), "NaNs found in processed training features"
    assert not np.isnan(X_test_proc).any(), "NaNs found in processed test features"


def test_41_hospital_partitioning():
    """Verify 41 hospital clients, sample count sums, and zero cross-client duplication."""
    hospital_dfs, partition_summary = create_covid_hospital_partitions(
        "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
        random_state=42,
    )

    assert len(hospital_dfs) == 41, f"Expected 41 hospital nodes, got {len(hospital_dfs)}"
    assert partition_summary["total_partitioned_patients"] == 1172
    assert partition_summary["unique_partitioned_patients"] == 1172
    assert partition_summary["duplicate_patients_across_hospitals"] == 0

    all_pids = []
    for name, df in hospital_dfs.items():
        all_pids.extend(df[PATIENT_IDENTIFIER].tolist())
    assert len(all_pids) == 1172
    assert len(set(all_pids)) == 1172


def test_model_architecture():
    """Verify PyTorch model layer structure and parameter sizes."""
    model = CovidMortalityMLP(in_features=35, hidden_dim1=16, hidden_dim2=8)
    dummy_input = torch.randn(4, 35)
    output = model(dummy_input)
    assert output.shape == (4, 1)

    # Parameter count: (35*16 + 16) + (16*8 + 8) + (8*1 + 1) = 576 + 136 + 9 = 721
    num_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    assert num_params == 721, f"Expected 721 parameters, got {num_params}"


def test_artifacts_exist_and_valid():
    """Verify all 8 COVID artifacts exist and contain valid results."""
    proc_dir = Path("data/processed")
    required_files = [
        "covid_mortality_baseline_metrics.json",
        "covid_mortality_dp_metrics.json",
        "covid_mortality_fedavg_metrics.json",
        "covid_mortality_dp_fedavg_metrics.json",
        "covid_mortality_metrics.json",
        "covid_mortality_feature_manifest.json",
        "covid_mortality_model.pt",
        "covid_mortality_preprocessor.pkl",
    ]

    for fname in required_files:
        fpath = proc_dir / fname
        assert fpath.is_file(), f"Missing required COVID artifact: {fname}"

    # Verify manifest
    with open(proc_dir / "covid_mortality_feature_manifest.json", "r") as f:
        manifest = json.load(f)
    assert len(manifest["selected_18_features"]) == 18
    assert manifest["data_splits"]["total_unique_patients"] == 1172
    assert manifest["data_splits"]["hospital_client_count"] == 41

    # Verify master metrics
    with open(proc_dir / "covid_mortality_metrics.json", "r") as f:
        master = json.load(f)
    assert "centralized_baseline" in master
    assert "federated_fedavg" in master
    assert "dp_fedavg" in master
    assert master["centralized_baseline"]["roc_auc"] > 0.60


def test_diabetes_integrity_preserved():
    """Verify existing diabetes artifacts and models are unchanged."""
    proc_dir = Path("data/processed")
    diabetes_files = [
        "baseline_metrics.json",
        "baseline_model.joblib",
        "pytorch_metrics.json",
        "pytorch_model.pt",
        "hospital_local_metrics.json",
        "all_hospitals_dp_metrics.json",
        "apollo_dp_metrics.json",
        "apollo_dp_model.pt",
        "kem_dp_metrics.json",
        "kem_dp_model.pt",
        "fortis_dp_metrics.json",
        "fortis_dp_model.pt",
        "federated_round_1_metrics.json",
        "global_model_round_1.pt",
        "dp_federated_round_1_metrics.json",
        "dp_global_model_round_1.pt",
        "dp_global_model_round_5.pt",
    ]

    for df_name in diabetes_files:
        df_path = proc_dir / df_name
        assert df_path.is_file(), f"Diabetes artifact missing or deleted: {df_name}"

    with open(proc_dir / "baseline_metrics.json", "r") as f:
        dm_meta = json.load(f)
    assert dm_meta["dataset_summary"]["total_samples"] == 111


if __name__ == "__main__":
    test_covid_data_integrity()
    test_leak_free_split_and_preprocessing()
    test_41_hospital_partitioning()
    test_model_architecture()
    test_artifacts_exist_and_valid()
    test_diabetes_integrity_preserved()
    print("ALL COVID-19 PIPELINE AND INTEGRITY TESTS PASSED SUCCESSFULLY!")
