> **Living reference:** This API plan is intentionally changeable. Add, edit, rename, or remove endpoints as the project evolves and implementation needs become clearer.

# API Reference

This document describes the **intended API surface**. It is not a promise that every endpoint is implemented yet. Keep it synchronized with the code whenever the API changes.

## Design Rules

- Keep Local Node and Global Node APIs separate.
- A Local Node may access patient-level data for its own hospital.
- A Global Node must never expose, request, or store raw patient records.
- Federated communication may transfer only model parameters, protected updates, metrics, and protocol status required by the federation.
- Differential Privacy and Secure Aggregation must be represented accurately; do not describe an update as private unless the corresponding mechanism is enabled and measured.
- Research findings must be labelled as observed patterns or associations, not causal conclusions.
- Patient-level data must not be used in aggregate endpoints without appropriate authorization, aggregation, and minimum-group-size protections.

## Authentication

Authentication is shared by both node types, but authorization depends on the user's role and node context.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Authenticate a user and create a session or access token. |
| `POST` | `/auth/logout` | End the current session or revoke the access token. |
| `GET` | `/auth/me` | Return the current user's identity, role, permissions, and associated hospital when applicable. |

## Local Node API

The Local Node runs inside a participating hospital. It can access that hospital's patients, local model, local database, and federated client. These endpoints must not proxy patient data to the Global Node.

### Patients

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/patients` | List authorized local patients with pagination and filters. |
| `GET` | `/patients/presentation-batch` | Return 10–20 held-out de-identified demo rows for the logged-in hospital. |
| `POST` | `/patients` | Create a local patient record. |
| `POST` | `/patients/ocr` | Extract reviewable patient drafts from one or more uploaded report images/PDFs (OCR via Gemini). Does **not** save. |
| `GET` | `/patients/{id}` | Return one local patient's profile. |
| `PATCH` | `/patients/{id}` | Update a patient and append a before/current/change event snapshot. |
| `GET` | `/patients/{id}/events` | Return that patient's chronological clinical events. |
| `POST` | `/patients/{id}/events` | Append a clinical event without overwriting history. |

#### Report OCR — `POST /patients/ocr`

Turns uploaded report scans into reviewable patient drafts. The clinician reviews/edits each draft in the UI, then saves it with a normal `POST /patients`. This endpoint never writes to the database.

- **Auth:** session cookie + `local` role (same guard as every other `/patients` route). Call it with `credentials: "include"`.
- **Engine:** each file is sent directly to Google Gemini, which reads the document and maps it onto the patient schema. Requires `GEMINI_API_KEY` on the backend, or the endpoint returns `503`.

**Request** — `multipart/form-data`:

| Field | Value |
| --- | --- |
| `reports` | One or more files (repeat the field per file). Up to **10** files, **10 MB** each. |

Accepted types: PNG, JPG, WEBP, BMP, TIFF, PDF.

```js
// Frontend example
const form = new FormData();
for (const file of selectedFiles) form.append("reports", file);

const res = await fetch(`${API_BASE}/patients/ocr`, {
  method: "POST",
  body: form,           // do NOT set Content-Type; the browser adds the boundary
  credentials: "include",
});
const { results } = await res.json();
```

**Response `200`** — one result per uploaded file (order matches upload). Each `draft` matches the `POST /patients` body shape (`age` may be `null` when the report omits it, so a clinician must set it before saving):

```json
{
  "results": [
    {
      "filename": "report1.jpg",
      "draft": {
        "name": "Jane Doe",
        "age": 54,
        "sex": "female",
        "symptoms": ["chest pain", "shortness of breath"],
        "diagnosed_diseases": ["hypertension"],
        "health_conditions": { "blood_pressure": "150/95 mmHg", "diabetic": true }
      },
      "warnings": []
    },
    {
      "filename": "report2.pdf",
      "draft": { "name": "", "age": null, "sex": "male", "symptoms": [], "diagnosed_diseases": [], "health_conditions": {} },
      "warnings": ["Age was not found in the report — set it before saving."]
    },
    {
      "filename": "corrupt.png",
      "draft": null,
      "warnings": [],
      "error": "Unable to extract patient data from this report."
    }
  ]
}
```

A per-file failure produces a `draft: null` entry with an `error` string rather than failing the whole batch. Error responses use the shared envelope `{ "message": string }`:

- `400` — no files, unsupported type, a file over 10 MB, or more than 10 files.
- `503` — `GEMINI_API_KEY` is not configured on the backend.
- `500` — unexpected extraction failure.

### Local Model

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/model` | Return local model version, status, last training time, and sample count. |
| `POST` | `/model/predict` | Run inference locally on submitted clinical information. |
| `GET` | `/model/metrics` | Return local model evaluation metrics. |

