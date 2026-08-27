"""CatBoost disease classifier for patient_medical_dataset_improved.csv.

 Replaces the previous heart-disease Linear/ClinicalModel pipeline for
 single-patient prediction. CatBoost handles the mixed numeric/categorical
 clinical feature set without one-hot encoding the high-cardinality text fields.

Dataset contract (fixed, do not reshuffle):
  rows 1-2500    -> training data (also seeded into Postgres patients2)
  rows 2501-3000 -> held-out test set for accuracy/precision/recall/F1/CM
  rows 3001-5000 -> unseen "future" pool surfaced via the Add Patients button

Features: age, gender, previous_diagnosis, medical_conditions,
current_symptoms, hospital, location, diagnosis_date (year/month derived),
temperature, heart rate, blood pressure, glucose, BMI, oxygen saturation,
symptom duration, smoking status, and family history.
The target (`diagnosis`) and its derivative `disease_type` are never inputs.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.preprocessing import LabelEncoder
from catboost import CatBoostClassifier

DATA_PATH = Path(__file__).parents[2] / "data" / "patient_medical_dataset_improved.csv"
MODEL_DIR = Path.cwd() / "models"
MODEL_PATH = MODEL_DIR / "disease_catboost_model.joblib"
METRICS_PATH = MODEL_DIR / "disease_catboost_metrics.json"

TRAIN_END = 2500   # rows 1-2500 inclusive
TEST_END = 3000    # rows 2501-3000 inclusive
POOL_START = 3001  # rows 3001-5000: future/unseen pool

TARGET = "diagnosis"
# Target-derived column; excluded from features on purpose.
LEAKY_COLUMNS = {TARGET, "disease_type", "patient_id"}

CATEGORICAL_FEATURES = [
    "gender",
    "previous_diagnosis",
    "medical_conditions",
    "current_symptoms",
    "hospital",
    "location",
    "smoking_status",
    "family_history",
]
NUMERIC_FEATURES = [
    "age",
    "temperature_c",
    "heart_rate_bpm",
    "systolic_bp",
    "diastolic_bp",
    "blood_glucose_mg_dl",
    "bmi",
    "oxygen_saturation_pct",
    "symptom_duration_days",
]
DATE_COLUMN = "diagnosis_date"
MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES + [
    "diagnosis_year",
    "diagnosis_month",
]


def _load_frame() -> pd.DataFrame:
    frame = pd.read_csv(DATA_PATH)
    frame["_row_number"] = np.arange(1, len(frame) + 1)
    return frame


def training_rows() -> pd.DataFrame:
    return _load_frame().iloc[:TRAIN_END]


def test_rows() -> pd.DataFrame:
    return _load_frame().iloc[TRAIN_END:TEST_END]


def future_pool() -> pd.DataFrame:
    # POOL_START is a one-based dataset row number; iloc is zero-based.
    return _load_frame().iloc[POOL_START - 1:]


def _date_parts(series: pd.Series) -> pd.DataFrame:
    dates = pd.to_datetime(series, errors="coerce")
    return pd.DataFrame(
        {
            "diagnosis_year": dates.dt.year.fillna(0).astype(int),
            "diagnosis_month": dates.dt.month.fillna(0).astype(int),
        },
        index=series.index,
    )


class DiseaseModel:
    """CatBoost classifier over the improved mixed-type clinical feature set."""

    def __init__(self) -> None:
        self.label_encoder: LabelEncoder | None = None
        self.class_labels: list[str] = []
        self.model: CatBoostClassifier | None = None

    # -- feature construction -------------------------------------------------

    def _raw_features(self, frame: pd.DataFrame) -> pd.DataFrame:
        numeric = frame[NUMERIC_FEATURES].apply(pd.to_numeric, errors="coerce").fillna(0)
        categorical = frame[CATEGORICAL_FEATURES].fillna("Unknown").astype(str)
        dates = _date_parts(frame[DATE_COLUMN])
        return pd.concat([numeric, categorical, dates], axis=1)[MODEL_FEATURES]

    def _transform(self, frame: pd.DataFrame) -> pd.DataFrame:
        # CatBoost accepts a DataFrame and uses the categorical column names
        # supplied during fit. Keep this helper for a single inference path.
        return self._raw_features(frame)

    # -- training / evaluation -------------------------------------------------

    def fit(self) -> dict[str, object]:
        train = training_rows()
        test = test_rows()

        self.label_encoder = LabelEncoder()
        y_train = self.label_encoder.fit_transform(train[TARGET].astype(str))
        self.class_labels = [str(c) for c in self.label_encoder.classes_]

        x_train = self._transform(train)
        x_test = self._transform(test)
        y_test = self.label_encoder.transform(test[TARGET].astype(str))

        model = CatBoostClassifier(
            iterations=700,
            depth=7,
            learning_rate=0.08,
            loss_function="MultiClass",
            eval_metric="Accuracy",
            random_seed=42,
            l2_leaf_reg=5,
            thread_count=4,
            verbose=False,
        )
        model.fit(
            x_train,
            y_train,
            cat_features=CATEGORICAL_FEATURES,
            eval_set=(x_test, y_test),
            early_stopping_rounds=80,
            verbose=False,
        )
        self.model = model

        predictions = model.predict(x_test).astype(int).ravel()
        metrics = {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "precision": float(precision_score(y_test, predictions, average="weighted", zero_division=0)),
            "recall": float(recall_score(y_test, predictions, average="weighted", zero_division=0)),
            "f1": float(f1_score(y_test, predictions, average="weighted", zero_division=0)),
            "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
            "classes": self.class_labels,
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }

        MODEL_DIR.mkdir(exist_ok=True)
        joblib.dump(
            {
                "model": model,
                "label_encoder": self.label_encoder,
                "class_labels": self.class_labels,
            },
            MODEL_PATH,
        )
        METRICS_PATH.write_text(json.dumps(metrics, indent=2))
        return metrics

    # -- inference ---------------------------------------------------------------

    def ensure_loaded(self) -> None:
        if self.model is not None:
            return
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                "Disease model not trained yet. Run `uv run train-disease-model` first."
            )
        bundle = joblib.load(MODEL_PATH)
        self.model = bundle["model"]
        self.label_encoder = bundle["label_encoder"]
        self.class_labels = bundle["class_labels"]

    def predict_rows(self, frame: pd.DataFrame) -> list[dict[str, object]]:
        self.ensure_loaded()
        x = self._transform(frame)
        probabilities = self.model.predict_proba(x)
        indices = probabilities.argmax(axis=1)
        results: list[dict[str, object]] = []
        for row_index, class_index in enumerate(indices):
            results.append(
                {
                    "predicted_diagnosis": self.class_labels[class_index],
                    "confidence": round(float(probabilities[row_index][class_index]), 4),
                    "probabilities": {
                        label: round(float(probabilities[row_index][i]), 4)
                        for i, label in enumerate(self.class_labels)
                    },
                }
            )
        return results


_singleton: DiseaseModel | None = None


def get_model() -> DiseaseModel:
    global _singleton
    if _singleton is None:
        _singleton = DiseaseModel()
    return _singleton


# -- trends ----------------------------------------------------------------------


def disease_trends(granularity: str = "month") -> list[dict[str, object]]:
    """Historical disease counts aggregated by diagnosis_date.

    Kept separate from prediction: this is pure descriptive analytics over the
    training slice (the same data seeded into patients2).
    """
    frame = training_rows().copy()
    frame["diagnosis_date"] = pd.to_datetime(frame[DATE_COLUMN], errors="coerce")
    frame = frame.dropna(subset=["diagnosis_date"])

    if granularity == "year":
        frame["period"] = frame["diagnosis_date"].dt.strftime("%Y")
    else:
        frame["period"] = frame["diagnosis_date"].dt.strftime("%Y-%m")

    counts = (
        frame.groupby(["period", TARGET])
        .size()
        .reset_index(name="count")
        .sort_values(["period", TARGET])
    )

    periods = sorted(counts["period"].unique())
    diseases = sorted(counts[TARGET].unique())
    series: dict[str, dict[str, object]] = {}
    for period in periods:
        period_rows = counts[counts["period"] == period]
        series[period] = {
            "period": period,
            **{disease: int(period_rows.loc[period_rows[TARGET] == disease, "count"].sum()) for disease in diseases},
            "total": int(period_rows["count"].sum()),
        }

    # Regional breakdown: latest-period top diseases per location.
    regional = (
        frame.groupby(["location", TARGET])
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    by_location: dict[str, list[dict[str, object]]] = {}
    for location in sorted(regional["location"].unique()):
        rows = regional[regional["location"] == location].head(5)
        by_location[str(location)] = [
            {"diagnosis": row[TARGET], "count": int(row["count"])} for _, row in rows.iterrows()
        ]

    return [
        {
            "granularity": granularity,
            "points": [series[p] for p in periods],
            "diseases": diseases,
            "regional_top": by_location,
        }
    ]


def main() -> None:
    metrics = DiseaseModel().fit()
    print(f"Trained CatBoost disease classifier: {json.dumps(metrics, indent=2)}")


if __name__ == "__main__":
    main()