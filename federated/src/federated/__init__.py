import flwr


FLOWER_VERSION = flwr.__version__


def main() -> None:
    print(f"Flower imported successfully (version {FLOWER_VERSION})")
