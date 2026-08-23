from pathlib import Path

from federated.xray_task import CHEXPERT_TRAIN_CSV, DATA_DIR, NIH_LABELS_CSV


def main() -> None:
    nih_dir = DATA_DIR / "nih"
    chexpert_dir = DATA_DIR / "chexpert"
    nih_dir.mkdir(parents=True, exist_ok=True)
    (chexpert_dir).mkdir(parents=True, exist_ok=True)

    print(f"Dataset root: {DATA_DIR}")
    print()
    print("NIH ChestX-ray14 (https://nihcc.app.box.com/v/ChestXray14):")
    print(f"  put Data_Entry_2017.csv in {nih_dir}/")
    print(f"  extract image batches so PNGs land in {nih_dir}/images/ (or images_001 ... images_012)")
    if NIH_LABELS_CSV.exists():
        print("  labels: FOUND")
    else:
        print("  labels: MISSING")
    images = sum(1 for folder in DATA_DIR.glob("nih/images*") for _ in folder.glob("*.png"))
    print(f"  images: {images} found")
    print()
    print("CheXpert (https://stanfordmlgroup.github.io/projects/chexpert/):")
    print(f"  extract CheXpert-v1.0-small so that {chexpert_dir}/ contains train.csv + the image folders")
    if CHEXPERT_TRAIN_CSV.exists():
        print("  labels: FOUND")
    else:
        print("  labels: MISSING")
    frontal = sum(1 for p in chexpert_dir.rglob("*.jpg") if "frontal" in str(p))
    print(f"  frontal images: {frontal} found")
    print()
    missing = [name for name, path in [("nih", NIH_LABELS_CSV), ("chexpert", CHEXPERT_TRAIN_CSV)] if not path.exists()]
    if missing:
        print(f"Still missing label files for: {', '.join(missing)}. Federated training cannot start until both are present.")
    else:
        print("Both datasets detected. Run: uv run run-federated")


if __name__ == "__main__":
    main()
