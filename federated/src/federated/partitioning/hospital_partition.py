"""Deterministic Non-IID Data Partitioning for Simulated Hospital Nodes.

Milestone 3 in the FEDNET Development Sequence:
CENTRAL DATASET -> NON-IID HOSPITAL PARTITIONS -> THREE INDEPENDENT LOCAL MODELS -> LOCAL METRICS

Simulates three distinct hospital environments:
1. Apollo (Higher T1 diabetes prevalence: ~75.7%)
2. KEM    (Moderate T1 diabetes prevalence: ~62.2%)
3. Fortis (Balanced / lower T1 diabetes prevalence: ~48.6%)

Each hospital receives its own private dataset stored in:
data/hospitals/{hospital_id}/train.csv
"""

from pathlib import Path
from typing import Any, Dict, Tuple

import pandas as pd

from federated.preprocessing.diabetes import TARGET_COLUMN, load_raw_data

HOSPITAL_NAMES = ["apollo", "kem", "fortis"]


def create_hospital_partitions(
    raw_data_path: str = "data/raw/diabetes.csv",
    random_state: int = 42,
) -> Tuple[Dict[str, pd.DataFrame], Dict[str, Any]]:
    """Partition the centralized dataset into three reproducible, non-IID hospital subsets.

    Guarantees:
    - Zero record duplication across hospitals
    - Zero record loss (Total partitioned == Total raw records)
    - Realistic non-IID class skew across nodes while ensuring sufficient samples of both classes.
    """
    df = load_raw_data(raw_data_path)

    # Filter into Type 1 (target=1) and Other (target=0) cohorts
    t1_cohort = (
        df[df[TARGET_COLUMN] == 1]
        .sample(frac=1.0, random_state=random_state)
        .reset_index(drop=True)
    )
    other_cohort = (
        df[df[TARGET_COLUMN] != 1]
        .sample(frac=1.0, random_state=random_state)
        .reset_index(drop=True)
    )

    total_t1 = len(t1_cohort)
    total_other = len(other_cohort)
    total_records = len(df)

    # Deterministic non-IID cohort distribution
    # Apollo: 28 T1, 9 Other  -> 37 total (75.68% T1)
    # KEM:    23 T1, 14 Other -> 37 total (62.16% T1)
    # Fortis: 18 T1, 19 Other -> 37 total (48.65% T1)
    # Total:  69 T1, 42 Other -> 111 total (62.16% T1)

    apollo_df = pd.concat(
        [t1_cohort.iloc[:28], other_cohort.iloc[:9]],
        ignore_index=True,
    ).sample(frac=1.0, random_state=random_state).reset_index(drop=True)

    kem_df = pd.concat(
        [t1_cohort.iloc[28:51], other_cohort.iloc[9:23]],
        ignore_index=True,
    ).sample(frac=1.0, random_state=random_state).reset_index(drop=True)

    fortis_df = pd.concat(
        [t1_cohort.iloc[51:], other_cohort.iloc[23:]],
        ignore_index=True,
    ).sample(frac=1.0, random_state=random_state).reset_index(drop=True)

    hospital_dfs = {
        "apollo": apollo_df,
        "kem": kem_df,
        "fortis": fortis_df,
    }

    # Verification: check uniqueness across partitions
    all_identifiers = []
    if "Sno" in df.columns:
        for name, h_df in hospital_dfs.items():
            all_identifiers.extend(h_df["Sno"].tolist())
        duplicate_count = len(all_identifiers) - len(set(all_identifiers))
    else:
        duplicate_count = 0

    total_partitioned = sum(len(h_df) for h_df in hospital_dfs.values())
    records_lost = total_records - total_partitioned
    global_t1_pct = (total_t1 / total_records) * 100

    partition_summary: Dict[str, Any] = {
        "total_records_raw": total_records,
        "total_partitioned": total_partitioned,
        "duplicate_records": duplicate_count,
        "records_lost": records_lost,
        "global_type1_count": total_t1,
        "global_other_count": total_other,
        "global_type1_percentage": global_t1_pct,
        "hospitals": {},
    }

    for name, h_df in hospital_dfs.items():
        t1_count = int((h_df[TARGET_COLUMN] == 1).sum())
        other_count = int((h_df[TARGET_COLUMN] != 1).sum())
        t1_pct = (t1_count / len(h_df)) * 100
        partition_summary["hospitals"][name] = {
            "name": name.upper(),
            "total_samples": len(h_df),
            "type_1_count": t1_count,
            "other_count": other_count,
            "type_1_percentage": t1_pct,
        }

    return hospital_dfs, partition_summary


def save_hospital_partitions(
    hospital_dfs: Dict[str, pd.DataFrame],
    base_dir: str = "data/hospitals",
) -> Dict[str, Path]:
    """Save each hospital's partition to its isolated local directory."""
    saved_paths = {}
    base_path = Path(base_dir)

    for name, df in hospital_dfs.items():
        hospital_dir = base_path / name
        hospital_dir.mkdir(parents=True, exist_ok=True)
        file_path = hospital_dir / "train.csv"
        df.to_csv(file_path, index=False)
        saved_paths[name] = file_path

    return saved_paths


def load_hospital_data(
    hospital_name: str,
    base_dir: str = "data/hospitals",
) -> pd.DataFrame:
    """Load local dataset for a single hospital node."""
    hospital_dir = Path(base_dir) / hospital_name.lower()
    file_path = hospital_dir / "train.csv"
    if not file_path.is_file():
        raise FileNotFoundError(f"Hospital data not found at: {file_path.resolve()}")

    df = pd.read_csv(file_path)
    unnamed = [c for c in df.columns if c.startswith("Unnamed")]
    if unnamed:
        df = df.drop(columns=unnamed)
    return df
