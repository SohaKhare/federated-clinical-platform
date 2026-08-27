from __future__ import annotations

import json
import os
import random
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pandas as pd
import torch

from federated.aggregation import fedavg_aggregate
from federated.disease_model import (
    DiseaseModel,
    disease_trends,
    future_pool,
    get_model,
)
from federated.model import ClinicalModel
from federated.run import run_federated
from federated.task import (
    CATEGORICAL,
    FEATURE_COLUMNS,
    NUMERIC,
    _features,
    _read_training_rows,
)


# Metadata the current heart-disease checkpoint doesn't carry yet. A future
# multi-disease synthetic checkpoint is expected to ship its own `conditions`
# and `feature_schema` (see _predict); until then we synthesise this
# single-condition manifest so the enriched prediction contract works today.
HEART_CONDITION = {"key": "heart_disease", "label": "Heart disease"}

# Checkpoint written by `federated.run` before any federated round has pushed a
# node-specific model. Serving falls back to it so the card works on a fresh
# install; once a round completes, `models/<node_id>.pt` takes precedence.
BASELINE_MODEL = "clinical_model.pt"
HEART_FEATURE_LABELS = {
    "age": "Age",
    "sex": "Sex",
    "cp": "Chest pain type",
    "trestbps": "Resting blood pressure",
    "chol": "Cholesterol",
    "fbs": "Fasting blood sugar",
    "restecg": "Resting ECG",
    "thalach": "Max heart rate",
    "exang": "Exercise-induced angina",
    "oldpeak": "ST depression (oldpeak)",
    "slope": "ST slope",
    "ca": "Major vessels (ca)",
    "thal": "Thalassemia (thal)",
}
# Clinical fallbacks used when a patient record doesn't carry a given input.
HEART_DEFAULTS = {
    "trestbps": 120,
    "chol": 200,
    "fbs": 0,
    "restecg": "0",
    "thalach": 150,
    "exang": 0,
    "oldpeak": 0,
    "slope": "1",
    "ca": "0",
    "thal": "3",
}


def _resolve_snapshot(body: dict[str, object]) -> tuple[dict[str, object], dict | None]:
    """Pick the clinical snapshot to score and summarise the history window.

    The history-aware body sends `{patient: {age, sex}, history: [snapshot…]}`
    ordered oldest→newest; we score the most recent snapshot and report how
    many entries (and what date span) informed it. The legacy flat body has no
    history, so it becomes a single-entry window.
    """
    history = body.get("history") if isinstance(body.get("history"), list) else None
    patient = body.get("patient") if isinstance(body.get("patient"), dict) else {}

    if history:
        latest = history[-1] if isinstance(history[-1], dict) else {}
        snapshot = {
            "age": patient.get("age", latest.get("age", body.get("age", 0))),
            "sex": patient.get("sex", latest.get("sex", body.get("sex", "M"))),
            "symptoms": latest.get("symptoms", []),
            "health_conditions": latest.get("health_conditions", {}),
        }
        stamps = sorted(
            str(entry.get("occurred_at"))
            for entry in history
            if isinstance(entry, dict) and entry.get("occurred_at")
        )
        window = {
            "entries": len(history),
            "from": stamps[0] if stamps else None,
            "to": stamps[-1] if stamps else None,
        }
        return snapshot, window

    snapshot = {
        "age": body.get("age", 0),
        "sex": body.get("sex", "M"),
        "symptoms": body.get("symptoms", []),
        "health_conditions": body.get("health_conditions", {}),
    }
    return snapshot, None


