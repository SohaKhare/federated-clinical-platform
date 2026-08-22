"""Authoritative Preprocessing Pipeline for the YDR Diabetes Dataset.

Based on the official YDR Data Dictionary (Metadata PDF):
- clv2, clv3: 999 = Missing
- clv4, clv5, clv6, clv7, clv8: 99 = Missing
- av1, av2, av3, av4: 999 = Missing (unrecorded 0.0 values in height/weight/BMI also treated as NaN)
- lv2, lv3: 9999 = Missing
- lv4: 99 = Missing

Target Variable:
- clv9 (Clinical Classification): Type 1 Diabetes (1) vs Other (0)
"""

from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

# Authoritative feature specifications per YDR metadata
PATIENT_FEATURES: List[str] = ["pv1", "pv2", "pv3", "pv5"]
CLINICAL_FEATURES: List[str] = ["clv2", "clv3", "clv4", "clv5", "clv6", "clv7", "clv8"]
ANTHROPOMETRY_FEATURES: List[str] = ["av1", "av2", "av3", "av4"]
LAB_FEATURES: List[str] = ["lv2", "lv3", "lv4"]

FEATURE_COLUMNS: List[str] = (
    PATIENT_FEATURES + CLINICAL_FEATURES + ANTHROPOMETRY_FEATURES + LAB_FEATURES
)

TARGET_COLUMN: str = "clv9"

NUMERICAL_FEATURES: List[str] = [
    "pv2",  # Age at registration
    "pv5",  # Age at diagnosis
    "clv2",  # Duration in years
    "clv3",  # Duration in months
    "av1",  # Height (m)
    "av2",  # Weight (kg)
    "av3",  # BMI (kg/m^2)
    "av4",  # Waist (cm)
    "lv2",  # Fasting plasma glucose (mg/dl)
    "lv3",  # Post-prandial plasma glucose (mg/dl)
    "lv4",  # HbA1c (%)
]

CATEGORICAL_FEATURES: List[str] = [
    "pv1",  # Sex (0=Male, 1=Female)
    "pv3",  # State of Residence (1..6)
    "clv4",  # Osmotic symptoms (1=Yes, 0=No)
    "clv5",  # Weight loss (1=Yes, 0=No)
    "clv6",  # Ketosis (1=Yes, 0=No)
    "clv7",  # Incidental (1=Yes, 0=No)
    "clv8",  # Others (1=Yes, 0=No)
]

# Column-specific missing value sentinel codes per YDR Data Dictionary
MISSING_VALUE_CODES: Dict[str, List[float]] = {
    "clv2": [999.0],
    "clv3": [999.0],
    "clv4": [99.0],
    "clv5": [99.0],
    "clv6": [99.0],
    "clv7": [99.0],
    "clv8": [99.0],
    "av1": [999.0],  # Also handles <= 0
    "av2": [999.0],  # Also handles <= 0
    "av3": [999.0],  # Also handles <= 0
    "av4": [999.0],
    "lv2": [9999.0],
    "lv3": [9999.0],
    "lv4": [99.0],
}


def load_raw_data(filepath: Path | str = "data/raw/diabetes.csv") -> pd.DataFrame:
    """Load the raw diabetes CSV file and remove accidental index columns."""
    path = Path(filepath)
    if not path.is_file():
        raise FileNotFoundError(f"Raw dataset not found at: {path.resolve()}")

    df = pd.read_csv(path)

    # Remove accidental CSV index column if present (e.g. Unnamed: 0)
    unnamed_cols = [c for c in df.columns if c.startswith("Unnamed")]
    if unnamed_cols:
        df = df.drop(columns=unnamed_cols)

    return df


def clean_diabetes_data(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.Series, Dict[str, int]]:
    """Clean the raw dataframe using column-specific missing value rules.

    Returns:
        X: DataFrame of cleaned features with legitimate NaNs for missing entries.
        y: Series containing the binary classification target (1 = Type 1 DM, 0 = Other).
        missing_counts: Dictionary mapping feature name to count of missing values identified.
    """
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Target column '{TARGET_COLUMN}' not found in dataset.")

    missing_feature_cols = [col for col in FEATURE_COLUMNS if col not in df.columns]
    if missing_feature_cols:
        raise ValueError(f"Missing required feature columns: {missing_feature_cols}")

    # Extract initial features and target
    X = df[FEATURE_COLUMNS].copy()

    # Binary classification target: Type 1 Diabetes (clv9 == 1) -> 1, Everything else -> 0
    y = (df[TARGET_COLUMN] == 1).astype(int)

    # Column-specific missing value handling based strictly on YDR Metadata
    for col, missing_codes in MISSING_VALUE_CODES.items():
        if col in X.columns:
            for code in missing_codes:
                X[col] = X[col].replace(code, np.nan)

    # Anthropometry validation: height, weight, BMI <= 0 represent unrecorded/invalid measurements
    for col in ["av1", "av2", "av3"]:
        if col in X.columns:
            X.loc[X[col] <= 0, col] = np.nan

    missing_counts = X.isna().sum().to_dict()

    return X, y, missing_counts


def build_preprocessing_pipeline() -> ColumnTransformer:
    """Build a scikit-learn ColumnTransformer for leak-free preprocessing.

    - Numerical features: Imputed using median, scaled using StandardScaler.
    - Categorical features: Imputed using most frequent mode, encoded using OneHotEncoder.
    """
    num_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    cat_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", num_pipeline, NUMERICAL_FEATURES),
            ("cat", cat_pipeline, CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )

    return preprocessor


def prepare_train_test_data(
    filepath: Path | str = "data/raw/diabetes.csv",
    test_size: float = 0.2,
    random_state: int = 42,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, Dict[str, int]]:
    """Load, clean, and split data into stratified train and test sets.

    Guarantees no data leakage: transformations are designed to be fit strictly on train split.
    """
    df = load_raw_data(filepath)
    X, y, missing_counts = clean_diabetes_data(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    return X_train, X_test, y_train, y_test, missing_counts
