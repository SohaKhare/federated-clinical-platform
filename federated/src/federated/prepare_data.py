import pandas as pd

from federated.task import DATA_PATH, FEATURE_COLUMNS, POOL_PATH, assign_client


def main() -> None:
    frame = pd.read_csv(DATA_PATH, header=None, names=FEATURE_COLUMNS + ["target"]).replace("?", pd.NA)
    frame = frame.dropna().reset_index(names="_source_row")
    pool = frame.sample(frac=0.50, random_state=42).copy()
    pool["hospital_id"] = pool["_source_row"].map(assign_client)
    pool.to_csv(POOL_PATH, index=False)
    print(f"training rows: {len(frame) - len(pool)}")
    print(f"presentation pool rows: {len(pool)}")
    print("presentation rows per hospital:")
    print(pool["hospital_id"].value_counts().sort_index().to_string())


if __name__ == "__main__":
    main()
