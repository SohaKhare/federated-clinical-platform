"""End-to-End Orchestrator for COVID-19 Admission-Time Mortality Prediction Pipeline.

Executes all 5 ML Milestones for Model #2:
1. Centralized Baseline Experiment
2. 41-Hospital Partitioning & Local Differential Privacy (Opacus DP-SGD)
3. Federated Learning (FedAvg)
4. Differentially Private Federated Learning (DP-FedAvg)
5. Comprehensive Metrics Compilation & Feature Manifest Generation

Artifacts Produced:
- data/processed/covid_mortality_baseline_metrics.json
- data/processed/covid_mortality_dp_metrics.json
- data/processed/covid_mortality_fedavg_metrics.json
- data/processed/covid_mortality_dp_fedavg_metrics.json
- data/processed/covid_mortality_metrics.json
- data/processed/covid_mortality_feature_manifest.json
- data/processed/covid_mortality_model.pt
- data/processed/covid_mortality_preprocessor.pkl
"""

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np

from federated.aggregation.covid_dp_fedavg import run_covid_dp_federated_round_1
from federated.aggregation.covid_fedavg import run_covid_federated_round_1
from federated.model.covid_baseline import run_covid_baseline_experiment
from federated.privacy.covid_opacus_trainer import run_all_covid_hospitals_dp_experiment
from federated.preprocessing.covid import (
    CATEGORICAL_FEATURES,
    COVID_LEAKAGE_EXCLUDED_FEATURES,
    HOSPITAL_IDENTIFIER,
    NUMERICAL_FEATURES,
    PATIENT_IDENTIFIER,
    SELECTED_18_FEATURES,
    TARGET_COLUMN,
    TARGET_POSITIVE_VALUE,
    clean_covid_data,
    load_raw_covid_data,
    prepare_covid_train_test_data,
)


