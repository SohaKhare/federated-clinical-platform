import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

import torch
from flwr.app import ArrayRecord, ConfigRecord, Context
from flwr.serverapp import Grid, ServerApp
from flwr.serverapp.strategy import FedAvg

from federated.model import ClinicalModel
from federated.task import input_size


app = ServerApp()


@app.main()
def main(grid: Grid, context: Context) -> None:
    model = ClinicalModel(input_size())
    strategy = FedAvg(
        fraction_train=1.0,
        fraction_evaluate=1.0,
        min_train_nodes=3,
        min_evaluate_nodes=3,
        min_available_nodes=3,
    )
    rounds = int(context.run_config.get("num-server-rounds", 3))
    learning_rate = float(context.run_config.get("learning-rate", 0.01))
    print(f"Starting FedAvg with 3 clients for {rounds} rounds")
    result = strategy.start(
        grid=grid,
        initial_arrays=ArrayRecord(model.state_dict()),
        train_config=ConfigRecord({"lr": learning_rate}),
        num_rounds=rounds,
    )
    model_path = Path.cwd() / "models" / "clinical_model.pt"
    model_path.parent.mkdir(exist_ok=True)
    torch.save(
        {"input_size": input_size(), "state_dict": result.arrays.to_torch_state_dict()},
        model_path,
    )
    print(f"Saved global model to {model_path}")
    _notify_backend(rounds)


def _notify_backend(rounds: int) -> None:
    callback_url = os.environ.get("FEDERATION_CALLBACK_URL")
    round_id = os.environ.get("FEDERATION_ROUND_ID")
    node_ids = [node_id for node_id in os.environ.get("FEDERATION_NODE_IDS", "").split(",") if node_id]

    if not callback_url or not round_id or not node_ids:
        return

    payload = json.dumps({
        "round": rounds,
        "update": {
            "aggregated": True,
            "model_file": "models/clinical_model.pt",
            "input_size": input_size(),
        },
        "metrics": {"flower_rounds": rounds, "global_model_saved": True},
    }).encode("utf-8")

    for node_id in node_ids:
        request = Request(
            callback_url,
            data=json.dumps({
                "nodeId": node_id,
                "update": {"aggregated": True, "model_file": "clinical_model.pt"},
                "metrics": {"flower_rounds": rounds, "global_model_saved": True},
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Federation-Key": os.environ.get("FEDERATION_SHARED_SECRET", "development-federation-key")},
            method="POST",
        )
        try:
            with urlopen(request, timeout=10):
                pass
        except Exception as error:
            print(f"Callback failed for node {node_id}: {error}")
