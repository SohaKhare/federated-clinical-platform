"""Model definitions and baseline training for the Federated Clinical Platform."""


def build_baseline_model(*args, **kwargs):
    from federated.model.baseline import build_baseline_model as _build
    return _build(*args, **kwargs)


def train_and_evaluate_baseline(*args, **kwargs):
    from federated.model.baseline import train_and_evaluate_baseline as _train
    return _train(*args, **kwargs)


__all__ = [
    "build_baseline_model",
    "train_and_evaluate_baseline",
]