def run_complete_covid_pipeline(
    data_path: str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
    hospitals_dir: str = "data/covid_hospitals",
    output_dir: str = "data/processed",
    random_state: int = 42,
) -> Dict[str, Any]:
    """Execute all COVID-19 experimental benchmarks and generate artifacts."""
    print("#" * 85)
    print("  FEDNET PLATFORM — COVID-19 ADMISSION-TIME MORTALITY PREDICTION PIPELINE")
    print("  Dataset: National Clinical Registry of Covid-19")
    print("#" * 85 + "\n")

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    # 1. Run Centralized Baseline Experiment
    baseline_results = run_covid_baseline_experiment(
        data_path=data_path,
        output_dir=output_dir,
        random_state=random_state,
        epochs=100,
        batch_size=16,
        learning_rate=0.01,
    )

    # 2. Run 41-Hospital Local Differential Privacy (DP-SGD) Experiment
    dp_results = run_all_covid_hospitals_dp_experiment(
        raw_data_path=data_path,
        hospitals_dir=hospitals_dir,
        output_dir=output_dir,
        random_state=random_state,
        epochs=10,
        batch_size=8,
        noise_multiplier=0.5,
        max_grad_norm=1.0,
        delta=1e-5,
    )

    # 3. Run Federated Learning (FedAvg)
    fedavg_results = run_covid_federated_round_1(
        raw_data_path=data_path,
        hospitals_dir=hospitals_dir,
        output_dir=output_dir,
        random_state=random_state,
        epochs=10,
        rounds=5,
        batch_size=8,
        learning_rate=0.01,
    )

    # 4. Run Differentially Private Federated Learning (DP-FedAvg)
    dp_fedavg_results = run_covid_dp_federated_round_1(
        raw_data_path=data_path,
        hospitals_dir=hospitals_dir,
        output_dir=output_dir,
        random_state=random_state,
        epochs=10,
        rounds=5,
        batch_size=8,
        learning_rate=0.01,
        noise_multiplier=0.5,
        max_grad_norm=1.0,
        delta=1e-5,
    )

    # 5. Compile Master Metrics File
    master_metrics = {
        "model_name": "COVID-19 Admission-Time Mortality Predictor",
        "target": {
            "source_column": TARGET_COLUMN,
            "positive_label": TARGET_POSITIVE_VALUE,
            "problem_type": "Binary Classification (Imbalanced)",
        },
        "dataset_summary": baseline_results["dataset_summary"],
        "centralized_baseline": baseline_results["metrics"],
        "federated_fedavg": fedavg_results["global_model_after_fedavg"],
        "dp_fedavg": dp_fedavg_results["global_model_after_dp_fedavg_calibrated_threshold"],
        "dp_fedavg_calibrated_threshold": dp_fedavg_results["global_model_after_dp_fedavg_calibrated_threshold"],
        "dp_fedavg_standard_threshold": dp_fedavg_results["global_model_after_dp_fedavg_standard_threshold"],
        "probability_distribution": dp_fedavg_results["probability_distribution"],
        "threshold_scan_diagnostic": dp_fedavg_results["threshold_scan_diagnostic"],
        "local_differential_privacy": {

            "delta": dp_results["privacy_parameters"]["delta"],
            "max_grad_norm": dp_results["privacy_parameters"]["max_grad_norm"],
            "noise_multiplier": dp_results["privacy_parameters"]["noise_multiplier"],
            "min_epsilon": dp_results["privacy_parameters"]["min_epsilon"],
            "max_epsilon": dp_results["privacy_parameters"]["max_epsilon"],
            "mean_epsilon": dp_results["privacy_parameters"]["mean_epsilon"],
        },
        "dp_fedavg_privacy": dp_fedavg_results["privacy_parameters"],
    }

    master_metrics_path = out_path / "covid_mortality_metrics.json"
    with open(master_metrics_path, "w", encoding="utf-8") as f:
        json.dump(master_metrics, f, indent=2)

    # 6. Generate Complete Feature Manifest
    feature_manifest = {
        "model_name": "COVID-19 Admission-Time Mortality Prediction Model",
        "version": "1.0.0",
        "dataset": "National_Clinical_Registry_Covid19_Sample_data.csv",
        "target": {
            "column": TARGET_COLUMN,
            "positive_value": TARGET_POSITIVE_VALUE,
            "binary_mapping": "1 if d347 == 'Death' else 0",
        },
        "patient_identifier": PATIENT_IDENTIFIER,
        "hospital_identifier": HOSPITAL_IDENTIFIER,
        "selected_18_features": [
            {
                "variable_id": "a103",
                "clinical_meaning": "Referred case vs Direct Admission",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Direct Admission", "Referred case"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Recorded at time of entry; no post-admission course information",
            },
            {
                "variable_id": "a105",
                "clinical_meaning": "Age in completed years",
                "type": "Numeric (Continuous)",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": "0-98",
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Static demographic variable recorded at presentation",
            },
            {
                "variable_id": "a106",
                "clinical_meaning": "Gender of the respondent",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Male", "Female"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Static demographic variable recorded at presentation",
            },
            {
                "variable_id": "a108",
                "clinical_meaning": "Migrant worker status",
                "type": "Nominal",
                "non_null_count": 1158,
                "missing_percent": 1.19,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Socio-demographic factor; imputed via mode on train split",
            },
            {
                "variable_id": "a130",
                "clinical_meaning": "Symptom present at admission",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["1. Yes", "0. No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial triage symptom checklist",
            },
            {
                "variable_id": "a131",
                "clinical_meaning": "History of fever",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Presenting symptom prior to hospital admission",
            },
            {
                "variable_id": "a137",
                "clinical_meaning": "Sore throat",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial presenting respiratory symptom",
            },
            {
                "variable_id": "a138",
                "clinical_meaning": "Runny nose",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial presenting respiratory symptom",
            },
            {
                "variable_id": "a139",
                "clinical_meaning": "Loss of smell (Anosmia)",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial sensory presenting symptom",
            },
            {
                "variable_id": "a141",
                "clinical_meaning": "Chest pain",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial presenting cardiopulmonary symptom",
            },
            {
                "variable_id": "a145",
                "clinical_meaning": "Fatigue / Malaise",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Constitutional presenting symptom",
            },
            {
                "variable_id": "a150",
                "clinical_meaning": "Headache",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial neurological symptom",
            },
            {
                "variable_id": "a152",
                "clinical_meaning": "Seizures",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["1. Yes", "0"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial neurological presentation",
            },
            {
                "variable_id": "a153",
                "clinical_meaning": "Weakness of limbs / Inability to walk",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Functional mobility assessment at admission",
            },
            {
                "variable_id": "a154",
                "clinical_meaning": "Abdominal pain",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial gastrointestinal symptom",
            },
            {
                "variable_id": "a155",
                "clinical_meaning": "Vomiting / Nausea",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial gastrointestinal symptom",
            },
            {
                "variable_id": "a156",
                "clinical_meaning": "Diarrhea",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Yes", "No"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Initial gastrointestinal symptom",
            },
            {
                "variable_id": "a200",
                "clinical_meaning": "Pre-existing Comorbidities present",
                "type": "Nominal",
                "non_null_count": 1172,
                "missing_percent": 0.0,
                "allowed_categories": ["Present", "Absent"],
                "prediction_timestamp": "Admission / Triage",
                "leakage_rationale": "Baseline patient history prior to infection",
            },
        ],
        "excluded_features_summary": {
            "total_excluded": len(COVID_LEAKAGE_EXCLUDED_FEATURES),
            "sample_excluded": COVID_LEAKAGE_EXCLUDED_FEATURES[:15],
            "exclusion_reason": "Post-admission outcomes, duration of stay, ICU days, in-hospital medications, mechanical ventilation, and post-discharge follow-ups",
        },
        "preprocessing_rules": {
            "deduplication": "Drop duplicates on a101, keep='first'",
            "numerical_strategy": "SimpleImputer(strategy='median') + StandardScaler()",
            "categorical_strategy": "SimpleImputer(strategy='most_frequent') + OneHotEncoder(handle_unknown='ignore')",
            "leakage_prevention": "All transformations fit strictly on training partition (X_train)",
        },
        "data_splits": {
            "random_seed": random_state,
            "total_unique_patients": baseline_results["dataset_summary"]["total_unique_patients"],
            "train_patients": baseline_results["dataset_summary"]["train_samples"],
            "test_patients": baseline_results["dataset_summary"]["test_samples"],
            "train_deaths": baseline_results["dataset_summary"]["train_deaths"],
            "train_non_deaths": baseline_results["dataset_summary"]["train_non_deaths"],
            "test_deaths": baseline_results["dataset_summary"]["test_deaths"],
            "test_non_deaths": baseline_results["dataset_summary"]["test_non_deaths"],
            "hospital_client_count": 41,
        },
        "model_architecture": {
            "type": "CovidMortalityMLP",
            "input_dimension": baseline_results["architecture"]["input_dim"],
            "hidden_layer_1": 16,
            "hidden_layer_2": 8,
            "output_dimension": 1,
            "activation": "ReLU",
            "loss_function": "BCEWithLogitsLoss",
            "positive_class_weight": baseline_results["hyperparameters"]["pos_weight"],
        },
        "training_hyperparameters": {
            "optimizer": "AdamW",
            "learning_rate": 0.01,
            "weight_decay": 0.001,
            "centralized_epochs": 100,
            "centralized_batch_size": 16,
            "local_dp_epochs": 10,
            "local_dp_batch_size": 8,
            "federated_rounds": 5,
        },
        "differential_privacy": {
            "framework": "Opacus 1.6.0",
            "noise_multiplier": 0.5,
            "max_grad_norm": 1.0,
            "target_delta": 1e-5,
            "accountant": "PRV / RDP",
            "min_client_epsilon": dp_results["privacy_parameters"]["min_epsilon"],
            "max_client_epsilon": dp_results["privacy_parameters"]["max_epsilon"],
            "mean_client_epsilon": dp_results["privacy_parameters"]["mean_epsilon"],
        },
    }

    manifest_path = out_path / "covid_mortality_feature_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(feature_manifest, f, indent=2)

    print("\n" + "#" * 85)
    print("  FEDNET COVID-19 MODEL PIPELINE COMPLETE — ALL ARTIFACTS GENERATED")
    print("#" * 85)
    print(f"  1. Master Metrics:       {master_metrics_path.resolve()}")
    print(f"  2. Feature Manifest:     {manifest_path.resolve()}")
    print(f"  3. Baseline Metrics:     {(out_path / 'covid_mortality_baseline_metrics.json').resolve()}")
    print(f"  4. DP Metrics (41 Hosp): {(out_path / 'covid_mortality_dp_metrics.json').resolve()}")
    print(f"  5. FedAvg Metrics:       {(out_path / 'covid_mortality_fedavg_metrics.json').resolve()}")
    print(f"  6. DP-FedAvg Metrics:    {(out_path / 'covid_mortality_dp_fedavg_metrics.json').resolve()}")
    print(f"  7. Model Weights:        {(out_path / 'covid_mortality_model.pt').resolve()}")
    print(f"  8. Preprocessor:         {(out_path / 'covid_mortality_preprocessor.pkl').resolve()}")
    print("#" * 85 + "\n")

    return master_metrics


if __name__ == "__main__":
    run_complete_covid_pipeline()
