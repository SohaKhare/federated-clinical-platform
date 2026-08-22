"""Aggregation package for Federated Clinical Platform."""


def fedavg_aggregate(*args, **kwargs):
    from federated.aggregation.fedavg import fedavg_aggregate as _agg
    return _agg(*args, **kwargs)


def count_parameters(*args, **kwargs):
    from federated.aggregation.fedavg import count_parameters as _count
    return _count(*args, **kwargs)


def run_federated_round_1(*args, **kwargs):
    from federated.aggregation.fedavg import run_federated_round_1 as _run
    return _run(*args, **kwargs)


def run_dp_federated_round_1(*args, **kwargs):
    from federated.aggregation.dp_fedavg import run_dp_federated_round_1 as _run
    return _run(*args, **kwargs)



__all__ = [
    "fedavg_aggregate",
    "count_parameters",
    "run_federated_round_1",
    "run_dp_federated_round_1",
]


