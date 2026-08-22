import torch
from flwr.app import ArrayRecord, Context, Message, MetricRecord, RecordDict
from flwr.clientapp import ClientApp

from federated.model import ClinicalModel
from federated.task import load_client_data


app = ClientApp()


def _run(model: ClinicalModel, loader, optimizer=None) -> tuple[float, float]:
    training = optimizer is not None
    model.train(training)
    total_loss = total_correct = total_examples = 0
    loss_fn = torch.nn.CrossEntropyLoss()
    with torch.enable_grad() if training else torch.no_grad():
        for features, labels in loader:
            predictions = model(features)
            loss = loss_fn(predictions, labels)
            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            total_loss += loss.item() * len(labels)
            total_correct += (predictions.argmax(1) == labels).sum().item()
            total_examples += len(labels)
    return total_loss / total_examples, total_correct / total_examples


@app.train()
def train(msg: Message, context: Context) -> Message:
    client_id = int(context.node_config["partition-id"])
    batch_size = int(context.run_config.get("batch-size", 64))
    local_epochs = int(context.run_config.get("local-epochs", 10))
    train_loader, _, input_size = load_client_data(client_id, batch_size)
    model = ClinicalModel(input_size)
    model.load_state_dict(msg.content["arrays"].to_torch_state_dict())
    optimizer = torch.optim.Adam(model.parameters(), lr=float(msg.content["config"]["lr"]))
    loss = accuracy = 0.0
    for _ in range(local_epochs):
        loss, accuracy = _run(model, train_loader, optimizer)
    metrics = MetricRecord({"train_loss": loss, "train_accuracy": accuracy, "num-examples": len(train_loader.dataset)})
    return Message(
        content=RecordDict({"arrays": ArrayRecord(model.state_dict()), "metrics": metrics}),
        reply_to=msg,
    )


@app.evaluate()
def evaluate(msg: Message, context: Context) -> Message:
    client_id = int(context.node_config["partition-id"])
    _, validation_loader, input_size = load_client_data(client_id, int(context.run_config.get("batch-size", 64)))
    model = ClinicalModel(input_size)
    model.load_state_dict(msg.content["arrays"].to_torch_state_dict())
    loss, accuracy = _run(model, validation_loader)
    metrics = MetricRecord({"eval_loss": loss, "eval_accuracy": accuracy, "num-examples": len(validation_loader.dataset)})
    return Message(content=RecordDict({"metrics": metrics}), reply_to=msg)
