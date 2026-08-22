"""Authoritative Preprocessing Pipeline for the COVID-19 Registry Dataset.

Based on the National Clinical Registry of Covid-19 Data Dictionary and Dataset:
- Target: Binary mortality derived from WHO clinical outcome field d347 == "Death"
- Prediction Point: At or before hospital admission / initial triage
- Features: Exactly 18 admission-time clinical variables (1 numerical, 17 categorical)
- Leak-Free: All transformers fitted strictly on training partition
- Patient-Level Deduplication: a101 used to identify and deduplicate patients
"""

from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

PATIENT_IDENTIFIER: str = "a101"
HOSPITAL_IDENTIFIER: str = "a102"
TARGET_COLUMN: str = "d347"
TARGET_POSITIVE_VALUE: str = "Death"

# Exact 18 admission-time selected features (Form 1 / initial presentation)
NUMERICAL_FEATURES: List[str] = [
    "a105",  # Age in completed years (Numeric Continuous)
]

CATEGORICAL_FEATURES: List[str] = [
    "a103",  # Referred case vs Direct Admission (Nominal)
    "a106",  # Gender of respondent: Male, Female (Nominal)
    "a108",  # Migrant worker status: Yes, No (Nominal)
    "a130",  # Symptom present at presentation: 1. Yes, 0. No (Nominal)
    "a131",  # History of fever: Yes, No (Nominal)
    "a137",  # Sore throat: Yes, No (Nominal)
    "a138",  # Runny nose: Yes, No (Nominal)
    "a139",  # Loss of smell / Anosmia: Yes, No (Nominal)
    "a141",  # Chest pain: Yes, No (Nominal)
    "a145",  # Fatigue / Malaise: Yes, No (Nominal)
    "a150",  # Headache: Yes, No (Nominal)
    "a152",  # Seizures: 1. Yes, 0 (Nominal)
    "a153",  # Weakness of limbs / inability to walk: Yes, No (Nominal)
    "a154",  # Abdominal pain: Yes, No (Nominal)
    "a155",  # Vomiting / Nausea: Yes, No (Nominal)
    "a156",  # Diarrhea: Yes, No (Nominal)
    "a200",  # Baseline Comorbidities: Present, Absent (Nominal)
]

SELECTED_18_FEATURES: List[str] = NUMERICAL_FEATURES + CATEGORICAL_FEATURES

