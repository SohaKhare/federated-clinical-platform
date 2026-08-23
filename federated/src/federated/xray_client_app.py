import torch
from flwr.app import ArrayRecord, Context, Message, MetricRecord, RecordDict
from flwr.clientapp import ClientApp

from federated.model import ChestXrayCNN
from federated.xray_task import auroc_score, load_client_data


app = ClientApp()


def _run(model: ChestXrayCNN, loader, optimizer=None) -> tuple[float, float]:
    training = optimizer is not None
    model.train(training)
    total_loss = total_auroc = total_examples = 0.0
    with torch.enable_grad() if training else torch.no_grad():
        for images, targets in loader:
            logits = model(images)
            loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, targets)
            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            batch = len(targets)
            total_loss += loss.item() * batch
            total_auroc += auroc_score(torch.sigmoid(logits), targets) * batch
            total_examples += batch
    return total_loss / total_examples, total_auroc / total_examples


@app.train()
def train(msg: Message, context: Context) -> Message:
    client_id = int(context.node_config["partition-id"])
    batch_size = int(context.run_config.get("batch-size", 32))
    train_loader, _, num_labels = load_client_data(client_id, batch_size)
    model = ChestXrayCNN(num_labels=num_labels)
    model.load_state_dict(msg.content["arrays"].to_torch_state_dict())
    optimizer = torch.optim.Adam(model.parameters(), lr=float(msg.content["config"]["lr"]))
    loss, auroc = _run(model, train_loader, optimizer)
    metrics = MetricRecord({"train_loss": loss, "train_auroc": auroc, "num-examples": len(train_loader.dataset)})
    return Message(
        content=RecordDict({"arrays": ArrayRecord(model.state_dict()), "metrics": metrics}),
        reply_to=msg,
    )


@app.evaluate()
def evaluate(msg: Message, context: Context) -> Message:
    client_id = int(context.node_config["partition-id"])
    _, validation_loader, num_labels = load_client_data(client_id, int(context.run_config.get("batch-size", 32)))
    model = ChestXrayCNN(num_labels=num_labels)
    model.load_state_dict(msg.content["arrays"].to_torch_state_dict())
    loss, auroc = _run(model, validation_loader)
    metrics = MetricRecord({"eval_loss": loss, "eval_auroc": auroc, "num-examples": len(validation_loader.dataset)})
    return Message(content=RecordDict({"metrics": metrics}), reply_to=msg)
