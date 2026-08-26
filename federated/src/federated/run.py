from __future__ import annotations

import os

import torch


def _ray_available() -> bool:
    """Ray (the Flower simulation backend) is not installable on native Windows."""
    try:
        import ray  # noqa: F401
    except ImportError:
        return False
    return True


def _run_in_process_fedavg() -> None:
    """In-process FedAvg fallback for platforms without Ray (e.g. Windows).

    Replicates the Flower simulation flow: broadcast the global model to each
    participating client, train locally, aggregate with sample-weighted FedAvg,
    save the global model, and fire the federation callback.
    """
    from federated.aggregation import fedavg_aggregate
    from federated.client_app import _run
    from federated.model import ClinicalModel
    from federated.server_app import _notify_backend
    from federated.task import input_size, load_client_data, participating_clients

    num_clients = participating_clients()
    rounds = int(os.environ.get("FEDERATION_ROUNDS", "3"))
    local_epochs = int(os.environ.get("FEDERATION_LOCAL_EPOCHS", "3"))
    batch_size = int(os.environ.get("FEDERATION_BATCH_SIZE", "32"))
    learning_rate = float(os.environ.get("FEDERATION_LEARNING_RATE", "0.01"))

    print(
        f"[fallback] Ray unavailable on this platform; "
        f"running in-process FedAvg with {num_clients} clients for {rounds} rounds"
    )

    in_features = input_size()
    global_model = ClinicalModel(in_features)

    for round_num in range(1, rounds + 1):
        state_dicts = []
        sample_counts = []
        for client_id in range(num_clients):
            train_loader, _, client_input_size = load_client_data(client_id, batch_size)
            model = ClinicalModel(client_input_size)
            model.load_state_dict(global_model.state_dict())
            optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
            loss = accuracy = 0.0
            for _ in range(local_epochs):
                loss, accuracy = _run(model, train_loader, optimizer)
            state_dicts.append(model.state_dict())
            sample_counts.append(len(train_loader.dataset))
            print(
                f"[fallback] round {round_num} client {client_id}: "
                f"loss={loss:.4f} accuracy={accuracy:.4f}"
            )

        aggregated = fedavg_aggregate(state_dicts, sample_counts)
        global_model.load_state_dict(aggregated)
        print(f"[fallback] round {round_num}: aggregated global model")

    model_path = os.path.join(os.getcwd(), "models", "clinical_model.pt")
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    torch.save({"input_size": in_features, "state_dict": global_model.state_dict()}, model_path)
    print(f"[fallback] saved global model to {model_path}")
    _notify_backend(rounds, __import__("pathlib").Path(model_path))


def run_federated() -> None:
    if _ray_available():
        from flwr.simulation import run_simulation

        from federated.client_app import app as client_app
        from federated.server_app import app as server_app
        from federated.task import participating_clients

        run_simulation(
            server_app=server_app,
            client_app=client_app,
            num_supernodes=participating_clients(),
            backend_config={"client_resources": {"num_cpus": 1}},
            verbose_logging=True,
        )
    else:
        _run_in_process_fedavg()


def main() -> None:
    run_federated()