### Federation, Privacy, and Research

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/federated/status` | Return local participation and training status. |
| `POST` | `/federated/rounds/{roundId}/start-training` | Ask the local ML service to start a training run. |
| `GET` | `/privacy/status` | Show whether DP and Secure Aggregation are active locally. |
| `GET` | `/privacy/parameters` | Return configured DP metadata such as epsilon, delta, clipping norm, and noise multiplier. |
| `GET` | `/research/summary` | Return approved local clinical trends and outcome statistics. |
| `GET` | `/research/insights` | Return local observed patterns and associations. |

### Local Aggregates and Records

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/heatmap` | Return authorized, aggregated geographic health indicators. |
| `GET` | `/heatmap/regions` | Return aggregate statistics for supported regions. |
| `GET` | `/logs` | Return filtered operational and federated activity logs. |

## Global Node API

The Global Node coordinates hospitals, rounds, aggregation, global model versions, and approved aggregate intelligence. It has **no patient endpoints**. In particular, it must not provide `/global/patients` or `/global/patients/{id}`.

### Participating Nodes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/nodes` | List registered hospitals and basic federation metadata. |
| `GET` | `/nodes/health` | Paginated ping-style health check across every local node at once. |
| `GET` | `/nodes/{id}` | Return a hospital's registration and participation history. |
| `GET` | `/nodes/{id}/status` | Return a hospital's operational and federation status. |
| `GET` | `/nodes/{id}/health` | Ping-style check: is this local node online (recent activity), and when was it last seen. |
| `GET` | `/nodes/{id}/metrics` | Return non-sensitive participation, performance, and communication metrics. |

