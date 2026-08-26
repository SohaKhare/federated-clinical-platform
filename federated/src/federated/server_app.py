import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

import torch
from flwr.app import ArrayRecord, ConfigRecord, Context
from flwr.serverapp import Grid, ServerApp
from flwr.serverapp.strategy import FedAvg

from federated.model import ClinicalModel
from federated.task import input_size, participating_clients


app = ServerApp()


@app.main()
def main(grid: Grid, context: Context) -> None:
    model = ClinicalModel(input_size())
    nodes = participating_clients()
    strategy = FedAvg(
        fraction_train=1.0,
        fraction_evaluate=1.0,
        min_train_nodes=nodes,
        min_evaluate_nodes=nodes,
        min_available_nodes=nodes,
    )
    rounds = int(context.run_config.get("num-server-rounds", 3))
    learning_rate = float(context.run_config.get("learning-rate", 0.01))
    print(f"Starting FedAvg with {nodes} clients for {rounds} rounds")
    result = strategy.start(
        grid=grid,
        initial_arrays=ArrayRecord(model.state_dict()),
        train_config=ConfigRecord({"lr": learning_rate}),
        num_rounds=rounds,
    )
    node_ids = [node_id for node_id in os.environ.get("FEDERATION_NODE_IDS", "").split(",") if node_id]
    checkpoint = {"input_size": input_size(), "state_dict": result.arrays.to_torch_state_dict()}
    models_dir = Path.cwd() / "models"
    models_dir.mkdir(exist_ok=True)

    # FedAvg produces one aggregated result for the whole round, but each
    # hospital gets it saved under its own filename — so predict/apply-model
    # for hospital A never touches hospital B's file, even though today's
    # batched-round content happens to be identical across all of them.
    model_paths = {}
    for node_id in node_ids:
        model_path = models_dir / f"{node_id}.pt"
        torch.save(checkpoint, model_path)
        model_paths[node_id] = model_path
        print(f"Saved model for node {node_id} to {model_path}")

    _notify_backend(rounds, model_paths)


def _notify_backend(rounds: int, model_paths: dict[str, Path]) -> None:
    callback_url = os.environ.get("FEDERATION_CALLBACK_URL")
    round_id = os.environ.get("FEDERATION_ROUND_ID")

    if not callback_url or not round_id or not model_paths:
        return

    for node_id, model_path in model_paths.items():
        request = Request(
            callback_url,
            data=json.dumps({
                "nodeId": node_id,
                "update": {"aggregated": True, "model_file": str(model_path.resolve())},
                "metrics": {"flower_rounds": rounds, "global_model_saved": True},
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Federation-Key": os.environ.get("FEDERATION_SHARED_SECRET", "development-federation-key")},
            method="POST",
        )
        try:
            with urlopen(request, timeout=30):
                pass
        except Exception as error:
            print(f"Callback failed for node {node_id}: {error}")
