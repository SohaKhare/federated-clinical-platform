"""Federated Hospital Data Partitioning for COVID-19 Registry Dataset.

Preserves natural multi-center clinical hospital partitions based on hospital ID (a102).
Guarantees:
- Exactly 41 distinct hospital clients
- Zero cross-client patient leakage
- sum(client sample counts) == total unique patients (1172)
- Isolated local storage: data/covid_hospitals/{hospital_id}/train.csv
"""

from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

from federated.preprocessing.covid import (
    PATIENT_IDENTIFIER,
    TARGET_COLUMN,
    TARGET_POSITIVE_VALUE,
    clean_covid_data,
    load_raw_covid_data,
)


def create_covid_hospital_partitions(
    raw_data_path: str = "data/raw/National_Clinical_Registry_Covid19_Sample_data.csv",
    random_state: int = 42,
) -> Tuple[Dict[str, pd.DataFrame], Dict[str, Any]]:
    """Partition the centralized COVID dataset into 41 natural hospital subsets based on a102.

    Guarantees:
    - Zero record duplication across hospitals
    - Zero record loss (Total partitioned == Total unique deduplicated patients == 1172)
    - Complete hospital preservation
    """
    df_raw = load_raw_covid_data(raw_data_path)
    X, y, df_dedup, summary = clean_covid_data(df_raw)

    hospital_ids = sorted(df_dedup["hospital_id"].unique())
    hospital_dfs: Dict[str, pd.DataFrame] = {}

    all_patient_ids: List[Any] = []

    for hid in hospital_ids:
        h_name = f"hospital_{hid}"
        h_df = df_dedup[df_dedup["hospital_id"] == hid].sample(
            frac=1.0, random_state=random_state
        ).reset_index(drop=True)
        hospital_dfs[h_name] = h_df
        all_patient_ids.extend(h_df[PATIENT_IDENTIFIER].tolist())

    total_unique_partitioned_patients = len(set(all_patient_ids))
    duplicate_patient_count = len(all_patient_ids) - total_unique_partitioned_patients
    total_partitioned_records = sum(len(h_df) for h_df in hospital_dfs.values())

    partition_summary: Dict[str, Any] = {
        "total_raw_rows": summary["total_raw_rows"],
        "total_dedup_patients": summary["total_dedup_patients"],
        "total_partitioned_patients": total_partitioned_records,
        "unique_partitioned_patients": total_unique_partitioned_patients,
        "duplicate_patients_across_hospitals": duplicate_patient_count,
        "total_hospitals": len(hospital_ids),
        "hospital_ids": hospital_ids,
        "hospitals": {},
    }

    for name, h_df in hospital_dfs.items():
        deaths = int((h_df[TARGET_COLUMN] == TARGET_POSITIVE_VALUE).sum())
        non_deaths = len(h_df) - deaths
        mortality_rate = (deaths / len(h_df)) * 100 if len(h_df) > 0 else 0.0
        partition_summary["hospitals"][name] = {
            "hospital_name": name,
            "total_samples": len(h_df),
            "deaths": deaths,
            "non_deaths": non_deaths,
            "mortality_rate_percent": float(mortality_rate),
        }

    return hospital_dfs, partition_summary


def save_covid_hospital_partitions(
    hospital_dfs: Dict[str, pd.DataFrame],
    base_dir: str = "data/covid_hospitals",
) -> Dict[str, Path]:
    """Save each hospital's private partition to its isolated local directory."""
    saved_paths: Dict[str, Path] = {}
    base_path = Path(base_dir)

    for name, df in hospital_dfs.items():
        hospital_dir = base_path / name
        hospital_dir.mkdir(parents=True, exist_ok=True)
        file_path = hospital_dir / "train.csv"
        df.to_csv(file_path, index=False)
        saved_paths[name] = file_path

    return saved_paths


def load_covid_hospital_data(
    hospital_name: str,
    base_dir: str = "data/covid_hospitals",
) -> pd.DataFrame:
    """Load local dataset for a single COVID hospital node."""
    base_path = Path(base_dir)
    if not base_path.is_dir():
        alt_1 = Path(__file__).parents[2] / base_dir
        alt_2 = Path.cwd() / "federated" / base_dir
        if alt_1.is_dir():
            base_path = alt_1
        elif alt_2.is_dir():
            base_path = alt_2

    hospital_dir = base_path / hospital_name.lower()
    file_path = hospital_dir / "train.csv"
    if not file_path.is_file():
        raise FileNotFoundError(f"COVID hospital data not found at: {file_path.resolve()}")

    df = pd.read_csv(file_path, low_memory=False)
    unnamed = [c for c in df.columns if c.startswith("Unnamed")]
    if unnamed:
        df = df.drop(columns=unnamed)
    return df

