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
| `GET` | `/patients/{id}` | Return one local patient's profile. |
| `PATCH` | `/patients/{id}` | Update a patient and append a before/current/change event snapshot. |
| `GET` | `/patients/{id}/events` | Return that patient's chronological clinical events. |
| `POST` | `/patients/{id}/events` | Append a clinical event without overwriting history. |

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
| `GET` | `/federated/round` | Return the current round, global model version, and local state. |
| `POST` | `/federated/participate` | Confirm participation and begin the local training workflow when instructed. |
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
| `GET` | `/nodes/{id}` | Return a hospital's registration and participation history. |
| `GET` | `/nodes/{id}/status` | Return a hospital's operational and federation status. |
| `GET` | `/nodes/{id}/metrics` | Return non-sensitive participation, performance, and communication metrics. |

### Federation and Models

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/federated/status` | Return active round, participating nodes, aggregation status, and global model version. |
| `GET` | `/federated/rounds` | List rounds with status, participants, and global metrics. |
| `GET` | `/federated/rounds/{id}` | Return detailed status and results for one round. |
| `POST` | `/federated/rounds/start` | Start a new federated round. |
| `POST` | `/federated/pull` | Request protocol/status synchronization; never pull patient data. |
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
| `GET` | `/logs` | Return filtered federation activity logs. |
| `GET` | `/logs/{node_id}` | Return non-sensitive events for one hospital node. |
| `GET` | `/research/summary` | Return approved cross-hospital research summaries. |
| `GET` | `/research/insights` | Return aggregate patterns and associations from federated analysis. |
| `GET` | `/heatmap` | Return aggregate regional health indicators. |
| `GET` | `/heatmap/regions` | Return aggregate indicators for supported regions. |

### Public Health and PDS

These are secondary APIs and should be implemented after the federated clinical demo works.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/public-health/summary` | Return regional indicators, trends, and priority areas. |
| `GET` | `/public-health/regions` | Return approved public-health information by region. |
| `GET` | `/public-health/signals` | Return aggregate clinical, nutrition, community, and service signals. |
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
- **Today**, the Python package runs standalone as an in-process Flower *simulation* (`run-federated`). There is no HTTP server in `federated/` yet — the endpoints below are the **planned bridge contract**, kept here so both sides build against the same shapes.

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
- All Local patient endpoints implemented: `GET/POST /patients`, `PATCH/GET /patients/{id}`, `GET/POST /patients/{id}/{events}`.
- Global Node endpoints implemented: `GET /nodes`, `GET /nodes/{id}`, `GET /nodes/{id}/status`, `GET /nodes/{id}/metrics`. Nodes are derived from onboarded local users; participation data comes from the logs table until real rounds exist.
- CORS is configured on the backend against a comma-separated origin allowlist (`CORS_ORIGINS`, falling back to `FRONTEND_URL`) with credentials enabled.
- The Python federated package trains a heart-disease classifier via Flower simulation (`run-federated`: 3 clients, FedAvg, saves `models/clinical_model.pt`); there is no HTTP server yet, so the Backend ↔ Federated bridge endpoints above are still planned.
- Remaining Global, Local model/privacy/research, and Public Health/PDS endpoints are still planned.
- Local aggregates/federation/research endpoints implemented: `GET /logs`, `GET /federated/status`, `GET /privacy/parameters`, `GET /research/summary`, `GET /research/insights`. All read real data (patients/logs tables) rather than mocks; fields stay honestly `null`/empty until a real federated round or enough patients exist.
- `GET /federated/round`, `POST /federated/participate`, `GET /privacy/status`, and all Local Model, Global rounds/models, and Public Health/PDS endpoints are still planned — most blocked on the Python federated package producing real training/round data.
- The Python federated package has real Flower app modules now (`model.py`, `task.py`, `server_app.py`, `client_app.py`, `prepare_data.py`, `run.py`) — training/aggregation code exists, but nothing in it writes to the `logs`/`patients` tables yet, so the backend endpoints above can't see real round activity until that integration exists.
