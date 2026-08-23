from pathlib import Path

import torch
from flwr.app import ArrayRecord, ConfigRecord, Context
from flwr.serverapp import Grid, ServerApp
from flwr.serverapp.strategy import FedAvg

from federated.model import SHARED_LABELS, ChestXrayCNN


app = ServerApp()


@app.main()
def main(grid: Grid, context: Context) -> None:
    model = ChestXrayCNN(num_labels=len(SHARED_LABELS))
    strategy = FedAvg(
        fraction_train=1.0,
        fraction_evaluate=1.0,
        min_train_nodes=2,
        min_evaluate_nodes=2,
        min_available_nodes=2,
    )
    rounds = int(context.run_config.get("num-server-rounds", 3))
    learning_rate = float(context.run_config.get("learning-rate", 0.001))
    print(f"Starting FedAvg with 2 institutions (NIH, CheXpert) for {rounds} rounds")
    result = strategy.start(
        grid=grid,
        initial_arrays=ArrayRecord(model.state_dict()),
        train_config=ConfigRecord({"lr": learning_rate}),
        num_rounds=rounds,
    )
    model_path = Path.cwd() / "models" / "chest_xray_global.pt"
    model_path.parent.mkdir(exist_ok=True)
    torch.save(
        {
            "labels": SHARED_LABELS,
            "state_dict": result.arrays.to_torch_state_dict(),
        },
        model_path,
    )
    print(f"Saved global model to {model_path}")
