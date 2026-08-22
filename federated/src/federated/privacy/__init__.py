"""Privacy and Differential Privacy package for Federated Clinical Platform."""


def train_opacus_dp_hospital(*args, **kwargs):
    from federated.privacy.opacus_trainer import train_opacus_dp_hospital as _train
    return _train(*args, **kwargs)


def validate_model_for_opacus(*args, **kwargs):
    from federated.privacy.opacus_trainer import validate_model_for_opacus as _val
    return _val(*args, **kwargs)


def run_apollo_dp_experiment(*args, **kwargs):
    from federated.privacy.opacus_trainer import run_apollo_dp_experiment as _run
    return _run(*args, **kwargs)


def run_all_hospitals_dp_experiment(*args, **kwargs):
    from federated.privacy.opacus_trainer import run_all_hospitals_dp_experiment as _run
    return _run(*args, **kwargs)



__all__ = [
    "train_opacus_dp_hospital",
    "validate_model_for_opacus",
    "run_apollo_dp_experiment",
    "run_all_hospitals_dp_experiment",
]