### Federation and Models

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/federated/status` | Return active round, participating nodes, aggregation status, and global model version. |
| `GET` | `/federated/rounds` | List rounds with status, participants, and global metrics. |
| `GET` | `/federated/rounds/{id}` | Return detailed status and results for one round. |
| `POST` | `/federated/rounds/start` | Start a new federated round. |
| `GET` | `/api/federated/rounds` | List persisted federated round snapshots for the Global UI. |
| `GET` | `/api/federated/rounds/{roundId}` | Return a persisted round snapshot for the Global UI. |
| `GET` | `/models` | List global model versions. |
| `GET` | `/models/latest` | Return the active model's metadata and metrics. |
| `GET` | `/models/{id}` | Return one global model version's metadata. |
| `GET` | `/models/{id}/metrics` | Return metrics for one global model version. |
| `GET` | `/models/{id}/history` | Return the rounds contributing to a model version. |

### Global Privacy, Research, and Operations

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/privacy/status` | Show federation-wide DP and Secure Aggregation status. |
| `GET` | `/privacy/parameters` | Return approved global privacy metadata, not individual hospital updates. |
| `GET` | `/logs` | Return filtered federation activity logs, global-wide (same path as the Local Node's own `GET /logs`; behavior branches on caller role). |
| `GET` | `/logs/{node_id}` | Return non-sensitive events for one hospital node. |
| `GET` | `/logs/round/{roundId}` | Return every log row from one federated round, across all its participating nodes. |
| `GET` | `/research/summary` | Return approved cross-hospital research summaries. |
| `GET` | `/research/insights` | Return aggregate patterns and associations from federated analysis. |
| `GET` | `/heatmap` | Return aggregate regional health indicators. |
| `GET` | `/heatmap/regions` | Return aggregate indicators for supported regions. |

### PDS

This is a secondary API and should be implemented after the federated clinical demo works.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/pds/recommendations` | List regional PDS decision-support recommendations. |
| `GET` | `/pds/recommendations/{region_id}` | Return one recommendation and its supporting indicators. |

PDS endpoints provide explainable decision support only. They must not automatically allocate resources or prescribe an intervention for an individual.

## Backend ↔ Federated Connection

Three components talk to each other:

```
frontend (Next.js :3000)  --REST + session cookies-->  backend (Express :5000)
backend (Express :5000)   --HTTP bridge (planned)-->   federated (Python/Flower :8000)
federated (Flower)        --model params + metrics-->  backend (writes to `logs`, `models`)
```

- **Frontend → Backend** is live today. Cookie-based sessions (`credentials: include`), CORS restricted to origins in `CORS_ORIGINS`.
- **Federated → Backend** is server-to-server, so browser CORS does not apply; the backend authenticates it with a shared secret header instead.
- **Today**, the Python package runs standalone as an in-process Flower *simulation* (`run-federated`). There is no HTTP server in `federated/` yet — the ML bridge endpoints below remain a planned contract, kept here so both sides build against the same shapes.

### Planned bridge endpoints (Python side)

#### `POST /federation/runs`

Purpose: The backend asks the federated service to start a training run for one hospital node. The request carries only non-sensitive run configuration — never patient records.

Input:

```json
{
  "node_id": "uuid-of-local-user",
  "round": 14,
  "config": {
    "num-server-rounds": 3,
    "local-epochs": 10,
    "batch-size": 32,
    "learning-rate": 0.01
  }
}
```

Headers:

```text
Content-Type: application/json
X-Federation-Key: <shared secret from env>
```

The local backend starts this request through
`POST /federated/rounds/{roundId}/start-training`. The ML service returns its
result through `POST /api/federated/rounds/{roundId}/callback` using the same
`X-Federation-Key` header. The callback is service-to-service and does not
require a browser session.

Expected response `202`:

```json
{
  "run_id": "run_9f3c",
  "node_id": "uuid-of-local-user",
  "status": "started"
}
```

Invalid input response `400`:

```json
{
  "message": "node_id, round, and config.num-server-rounds are required."
}
```

Missing/wrong secret response `401`:

```json
{
  "message": "Invalid federation key."
}
```

#### `GET /federation/runs/{run_id}`

Purpose: Poll run progress and collect per-round metrics for this node only.

Expected response `200` while running:

```json
{
  "run_id": "run_9f3c",
  "node_id": "uuid-of-local-user",
  "status": "running",
  "current_round": 2,
  "total_rounds": 3
}
```

Expected response `200` when finished:

```json
{
  "run_id": "run_9f3c",
  "node_id": "uuid-of-local-user",
  "status": "completed",
  "current_round": 3,
  "total_rounds": 3,
  "metrics": [
    {
      "round": 1,
      "direction": "outgoing",
      "metadata": {
        "num_examples": 184,
        "train_loss": 0.5124,
        "train_accuracy": 0.7612
      }
    },
    {
      "round": 1,
      "direction": "incoming",
      "metadata": {
        "num_examples": 184,
        "eval_loss": 0.4761,
        "eval_accuracy": 0.7931
      }
    },
    {
      "round": 2,
      "direction": "outgoing",
      "metadata": {
        "num_examples": 184,
        "train_loss": 0.4557,
        "train_accuracy": 0.8018
      }
    }
  ],
  "global_model_version": "v3",
  "model_artifact": "/models/clinical_model.pt"
}
```

Expected response `404` for unknown runs:

```json
{
  "message": "Unknown run_id."
}
```

The `metrics[].metadata` objects above map 1:1 onto the `logs` table rows the backend already reads via `GET /logs` (`direction`, `round`, `metadata`, `status: "confirmed"`). On completion the backend writes one log row per round entry — nothing else crosses the boundary. Model weights stay inside the federated service; the backend receives only the saved artifact path/version reference.

### What must never cross this boundary

- Patient records, patient IDs, or any patient-level payload.
- Raw per-hospital model updates before DP/secure aggregation (once implemented).
- Anything beyond: run config, run status, aggregated metrics, model version references.

## Current Implementation Status

At the time this document was written:

- Backend scaffold, sessions, Google OAuth, and `local`/`global` role guards exist.
- `/health` and two protected demo routes exist: `/api/federated/status` and `/api/hospital/summary`.
- Auth endpoints implemented: `POST /auth/logout`, `GET /auth/me`, plus `GET /auth/google`, `GET /auth/google/callback`, and a local-only onboarding route.
- All Local patient endpoints implemented and reachable: `GET/POST /patients`, `PATCH/GET /patients/{id}`, `GET/POST /patients/{id}/{events}`, `GET /patients/presentation-batch`, plus `POST /patients/ocr` (Gemini-backed report OCR → reviewable drafts; requires `GEMINI_API_KEY`). A teammate's commit briefly unmounted this in favor of an unauthenticated hardcoded-mock `/api/patients` that nothing (including the frontend) called — see `backend/test.md`'s "Session findings" section — since fixed by restoring the real mount and deleting the mock stub.
- Global Node endpoints implemented: `GET /nodes`, `GET /nodes/{id}`, `GET /nodes/{id}/status`, `GET /nodes/{id}/metrics`, `GET /nodes/{id}/health` and paginated `GET /nodes/health` (ping-style online/offline check, 5-minute activity window). Nodes are derived from onboarded local users; participation data comes from the logs table until real rounds exist.
- CORS is configured on the backend against a comma-separated origin allowlist (`CORS_ORIGINS`, falling back to `FRONTEND_URL`) with credentials enabled.
- **The Python federated → backend bridge is real and verified working end to end**, not just planned: `federated/src/federated/service.py` is a live HTTP server matching `FEDERATED_URL`, triggered automatically by `POST /api/federated/rounds/start` (fans out to every targeted node in one call). It runs real 3-round FedAvg training via Flower on the UCI heart-disease dataset, then POSTs the result back to `POST /api/federated/rounds/{roundId}/callback` with the correct `X-Federation-Key` — confirmed live, DB rows correctly updated to `received`. Caveats: it always trains on a static, pre-partitioned CSV rather than real hospital-submitted `patients` data, and the older single-node trigger (`POST /federated/rounds/{roundId}/start-training`) is now incompatible with this bridge (sends `node_id` singular; the bridge requires `node_ids` plural) — only the automatic global fan-out path works against it today.
- Local aggregates/federation/research endpoints implemented: `GET /logs` (role-aware — a `local` caller sees only its own hospital; a `global` caller sees every node's logs at once via the same path), `GET /logs/{node_id}` and `GET /logs/round/{roundId}` (both global-only), `GET /federated/status`, `GET /privacy/parameters`, `GET /research/summary`, `GET /research/insights`. All read real data (patients/logs tables) rather than mocks; fields stay honestly `null`/empty until a real federated round or enough patients exist.
- `GET /privacy/status` and all Local Model, Global rounds/models, and PDS endpoints are still planned — most blocked on richer training/round data or DP configuration, not on the ML bridge itself anymore.
- The Python federated package trains a heart-disease classifier via Flower simulation (`run-federated`: 3 clients, FedAvg, saves `models/clinical_model.pt`); there is no HTTP server yet, so the Backend ↔ Federated bridge endpoints above are still planned.
- Remaining Global, Local model/privacy/research, and Public Health/PDS endpoints are still planned.
- Local aggregates/federation/research endpoints implemented: `GET /logs`, `GET /federated/status`, `GET /privacy/parameters`, `GET /research/summary`, `GET /research/insights`. All read real data (patients/logs tables) rather than mocks; fields stay honestly `null`/empty until a real federated round or enough patients exist.
- Local Model endpoints implemented: `GET /model` (version, status, last training time, sample count, latest round) and `GET /model/metrics` (latest accuracy/loss plus per-round train/eval history). Both derive everything from this node's `logs` rows — no models table exists yet — so values stay `null` until real federated rounds report metrics.
- `GET /federated/round`, `POST /federated/participate`, `GET /privacy/status`, Global rounds/models, and Public Health/PDS endpoints are still planned — most blocked on the Python federated package producing real training/round data.
- The Python federated package has real Flower app modules now (`model.py`, `task.py`, `server_app.py`, `client_app.py`, `prepare_data.py`, `run.py`) — training/aggregation code exists, but nothing in it writes to the `logs`/`patients` tables yet, so the backend endpoints above can't see real round activity until that integration exists.