# Comprehensive list of variables excluded to prevent target or temporal leakage
COVID_LEAKAGE_EXCLUDED_FEATURES: List[str] = [
    # Primary & Secondary Outcome Variables
    "d337",  # Administrative outcome / visit type
    "d339",  # Repeat RT-PCR result
    "d340",  # Date of negative RT-PCR
    "d341",  # Discharged to destination (Home, Other Hospital, Isolation)
    "d342",  # Clinical discharge in days
    "d344",  # Immediate cause of death
    "d345",  # Antecedent cause code
    "d346",  # Antecedent cause text
    "d347",  # Primary target (WHO clinical progression outcome)
    "d348",  # Dead indicator
    "d351",  # Antecedent cause (A)
    "d354",  # Duration outcome
    "f104",  # Form 6 outcome
    "g102",  # Form 7 follow-up patient status (Alive, Dead, Lost)
    "g178",  # Form 7 death cause
    "g218",  # Form 7 death text
    "g298",  # Form 7 follow-up death status
    "h448",  # Form 8 outcome
    "h450",  # Form 8 diagnosis at outcome
    "h454",  # Form 8 outcome diagnosis
    "h455",  # Form 8 outcome diagnosis specify
    # Timestamps, Dates, and Hospital Stay Durations
    "d331",  # Total duration of hospital stay (days)
    "d332",  # Duration in ICU (days)
    "d333",  # Duration in HDU (days)
    "d334",  # Duration in Ward (days)
    "d338",  # Date of discharge
    "d343",  # Date of death
    "d349",  # Date death
    "d353",  # Admission date
    "d356",  # Oxygen start date
    "d357",  # Transfer date
    "d358",  # Date of LAMA
    "g103",  # Follow-up date of discharge
    "g104",  # Follow-up date of death
    "g105",  # Follow-up date death new
    "g285", "g286", "g287", "g288", "g289", "g290",
    "h102",  # Form 8 filling date
    "h118",  # Form 8 date of admission
    "h169",  # Form 8 DOB
    "h174",  # Form 8 discharge date
    "h178",  # Form 8 onset of MISC
    "h212", "h213", "h220", "h221",
    "h355",  # ICU days (Form 8)
    "h359",  # Oxygen therapy days
    "h362",  # NIV days
    "h364",  # Invasive ventilation days
    "h367",  # Inotropes days
    "h449",  # Outcome date
    # In-Hospital Interventions, Medication Courses, and Respiratory Support
    "d101", "d102", "d103", "d104", "d105", "d106",  # Hydroxychloroquine course
    "d107", "d108", "d109", "d110", "d111", "d112",  # Methylprednisolone course
    "d113", "d114", "d115", "d116", "d117", "d118",  # Dexamethasone course
    "d119", "d120", "d121", "d122",                  # Hydrocortisone course
    "d123", "d124", "d125", "d126", "d127", "d128", "d129", "d130",  # Prednisone
    "d131", "d132", "d133", "d134", "d135", "d136",  # Prednisolone
    "d137", "d138", "d139", "d140", "d141", "d142",  # Remdesivir course
    "d143", "d144", "d145", "d146", "d147", "d148",  # Favipiravir
    "d149", "d150", "d151", "d152", "d153", "d154",  # Lopinavir/Ritonavir
    "d155", "d156", "d157", "d158", "d159", "d160",  # Oseltamivir
    "d161", "d162", "d163", "d164", "d165", "d166",  # Azithromycin
    "d167", "d168", "d169", "d170", "d171", "d172",  # Plasma
    "d173", "d174", "d175", "d176", "d177", "d178",  # Interferon alpha
    "d179", "d180", "d181", "d182", "d183", "d184",  # Tocilizumab
    "d185", "d186", "d187", "d188", "d189", "d190",  # Itolizumab
    "d191", "d192", "d193", "d194", "d195", "d196",  # Ivermectin
    "d197", "d198", "d199", "d200", "d201", "d202",  # Doxycycline
    "d203", "d204", "d205", "d206", "d207", "d208",  # IVIG
    "d209", "d210", "d211", "d212", "d213", "d214",  # UFH
    "d215", "d216", "d217", "d218", "d219", "d220",  # LMWH
    "d221", "d222", "d223", "d224", "d225", "d226",
    "d227", "d228", "d229", "d230", "d231", "d232",
    "d282", "d283", "d284", "d285", "d286", "d287",  # Supplemental O2 in hospital
    "d288", "d289", "d290", "d291", "d292", "d293", "d294",  # CPAP, BiPAP, IMV, ECMO
    "d295", "d296", "d297", "d298", "d299", "d300", "d301", "d302", "d303", "d304",  # Vasopressors, RRT
    # In-Hospital Complications Developed During Stay
    "d305",  # Septic shock developed
    "d306",  # ARDS developed
    "d307",  # Hospital acquired pneumonia developed
    "d308",  # Fungal pneumonia
    "d309",  # Pneumothorax
    "d310",  # Pleural effusion
    "d311",  # Congestive heart failure
    "d312",  # Myocarditis
    "d313",  # Cardiac arrhythmia
    "d314",  # Myocardial infarction
    "d315",  # Meningitis / Encephalitis
    "d316",  # Seizure in hospital
    "d317",  # Stroke / CVA
    "d318",  # Rhabdomyolysis
    "d319",  # Coagulation disorder / DIC / DVT / PTE
    "d320",  # Acute kidney injury
    "d321",  # Gastrointestinal hemorrhage
    "d322",  # Pancreatitis
    "d323",  # Liver dysfunction
    "d324",  # Anemia in hospital
    "d325",  # Hyperglycemia in hospital
    "d326",  # Hypoglycemia in hospital
    "d330",  # Adverse drug reactions
    "d335",  # Time taken for symptom resolution
    "d336",  # Final complete diagnosis
]


def load_raw_covid_data(
    filepath: Path | str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
) -> pd.DataFrame:
    """Load the raw COVID-19 registry CSV file and remove accidental index columns."""
    path = Path(filepath)
    if not path.is_file():
        # Try relative to federated root
        alt_path_1 = Path(__file__).parents[2] / filepath
        alt_path_2 = Path(__file__).parents[3] / "federated" / filepath
        alt_path_3 = Path.cwd() / "federated" / filepath
        if alt_path_1.is_file():
            path = alt_path_1
        elif alt_path_2.is_file():
            path = alt_path_2
        elif alt_path_3.is_file():
            path = alt_path_3
        else:
            raise FileNotFoundError(f"Raw dataset not found at: {path.resolve()}")

    df = pd.read_csv(path, low_memory=False)

    # Remove accidental CSV index column if present (e.g. Unnamed: 0)
    unnamed_cols = [c for c in df.columns if c.startswith("Unnamed")]
    if unnamed_cols:
        df = df.drop(columns=unnamed_cols)

    return df



