from flwr.simulation import run_simulation

from federated.xray_client_app import app as xray_client_app
from federated.xray_server_app import app as xray_server_app


def main() -> None:
    run_simulation(
        server_app=xray_server_app,
        client_app=xray_client_app,
        num_supernodes=2,
        backend_config={"client_resources": {"num_cpus": 1}},
        verbose_logging=True,
    )
