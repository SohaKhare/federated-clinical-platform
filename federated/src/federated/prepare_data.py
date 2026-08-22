import pandas as pd

from federated.task import DATA_PATH, POOL_PATH


def main() -> None:
    frame = pd.read_csv(DATA_PATH)
    frame["_source_row"] = frame.index
    pool = frame.sample(frac=0.30, random_state=42)
    pool.to_csv(POOL_PATH, index=False)
    print(f"training rows: {len(frame) - len(pool)}")
    print(f"presentation pool rows: {len(pool)}")


if __name__ == "__main__":
    main()
