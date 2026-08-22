"""Baseline Logistic Regression Model for Centralized Binary Diabetes Classification.

Target: Type 1 Diabetes (clv9 == 1) vs Other (clv9 != 1)

DISCLAIMER:
This is an experimental machine learning baseline developed strictly for research
and validation purposes within the FEDNET project. It is NOT clinically validated
and must NOT be used as a medical diagnostic system.
"""

import json
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline

from federated.preprocessing.diabetes import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    NUMERICAL_FEATURES,
    build_preprocessing_pipeline,
    load_raw_data,
    prepare_train_test_data,
)


def build_baseline_model(
    random_state: int = 42,
    max_iter: int = 2000,
) -> Pipeline:
    """Construct the end-to-end baseline pipeline.

    Combines preprocessing ColumnTransformer and LogisticRegression classifier
    into a single scikit-learn Pipeline to guarantee zero data leakage.
    """
    preprocessor = build_preprocessing_pipeline()

    classifier = LogisticRegression(
        class_weight="balanced",
        random_state=random_state,
        max_iter=max_iter,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )

    return pipeline


def train_and_evaluate_baseline(
    data_path: str = "data/raw/diabetes.csv",
    output_dir: str = "data/processed",
    test_size: float = 0.2,
    random_state: int = 42,
    max_iter: int = 2000,
) -> Dict[str, Any]:
    """Train the centralized logistic regression baseline and evaluate all metrics.

    Saves metrics JSON and serialized pipeline artifact to output_dir.
    """
    print("=" * 65)
    print("  FEDNET CENTRALIZED BASELINE ML EXPERIMENT")
    print("  Target: Type 1 Diabetes (clv9=1) vs Other Diabetes Types (clv9!=1)")
    print("=" * 65)
    print("\n[NOTE] This is an experimental baseline model for clinical ML research.")
    print("       It is NOT a clinically validated diagnostic tool.\n")

    # Step 1: Load and split data
    df_raw = load_raw_data(data_path)
    X_train, X_test, y_train, y_test, missing_counts = prepare_train_test_data(
        filepath=data_path,
        test_size=test_size,
        random_state=random_state,
    )

    total_samples = len(df_raw)
    total_features = len(FEATURE_COLUMNS)
    type1_count = int((df_raw["clv9"] == 1).sum())
    other_count = int((df_raw["clv9"] != 1).sum())
    train_count = len(X_train)
    test_count = len(X_test)
    train_t1 = int((y_train == 1).sum())
    train_other = int((y_train == 0).sum())
    test_t1 = int((y_test == 1).sum())
    test_other = int((y_test == 0).sum())

    print("-" * 65)
    print("DATASET SUMMARY & COHORT CHARACTERISTICS")
    print("-" * 65)
    print(f"Raw Dataset Shape:       {df_raw.shape[0]} rows x {df_raw.shape[1]} columns")
    print(f"Total Samples Analyzed:  {total_samples}")
    print(f"Total Initial Features:  {total_features}")
    print(f"  - Numerical Features:  {len(NUMERICAL_FEATURES)} -> {NUMERICAL_FEATURES}")
    print(f"  - Categorical Features:{len(CATEGORICAL_FEATURES)} -> {CATEGORICAL_FEATURES}")
    print(f"\nTarget Class Distribution (clv9):")
    print(f"  - Type 1 Diabetes (Class 1): {type1_count} ({type1_count / total_samples * 100:.1f}%)")
    print(f"  - Other Diabetes (Class 0):  {other_count} ({other_count / total_samples * 100:.1f}%)")
    print(f"\nStratified Split (test_size={test_size}, random_state={random_state}):")
    print(f"  - Training Set: {train_count} samples (Type 1: {train_t1}, Other: {train_other})")
    print(f"  - Test Set:     {test_count} samples (Type 1: {test_t1}, Other: {test_other})")

    print("\n" + "-" * 65)
    print("AUTHORITATIVE MISSING VALUES IDENTIFIED (Per YDR Metadata PDF)")
    print("-" * 65)
    for col, count in missing_counts.items():
        if count > 0:
            print(f"  - {col:<6}: {count:>3} missing values ({count / total_samples * 100:>5.1f}%)")

    # Step 2: Build and fit pipeline (Preprocessors fit ONLY on X_train)
    model = build_baseline_model(random_state=random_state, max_iter=max_iter)
    model.fit(X_train, y_train)

    # Step 3: Evaluate on untouched test set
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, zero_division=0))
    rec = float(recall_score(y_test, y_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))
    roc_auc = float(roc_auc_score(y_test, y_prob))
    cm = confusion_matrix(y_test, y_pred).tolist()

    print("\n" + "-" * 65)
    print("BASELINE MODEL EVALUATION RESULTS (Test Set)")
    print("-" * 65)
    print(f"  Accuracy:         {acc:.4f} ({acc * 100:.2f}%)")
    print(f"  Precision:        {prec:.4f}")
    print(f"  Recall:           {rec:.4f}")
    print(f"  F1 Score:         {f1:.4f}")
    print(f"  ROC-AUC:          {roc_auc:.4f}")
    print(f"\n  Confusion Matrix:")
    print(f"    [[TN={cm[0][0]:<2}, FP={cm[0][1]:<2}],")
    print(f"     [FN={cm[1][0]:<2}, TP={cm[1][1]:<2}]]")
    print(f"    - True Negatives (Correct Non-T1): {cm[0][0]}")
    print(f"    - False Positives (Other as T1):   {cm[0][1]}")
    print(f"    - False Negatives (T1 as Other):   {cm[1][0]}")
    print(f"    - True Positives (Correct T1):     {cm[1][1]}")

    # Inspect learned model weights
    preprocessor = model.named_steps["preprocessor"]
    cat_encoder = preprocessor.named_transformers_["cat"].named_steps["encoder"]
    encoded_cat_names = cat_encoder.get_feature_names_out(CATEGORICAL_FEATURES).tolist()
    all_feature_names = NUMERICAL_FEATURES + encoded_cat_names
    coefficients = model.named_steps["classifier"].coef_[0].tolist()
    intercept = float(model.named_steps["classifier"].intercept_[0])

    print("\n" + "-" * 65)
    print("TOP LEARNED FEATURE COEFFICIENTS")
    print("-" * 65)
    sorted_coefs = sorted(
        zip(all_feature_names, coefficients),
        key=lambda x: abs(x[1]),
        reverse=True,
    )
    for name, val in sorted_coefs[:10]:
        direction = "predicts Type 1" if val > 0 else "predicts Other"
        print(f"  {name:<18}: {val:>+7.4f}  ({direction})")

    # Step 4: Save outputs
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics_path = out_dir / "baseline_metrics.json"
    model_path = out_dir / "baseline_model.joblib"

    results = {
        "model_type": "LogisticRegression",
        "hyperparameters": {
            "class_weight": "balanced",
            "random_state": random_state,
            "max_iter": max_iter,
        },
        "dataset_summary": {
            "raw_shape": list(df_raw.shape),
            "total_samples": total_samples,
            "total_features": total_features,
            "class_distribution": {
                "type_1": type1_count,
                "other": other_count,
            },
            "missing_values_handled": missing_counts,
            "train_samples": train_count,
            "test_samples": test_count,
            "train_class_breakdown": {"type_1": train_t1, "other": train_other},
            "test_class_breakdown": {"type_1": test_t1, "other": test_other},
        },
        "metrics": {
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
            "f1_score": f1,
            "roc_auc": roc_auc,
            "confusion_matrix": cm,
        },
        "features": {
            "numerical": NUMERICAL_FEATURES,
            "categorical": CATEGORICAL_FEATURES,
            "encoded_feature_names": all_feature_names,
            "coefficients": dict(zip(all_feature_names, coefficients)),
            "intercept": intercept,
        },
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    joblib.dump(model, model_path)

    print("\n" + "=" * 65)
    print(f"  Artifacts saved successfully:")
    print(f"  - Metrics JSON: {metrics_path.resolve()}")
    print(f"  - Serialized Model: {model_path.resolve()}")
    print("=" * 65)

    return results


if __name__ == "__main__":
    train_and_evaluate_baseline()