def clean_covid_data(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, Dict[str, Any]]:
    """Clean the raw dataframe, perform patient-level deduplication, extract features and target.

    Deduplication Rule:
        a101 is used as unique patient identifier. When a patient appears multiple times
        (12 duplicate IDs verified), the first record is kept (both rows have identical
        clinical outcome d347 and hospital ID a102).

    Hospital Assignment Rule:
        a102 is preserved as hospital identifier. For the 7 records where a102 is NaN,
        Form 8 hospital identifier h103 is used to preserve complete patient allocation.

    Returns:
        X: DataFrame of cleaned 18 features.
        y: Series containing the binary classification target (1 = Death, 0 = Non-Death).
        df_dedup: DataFrame of deduplicated patient rows with metadata.
        summary: Dictionary of cleaning summary statistics.
    """
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Target column '{TARGET_COLUMN}' not found in dataset.")

    missing_cols = [col for col in SELECTED_18_FEATURES if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required feature columns: {missing_cols}")

    total_raw_rows = len(df)
    unique_patients_raw = df[PATIENT_IDENTIFIER].nunique()
    duplicate_patient_count = (df[PATIENT_IDENTIFIER].value_counts() > 1).sum()

    # Patient-level deduplication: keep first occurrence
    df_dedup = df.drop_duplicates(subset=[PATIENT_IDENTIFIER], keep="first").copy()
    total_dedup_patients = len(df_dedup)

    # Target: binary mortality
    y_raw = (df[TARGET_COLUMN] == TARGET_POSITIVE_VALUE).astype(int)
    y = (df_dedup[TARGET_COLUMN] == TARGET_POSITIVE_VALUE).astype(int)

    # Clean hospital assignment
    mode_hospital = df_dedup[HOSPITAL_IDENTIFIER].mode()[0]
    valid_hospitals = sorted([int(h) for h in df_dedup[HOSPITAL_IDENTIFIER].dropna().unique()])

    hosp_clean = df_dedup[HOSPITAL_IDENTIFIER].copy()
    for idx, val in hosp_clean.items():
        if pd.isna(val):
            h103_val = pd.to_numeric(df_dedup.loc[idx, "h103"], errors="coerce") if "h103" in df_dedup.columns else np.nan
            if pd.notna(h103_val) and int(h103_val) in valid_hospitals:
                hosp_clean.loc[idx] = float(h103_val)
            else:
                hosp_clean.loc[idx] = float(mode_hospital)

    df_dedup["hospital_id"] = hosp_clean.astype(int)

    # Extract 18 features
    X = df_dedup[SELECTED_18_FEATURES].copy()

    # Standardize categorical strings
    for col in CATEGORICAL_FEATURES:
        X[col] = (
            X[col]
            .astype(str)
            .str.strip()
            .replace({"nan": np.nan, "None": np.nan, "": np.nan})
        )

    # Convert numerical age
    X["a105"] = pd.to_numeric(X["a105"], errors="coerce")

    missing_counts = X.isna().sum().to_dict()

    summary: Dict[str, Any] = {
        "total_raw_rows": total_raw_rows,
        "unique_patients_raw": unique_patients_raw,
        "duplicate_patient_ids": int(duplicate_patient_count),
        "total_dedup_patients": total_dedup_patients,
        "deaths_before_dedup": int((y_raw == 1).sum()),
        "non_deaths_before_dedup": int((y_raw == 0).sum()),
        "mortality_rate_before_dedup": float((y_raw == 1).mean() * 100),
        "deaths_after_dedup": int((y == 1).sum()),
        "non_deaths_after_dedup": int((y == 0).sum()),
        "mortality_rate_after_dedup": float((y == 1).mean() * 100),
        "total_hospitals": df_dedup["hospital_id"].nunique(),
        "missing_counts": missing_counts,
    }

    return X, y, df_dedup, summary


def build_covid_preprocessing_pipeline() -> ColumnTransformer:
    """Build a scikit-learn ColumnTransformer for leak-free COVID preprocessing.

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


def prepare_covid_train_test_data(
    filepath: Path | str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
    test_size: float = 0.2,
    random_state: int = 42,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """Load, clean, deduplicate, and split COVID data into stratified train/test partitions.

    Guarantees no data leakage:
    - Deduplicated by unique patient ID (a101)
    - Stratified train/test split on target mortality
    - Preprocessing pipelines are designed to be fit strictly on train split
    """
    df = load_raw_covid_data(filepath)
    X, y, df_dedup, summary = clean_covid_data(df)

    train_idx, test_idx = train_test_split(
        df_dedup.index,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    X_train = X.loc[train_idx].copy()
    X_test = X.loc[test_idx].copy()
    y_train = y.loc[train_idx].copy()
    y_test = y.loc[test_idx].copy()
    df_train = df_dedup.loc[train_idx].copy()
    df_test = df_dedup.loc[test_idx].copy()

    return X_train, X_test, y_train, y_test, df_train, df_test, summary
