from pathlib import Path

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