def _heart_feature_row(snapshot: dict[str, object]) -> tuple[dict[str, object], list[str]]:
    """Cleveland heart-disease feature row from a clinical snapshot.

    Returns the row plus the list of inputs that fell back to a clinical
    default because the patient record didn't carry them — surfaced to the
    clinician as the card's data-completeness note.
    """
    sex = str(snapshot.get("sex", "M")).lower()
    sex_value = "1" if sex in ("m", "male", "1") else "0"
    symptoms = [str(symptom).lower() for symptom in snapshot.get("symptoms") or []]
    conditions = snapshot.get("health_conditions")
    conditions = conditions if isinstance(conditions, dict) else {}

    defaulted = [key for key in HEART_DEFAULTS if key not in conditions]
    if not symptoms:
        defaulted.append("cp")

    row = {
        "age": float(snapshot.get("age") or 0),
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
    return row, defaulted


def _base_feature_of(column: str) -> str:
    """Map an encoded column back to its original clinical feature.

    _features() keeps numeric columns as-is and one-hot-encodes categoricals
    as `{feature}_{value}`, so contributions of every dummy fold back onto the
    single feature a clinician recognises.
    """
    if column in NUMERIC:
        return column
    for categorical in CATEGORICAL:
        if column == categorical or column.startswith(f"{categorical}_"):
            return categorical
    return column


def _display_value(feature: str, row: dict[str, object]) -> str:
    value = row.get(feature)
    if feature == "sex":
        return "Male" if str(value) == "1" else "Female"
    return str(value)


def _gradient_x_input(
    model: ClinicalModel,
    inputs: torch.Tensor,
    columns: list[str],
    row: dict[str, object],
    top_k: int = 4,
) -> list[dict[str, object]]:
    """Signed per-feature attribution for the positive-class score.

    gradient×input on the encoded vector, folded back onto the original
    features, ranked by magnitude — faithful to the served model and cheap
    (one backward pass), no SHAP dependency.
    """
    grad_inputs = inputs.clone().detach().requires_grad_(True)
    model.zero_grad()
    score = model(grad_inputs)[0, 1]
    score.backward()

    contributions = (grad_inputs[0] * grad_inputs.grad[0]).detach().tolist()

    per_feature: dict[str, float] = {}
    for column, contribution in zip(columns, contributions):
        base = _base_feature_of(column)
        per_feature[base] = per_feature.get(base, 0.0) + float(contribution)

    ranked = sorted(per_feature.items(), key=lambda item: abs(item[1]), reverse=True)

    features: list[dict[str, object]] = []
    for feature, contribution in ranked[:top_k]:
        if contribution == 0:
            continue
        features.append({
            "feature": feature,
            "label": HEART_FEATURE_LABELS.get(feature, feature),
            "value": _display_value(feature, row),
            "contribution": round(contribution, 4),
            "direction": "increases" if contribution > 0 else "lowers",
        })
    return features


class Handler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        if self.headers.get("X-Federation-Key") == os.environ.get(
            "FEDERATION_SHARED_SECRET", "development-federation-key"
        ):
            return True
        self.send_error(401, "Invalid federation key")
        return False

    def do_GET(self) -> None:
        if not self._authorized():
            return
        if self.path.startswith("/federation/disease/metrics"):
            self._disease_metrics()
            return
        if self.path.startswith("/federation/disease/trends"):
            granularity = "year" if "granularity=year" in self.path else "month"
            self._json(disease_trends(granularity))
            return
        if self.path.startswith("/federation/disease/future-batch"):
            self._future_batch()
            return
        self.send_error(404)

    def do_POST(self) -> None:
        if not self._authorized():
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        body = json.loads(raw_body or b"{}")

        if self.path == "/federation/disease/predict":
            self._disease_predict(body)
            return
        if self.path == "/federation/disease/train":
            metrics = DiseaseModel().fit()
            self._json({"status": "trained", **metrics})
            return
        if self.path == "/federation/apply-model":
            self._apply_model(raw_body, self.headers.get("X-Node-Id"))
            return
        if self.path == "/federation/predict":
            self._predict(body)
            return
        if self.path == "/federation/aggregate":
            self._aggregate(body)
            return
        if self.path != "/federation/runs":
            self.send_error(404)
            return

        required = ["round_id", "round", "node_ids", "callback_url"]
        if any(key not in body for key in required):
            self.send_error(400, "round_id, round, node_ids, and callback_url are required")
            return

        os.environ["FEDERATION_ROUND_ID"] = str(body["round_id"])
        os.environ["FEDERATION_CALLBACK_URL"] = str(body["callback_url"])
        node_ids = [str(node) for node in body["node_ids"]]
        os.environ["FEDERATION_NODE_IDS"] = ",".join(node_ids)
        config = body.get("config", {})
        os.environ["FEDERATION_ROUNDS"] = str(config.get("num-server-rounds", 3))

        # Real hospital patients per node, reshaped onto Flower's
        # partition-id (position in node_ids) and JSON-encoded — this has to
        # be an env var, not a plain object, because assign_client/
        # load_client_data in task.py run inside Ray's ClientAppActor, a
        # separate OS process that only inherits the environment, not this
        # process's Python state. See task.py's comment above
        # participating_clients() for the full explanation.
        patients_by_node = {
            entry["node_id"]: entry.get("patients", [])
            for entry in body.get("patients_by_node") or []
            if isinstance(entry, dict) and entry.get("node_id")
        }
        os.environ["FEDERATION_PATIENTS_BY_PARTITION"] = json.dumps({
            index: patients_by_node[node_id]
            for index, node_id in enumerate(node_ids)
            if patients_by_node.get(node_id)
        })

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

    def _apply_model(self, raw_body: bytes, node_id: str | None) -> None:
        if not raw_body:
            self.send_error(400, "Request body must contain the .pt bytes")
            return

        if not node_id:
            self.send_error(400, "X-Node-Id header is required")
            return

        model_path = Path.cwd() / "models" / f"{node_id}.pt"
        model_path.parent.mkdir(exist_ok=True)
        model_path.write_bytes(raw_body)
        self._json({"status": "ok"})

    # ------------------------------------------------------------------ #
    # prediction helpers                                                   #
    # ------------------------------------------------------------------ #

    def _predict(self, body: dict[str, object]) -> None:
        """Per-patient risk for the clinician's card.

        Accepts either the legacy flat body ({age, sex, symptoms,
        health_conditions}) or the history-aware body ({patient, history[]}).
        Returns the enriched multi-condition contract — per-condition
        probability, gradient×input top features, and data completeness —
        plus the top-level {prediction, probability} the older /doctor
        workspace consumer still reads.
        """
        node_id = body.get("nodeId")
        if not node_id:
            self.send_error(400, "nodeId is required")
            return

        models_dir = Path.cwd() / "models"
        model_path = models_dir / f"{node_id}.pt"
        federated = model_path.exists()
        if not federated:
            model_path = models_dir / BASELINE_MODEL
            if not model_path.exists():
                self.send_error(404, f"No trained model for node {node_id}")
                return

        snapshot, history_window = _resolve_snapshot(body)
        row, defaulted = _heart_feature_row(snapshot)

        checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
        model = ClinicalModel(checkpoint["input_size"])
        model.load_state_dict(checkpoint["state_dict"])
        model.eval()

        _, columns, means, stds = _features(_read_training_rows())
        features, _, _, _ = _features(
            pd.DataFrame([row], columns=FEATURE_COLUMNS), columns, means, stds
        )
        inputs = torch.tensor(features.to_numpy(), dtype=torch.float32)

        with torch.no_grad():
            probability = torch.softmax(model(inputs), dim=1)[0, 1].item()

        top_features = _gradient_x_input(model, inputs, columns, row)

        # The live model is single-condition (heart disease). A future
        # multi-disease checkpoint declaring `conditions`/`feature_schema`
        # would produce one prediction per declared condition here; the
        # backend and card already render whatever list arrives.
        prediction = {
            "condition": HEART_CONDITION["key"],
            "label": HEART_CONDITION["label"],
            "probability": round(probability, 4),
            "top_features": top_features,
            "data_completeness": {
                "provided": len(FEATURE_COLUMNS) - len(defaulted),
                "total": len(FEATURE_COLUMNS),
                "defaulted": defaulted,
            },
        }

        self._json({
            "model_version": checkpoint.get("model_version")
            or ("local" if federated else "baseline"),
            "model_source": "federated" if federated else "baseline",
            "regions_trained": checkpoint.get("regions_trained") if federated else None,
            "history_window": history_window,
            "predictions": [prediction],
            # Backward-compat for the thin POST /local/patients/predict consumer.
            "prediction": probability >= 0.5,
            "probability": round(probability, 4),
        })

    def _disease_predict(self, body: dict[str, object]) -> None:
        """XGBoost diagnosis prediction from the new medical dataset features."""
        try:
            model = get_model()
            model.ensure_loaded()
            row = pd.DataFrame(
                [
                    {
                        "age": float(body.get("age", 0)),
                        "gender": str(body.get("gender", "Male")),
                        "previous_diagnosis": str(body.get("previous_diagnosis", "None")),
                        "medical_conditions": str(body.get("medical_conditions", "None")),
                        "current_symptoms": str(body.get("current_symptoms", "")),
                        "hospital": str(body.get("hospital", "")),
                        "location": str(body.get("location", "")),
                        "diagnosis_date": str(body.get("diagnosis_date", "")),
                    }
                ]
            )
            result = model.predict_rows(row)[0]
            self._json(result)
        except FileNotFoundError as error:
            self.send_error(503, str(error))
        except Exception as error:  # noqa: BLE001 - surface as 500 with message
            print(f"Disease predict failed: {error}")
            self.send_error(500, "Prediction failed")

    def _disease_metrics(self) -> None:
        metrics_path = Path.cwd() / "models" / "disease_xgb_metrics.json"
        if not metrics_path.exists():
            self.send_error(404, "Model not trained yet — POST /federation/disease/train first")
            return
        self._json(json.loads(metrics_path.read_text()))

    def _future_batch(self) -> None:
        """Random 10-20 unseen rows from the 3001-5000 pool, with predictions."""
        count = random.randint(10, 20)
        pool = future_pool()
        sample = pool.sample(n=min(count, len(pool)), random_state=None)
        predictions = get_model().predict_rows(sample)
        patients = []
        for (_, row), prediction in zip(sample.iterrows(), predictions):
            patients.append(
                {
                    "source_row": int(row["_row_number"]),
                    "patient_id": row["patient_id"],
                    "previous_diagnosis": row["previous_diagnosis"],
                    "medical_conditions": row["medical_conditions"],
                    "current_symptoms": [
                        s.strip() for s in str(row["current_symptoms"]).split(",") if s.strip()
                    ],
                    "age": int(row["age"]),
                    "gender": row["gender"],
                    "hospital": row["hospital"],
                    "location": row["location"],
                    "diagnosis_date": row["diagnosis_date"],
                    "actual_diagnosis": row["diagnosis"],
                    "prediction": prediction,
                }
            )
        self._json({"patients": patients})

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