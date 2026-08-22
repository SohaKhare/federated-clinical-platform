from flwr.simulation import run_simulation

from federated.client_app import app as client_app
from federated.server_app import app as server_app


def main() -> None:
    run_simulation(
        server_app=server_app,
        client_app=client_app,
        num_supernodes=3,
        backend_config={"client_resources": {"num_cpus": 1}},
        verbose_logging=True,
    )
