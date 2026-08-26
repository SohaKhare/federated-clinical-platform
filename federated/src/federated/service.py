from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pandas as pd
import torch

from federated.aggregation import fedavg_aggregate
from federated.model import ClinicalModel
from federated.run import run_federated
from federated.task import FEATURE_COLUMNS, _features, _read_training_rows


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path not in (
            "/federation/runs",
            "/federation/predict",
            "/federation/aggregate",
            "/federation/apply-model",
        ):
            self.send_error(404)
            return

        if self.headers.get("X-Federation-Key") != os.environ.get(
            "FEDERATION_SHARED_SECRET", "development-federation-key"
        ):
            self.send_error(401, "Invalid federation key")
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)

        if self.path == "/federation/apply-model":
            self._apply_model(raw_body)
            return

        body = json.loads(raw_body or b"{}")
        if self.path == "/federation/predict":
            self._predict(body)
            return

        if self.path == "/federation/aggregate":
            self._aggregate(body)
            return

        required = ["round_id", "round", "node_ids", "callback_url"]
        if any(key not in body for key in required):
            self.send_error(400, "round_id, round, node_ids, and callback_url are required")
            return

        os.environ["FEDERATION_ROUND_ID"] = str(body["round_id"])
        os.environ["FEDERATION_CALLBACK_URL"] = str(body["callback_url"])
        os.environ["FEDERATION_NODE_IDS"] = ",".join(str(node) for node in body["node_ids"])
        config = body.get("config", {})
        os.environ["FEDERATION_ROUNDS"] = str(config.get("num-server-rounds", 3))

        threading.Thread(target=run_federated, daemon=True).start()
        self.send_response(202)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "started", "round_id": body["round_id"]}).encode())

    def _aggregate(self, body: dict[str, object]) -> None:
        model_paths = body.get("model_paths") or []
        sample_counts = body.get("sample_counts") or []

        if not model_paths or len(model_paths) != len(sample_counts):
            self.send_error(400, "model_paths and sample_counts are required and must match in length")
            return

        state_dicts = []
        input_size = None
        for path in model_paths:
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
            state_dicts.append(checkpoint["state_dict"])
            input_size = input_size or checkpoint.get("input_size")

        aggregated_state_dict = fedavg_aggregate(state_dicts, sample_counts)

        output_path = Path.cwd() / "models" / "aggregated_model.pt"
        output_path.parent.mkdir(exist_ok=True)
        torch.save({"input_size": input_size, "state_dict": aggregated_state_dict}, output_path)
        self._json({"output_path": str(output_path.resolve())})

    def _apply_model(self, raw_body: bytes) -> None:
        if not raw_body:
            self.send_error(400, "Request body must contain the .pt bytes")
            return

        model_path = Path.cwd() / "models" / "clinical_model.pt"
        model_path.parent.mkdir(exist_ok=True)
        model_path.write_bytes(raw_body)
        self._json({"status": "ok"})

    def _predict(self, body: dict[str, object]) -> None:
        train = _read_training_rows()
        _, columns, means, stds = _features(train)
        sex = str(body.get("sex", "M")).lower()
        sex_value = "1" if sex in ("m", "male", "1") else "0"
        symptoms = [str(symptom).lower() for symptom in body.get("symptoms", [])]
        conditions = body.get("health_conditions") if isinstance(body.get("health_conditions"), dict) else {}
        row = {
            "age": float(body.get("age", 0)),
            "sex": sex_value,
            "cp": "4" if any("chest" in symptom for symptom in symptoms) else "1",
            "trestbps": float(conditions.get("trestbps", 120)),
            "chol": float(conditions.get("chol", 200)),
            "fbs": "1" if conditions.get("fbs") in (1, "1", True) else "0",
            "restecg": str(conditions.get("restecg", "0")),
            "thalach": float(conditions.get("thalach", 150)),
            "exang": "1" if conditions.get("exang") in (1, "1", True) else "0",
            "oldpeak": float(conditions.get("oldpeak", 0)),
            "slope": str(conditions.get("slope", "1")),
            "ca": str(conditions.get("ca", "0")),
            "thal": str(conditions.get("thal", "3")),
        }
        features, _, _, _ = _features(pd.DataFrame([row], columns=FEATURE_COLUMNS), columns, means, stds)
        checkpoint = torch.load(Path.cwd() / "models" / "clinical_model.pt", map_location="cpu", weights_only=True)
        model = ClinicalModel(checkpoint["input_size"])
        model.load_state_dict(checkpoint["state_dict"])
        model.eval()
        with torch.no_grad():
            probability = torch.softmax(model(torch.tensor(features.to_numpy(), dtype=torch.float32)), dim=1)[0, 1].item()
        self._json({"prediction": probability >= 0.5, "probability": round(probability, 4)})

    def _json(self, payload: dict[str, object]) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


def main() -> None:
    port = int(os.environ.get("PORT", "8001"))
    print(f"Federated service listening on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
