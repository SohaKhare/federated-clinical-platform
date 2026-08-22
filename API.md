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
| `POST` | `/patients` | Create a local patient record. |
| `GET` | `/patients/{id}` | Return one local patient's profile. |
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
| `GET` | `/federated/history` | Return this hospital's previous round participation and metrics. |
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
| `GET` | `/audit` | Return the append-only security/compliance audit trail. |

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

## Current Implementation Status

At the time this document was written:

- Backend scaffold, sessions, Google OAuth, and `local`/`global` role guards exist.
- `/health` and two protected demo routes exist: `/api/federated/status` and `/api/hospital/summary`.
- The endpoint catalog above is mostly planned and still needs implementation.
- The Python federated package and database layer are not implemented yet.
