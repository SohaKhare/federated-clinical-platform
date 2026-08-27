# Federated Clinical Platform

> **A privacy-preserving federated learning platform for clinical data.** Hospitals ("Local Nodes") keep patient records on-premise and train a shared model locally; a coordinating "Global Node" only ever sees model parameters and aggregate metrics — never raw patient records.

This document is the single entry point for understanding the whole project: what it does, how the pieces fit together, what's actually implemented vs. still planned, and how to run it locally. It supersedes the top-level summary in [`README.md`](README.md) and points into the more detailed reference docs where useful.

---

## 1. What this is

Hospitals each hold valuable but siloed clinical knowledge. Centralizing patient records to learn across institutions is usually a non-starter — privacy, data ownership, security, and regulatory constraints all push against it. This project flips the question from *"can hospitals share their patient data?"* to *"can hospitals share what their models learn without sharing the data itself?"*

Each hospital trains a shared PyTorch model on its own local data. Only the model's weight updates — not patient records — cross the network. A coordinating server combines those updates ([FedAvg](https://arxiv.org/abs/1602.05629)) into an improved global model, which is sent back to every hospital for the next round.

**Core scope (built and working today):** federated training across simulated hospital nodes, differential-privacy-protected training, a Node/Express API split into Local-Node and Global-Node roles, a Supabase/Postgres data layer, and a Next.js dashboard for both hospital staff and researchers.

**Aspirational/secondary scope (designed, not built):** a public-health/PDS (Public Distribution System) decision-support layer, ASHA field-worker voice input, and cryptographic Secure Aggregation. These are documented in depth in [`AGENT.md`](AGENT.md) as the long-term vision, but no code implements them yet — see [§10 Status](#10-current-status--roadmap).

---

## 2. Architecture at a glance

```
                    ┌─────────────────────────┐
                    │   frontend (Next.js)     │
                    │   :3000                  │
                    │   hospital + global UIs  │
                    └────────────┬─────────────┘
                                 │ REST + session cookies (CORS-restricted)
                 ┌───────────────┴───────────────┐
                 ▼                                ▼
   ┌─────────────────────────┐      ┌──────────────────────────┐
   │  Local Node backend      │      │  Global Node backend      │
   │  (Express/TS)            │      │  (Express/TS)             │
   │  patients, events, OCR,  │      │  node registry, rounds,   │
   │  local model/privacy     │      │  models, federation-wide  │
   │                          │      │  logs, PDS (planned)      │
   └────────────┬─────────────┘      └─────────────┬─────────────┘
                │  writes/reads                     │  writes/reads
                ▼                                    ▼
   ┌──────────────────────────────────────────────────────────┐
   │           Supabase / PostgreSQL (shared schema)            │
   │  users · patients · patient_events · logs                  │
   └──────────────────────────────────────────────────────────┘
                 ▲
                 │ HTTP bridge (X-Federation-Key), model params + metrics only
   ┌─────────────┴─────────────────────────────────────────────┐
   │        federated (Python: Flower + PyTorch + Opacus)        │
   │  simulated hospital clients → local DP-SGD training          │
   │  → FedAvg / DP-FedAvg aggregation → global model artifact     │
   └───────────────────────────────────────────────────────────┘
```

Key invariant enforced throughout the API and schema design: **only model parameters, metrics, and protocol status cross the Local↔Global boundary — never patient records.** See [§7](#7-privacy--security-design).

---

## 3. Repository layout

| Path | Stack | Role | Status |
| --- | --- | --- | --- |
| [`backend/`](backend/) | Node 20+, Express 5, TypeScript, Supabase | The original **combined** backend — mounts every route (local + global + federation bridge) in one process. | Working, most-complete implementation |
| [`backend-local/`](backend-local/) | same stack | A **split-out Local Node** service: only patient/events/OCR/local-model/privacy/research/federated-trigger routes. No node registry, no global rounds/models. | Newer split, not yet reflected in `README.md` |
| [`backend-global/`](backend-global/) | same stack | A **split-out Global Node** service: only auth/demo/node-registry/global-federated/log routes. No patient endpoints (by design — see §7). | Newer split, not yet reflected in `README.md` |
| [`frontend/`](frontend/) | Next.js 16, React 19, TypeScript, Tailwind 4, Redux Toolkit, Recharts | Dashboards for hospital staff (local) and researchers (global). | Working against `backend/` (mock data in places — see `frontend/lib/api.ts`) |
| [`federated/`](federated/) | Python ≥3.13, `uv`, Flower, PyTorch, Opacus | Federated training: FedAvg and DP-FedAvg across simulated hospital clients, for **four** datasets (heart disease, diabetes, COVID mortality, chest X-ray). | Working; HTTP bridge to backend verified live |

`backend-local/` and `backend-global/` were introduced after `backend/` and mirror the Local Node / Global Node conceptual split described throughout `AGENT.md` and `API.md`, but as **separately deployable services** rather than one process with role-guarded routes. All three share an identical `package.json` dependency set, so at the moment `backend/` is a strict superset of the other two combined. Until the split fully replaces the combined service, treat `backend/` as the canonical one to run.

Top-level reference docs (kept as living documents, not superseded by this file): [`API.md`](API.md), [`SCHEMA.md`](SCHEMA.md), [`ML_ARCHITECTURE.md`](ML_ARCHITECTURE.md), [`AGENT.md`](AGENT.md), [`TODO.md`](TODO.md), [`COVID_THRESHOLD_ANALYSIS.md`](COVID_THRESHOLD_ANALYSIS.md) — see [§11](#11-key-documents-index).

---

## 4. Services in depth

### 4.1 Backend — Node.js / Express / Supabase

Dependencies (identical across `backend/`, `backend-local/`, `backend-global/`): `express` 5, `@supabase/supabase-js`, `@google/genai` (Gemini, for OCR), `googleapis` + `jsonwebtoken` (Google OAuth session auth), `multer` (multipart file upload), TypeScript run via `tsx`.

Responsibilities:
- **Auth** — Google OAuth login/callback, cookie-based sessions, `local`/`global` role guard (`backend/src/auth/roles.ts`). A brand-new user is always `local`; promotion to `global` is a manual DB row edit — there is no self-service path.
- **Patients & clinical events** — full CRUD, hospital-isolated (`patients.hospital_id`, enforced on every read/write so one hospital can never see another's records).
- **Report OCR** — `POST /patients/ocr` sends uploaded scans (PNG/JPG/WEBP/BMP/TIFF/PDF, up to 10 files × 10MB) to Gemini, which returns reviewable draft patient records. Nothing is written to the DB until a clinician confirms via the normal `POST /patients`.
- **Federation bridge** — triggers Python training runs (`POST /federated/rounds/{roundId}/start-training` and the fan-out `POST /api/federated/rounds/start`), receives the signed callback, and persists round metrics into `logs`.
- **Node registry (Global only)** — `GET /nodes`, per-node health/status/metrics, derived from onboarded local users plus their `logs` activity (no separate "presence" table).
- **Privacy/research reporting** — surfaces DP parameters (ε/δ) and research summaries computed from `logs`, never raw patient data.

`backend/src/controllers/` splits cleanly into `local-node/` and `global-node/` subfolders even within the combined service, which is presumably the seam the `backend-local`/`backend-global` split was cut along.

### 4.2 Frontend — Next.js

Dependencies: `next` 16, `react`/`react-dom` 19, `@reduxjs/toolkit` + `react-redux`, `tailwindcss` 4, `recharts` + `react-simple-maps` (charts and the geographic heatmap), `lucide-react` (icons).

Pages (`frontend/app/`): `(dashboard)` — the local hospital dashboard, `global/` — the researcher/global dashboard, `login/`, `onboarding/`.

Notable components (`frontend/app/components/`): `PatientManagement`, `PatientFormModal`, `FederatedCard`, `ModelCard`, `PrivacyCard`, `ResearchCard`, `NodeManagement`, `HeatmapWidget`, `LogsWidget`, `AuditCard`, `PlatformSummary`, `SummaryChart`, `PresentationBatchButton` (the demo/presentation-mode data picker), `AuthGuard`, `Sidebar`, `Header`.

`frontend/lib/api.ts` still serves mock data for some endpoints per `README.md` — wire it up incrementally as backend endpoints go live.

### 4.3 Federated package — Python / Flower / PyTorch / Opacus

`federated/pyproject.toml` deps: `flwr[simulation]` 1.34+, `torch` 2.7+ (CPU wheel via a dedicated `uv` index), `pandas` 2.2+, `pillow` 11+ (for the X-ray pipeline).

The package has grown well past the original heart-disease MVP described in `AGENT.md`/`TODO.md`. Verified structure (`federated/src/federated/`):

| Submodule | Contents |
| --- | --- |
| `preprocessing/` | `covid.py`, `diabetes.py` (+ the original heart-disease prep in `prepare_data.py`) |
| `partitioning/` | `hospital_partition.py`, `covid_hospital_partition.py` — splits a dataset into non-IID per-hospital shards |
| `model/` | `baseline.py`, `covid_baseline.py`, `pytorch_baseline.py`, `local_trainer.py` |
| `aggregation/` | `fedavg.py`, `dp_fedavg.py`, `covid_fedavg.py`, `covid_dp_fedavg.py` |
| `privacy/` | `opacus_trainer.py`, `covid_opacus_trainer.py` — **Opacus DP-SGD is implemented**, not just planned (see [§10](#10-current-status--roadmap) for why this contradicts `TODO.md`) |
| (root) | `server_app.py` / `client_app.py` (heart-disease Flower app), `xray_server_app.py` / `xray_client_app.py` / `xray_task.py` (a **separate chest-X-ray/imaging federated pipeline**), `service.py` (the live HTTP bridge server), `run.py` / `covid_run.py` / `xray_run.py` (entry points) |

`pyproject.toml` exposes these as installable scripts: `prepare-data`, `prepare-xray-data`, `run-federated`, `federated-service`, `run-xray-federated`. Default hyperparameters live under `[tool.flwr.app.config]`: `num-server-rounds = 1`, `local-epochs = 3`, `batch-size = 32`, `learning-rate = 0.01` (overridable per-run — the COVID analysis in `COVID_THRESHOLD_ANALYSIS.md` used 10 rounds/10 epochs).

`federated/tests/test_covid_pipeline.py` is the one automated test file found in the repo.

---

## 5. Data model

Four tables, all in Supabase/Postgres (full detail: [`SCHEMA.md`](SCHEMA.md)):

- **`users`** — one row per hospital (for the hackathon: one Google-auth'd user = one hospital). Carries `role` (`local`/`global`), `hospital_name`, `pincode`, `geolocation`.
- **`patients`** — identity/admin fields only (`name`, `age`, `sex`, `hospital_id`, `contributed_to_round`). No clinical data lives here.
- **`patient_events`** — append-only clinical history; the *only* place `symptoms`, `diagnosed_diseases`, `health_conditions` are stored. A patient's current clinical state is just the latest `patient_created`/`patient_updated` event. Other event types (e.g. `treatment`) are free-form notes.
- **`logs`** — one row per federated round per direction (`outgoing` hospital→global, `incoming` global→hospital). Doubles as the "was this round sent" tracker and the DP privacy-budget ledger (`metadata.metrics.epsilon`/`delta`).

Deliberately **no separate weights/checkpoint table** — round history and per-node status are both fully derivable from `logs`, avoiding a second source of truth that could drift (e.g. a stale `sent: true` flag contradicting a `status: "failed"` log row).

---

## 6. API surface

Full endpoint-by-endpoint reference with request/response samples: [`API.md`](API.md). Summary by role:

**Local Node** (a hospital's own instance) — patients CRUD + events, `POST /patients/ocr`, local model status/predict/metrics, `/federated/status`, `/privacy/status|parameters`, `/research/summary|insights`, aggregate `/heatmap`, `/logs`.

**Global Node** (the coordinator) — `/nodes` registry + health/status/metrics per node, `/federated/status|rounds|rounds/{id}`, `POST /federated/rounds/start`, `/models` + versions/metrics/history, federation-wide `/logs`, `/pds/recommendations` (planned, secondary). **No patient endpoints exist or should ever exist on the Global Node** — enforced as a design rule, not just an omission.

**Federation bridge** (backend ↔ Python service, server-to-server, authenticated via `X-Federation-Key`) — `POST /federation/runs` to start a run, `GET /federation/runs/{run_id}` to poll it. Only run config, status, and aggregate metrics cross this boundary; raw model updates before DP/SecAgg protection never do.

---

## 7. Privacy & security design

- **Data locality** — patient records never leave the hospital that created them; enforced at the schema level (`patients.hospital_id`) and the API level (every patient route scopes to the authenticated hospital's own rows).
- **Differential Privacy** — implemented via Opacus (`federated/src/federated/privacy/opacus_trainer.py`, `covid_opacus_trainer.py`): per-sample gradient clipping + calibrated noise during local training. Privacy spend (ε, cumulative; δ) is reported per node per round into `logs.metadata.metrics`, not just claimed qualitatively. `COVID_THRESHOLD_ANALYSIS.md` documents a real DP-FedAvg run: mean ε ≈ 42.90, δ = 10⁻⁵, on a `[35→32→16→1]` MLP mortality classifier — with the accompanying honest discussion of how aggressive gradient clipping under class imbalance compresses output probabilities and requires threshold recalibration (not the default 0.5).
- **Secure Aggregation** — designed (see `AGENT.md` §16-17) so the aggregator never sees an individual hospital's raw update, only the combined result. **Not yet implemented** — currently a planned/TODO item, not a working mechanism.
- **Auth** — Google OAuth, cookie sessions, `local`/`global` role guards; server-to-server federation calls use a separate shared-secret header (`X-Federation-Key`), not user sessions.
- **Boundary rule** — repeated throughout `API.md`: model parameters, protected updates, metrics, and protocol status may cross the Local↔Global boundary; patient records, patient IDs, or raw pre-DP/pre-SecAgg updates never may.

---

## 8. Getting started

Prerequisites: Node.js ≥ 20 (or Bun), Python ≥ 3.13 with [`uv`](https://docs.astral.sh/uv/), a Google Cloud OAuth web-app client, and a Postgres database (Supabase works).

### Backend (port 5000, or `PORT` in `.env`)

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Fill in `.env`: `PORT`, `SESSION_SECRET`, `LOCAL_GOOGLE_CLIENT_ID` / `LOCAL_GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, `FEDERATED_URL`, `FEDERATION_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`). The Google OAuth redirect URI must be `<BACKEND_URL>/auth/google/callback`.

Verify: `curl http://localhost:5000/health`

(`backend-local/` and `backend-global/` follow the identical setup if you want to run the split services instead — each has its own `.env.example` with the same variable set.)

### Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Note some data is still mocked in `frontend/lib/api.ts` pending backend wiring.

### Federated package

```bash
cd federated
uv sync
uv run prepare-data        # or prepare-xray-data, for the imaging pipeline
uv run run-federated        # Flower simulation: FedAvg over simulated hospital clients
```

Other entry points: `uv run federated-service` (starts the live HTTP bridge server consumed by the backend), `uv run run-xray-federated`. The trained artifact lands at `federated/models/clinical_model.pt`. Hyperparameters: `[tool.flwr.app.config]` in `federated/pyproject.toml`.

### End-to-end smoke test

1. Start backend + frontend.
2. Log in via Google (`GET /auth/google`).
3. Complete onboarding (`POST /auth/onboarding`) — registers you as a Local Node under `GET /nodes`.
4. Create/read patients (`POST /patients`, `GET /patients`).
5. `uv run run-federated` to produce a round; confirm it lands in `GET /logs`.

Endpoint-by-endpoint request/response samples: [`API.md`](API.md) and `backend/testing_io.md`.

---

## 9. How the pieces connect (today vs. planned)

- **Frontend → Backend**: live. Cookie sessions, CORS restricted to `CORS_ORIGINS`, credentials enabled.
- **Backend → Federated**: live and verified end-to-end (per `API.md`'s implementation-status notes) — `federated/src/federated/service.py` is a real HTTP server, triggered by `POST /api/federated/rounds/start`, that runs real FedAvg training on the UCI heart-disease dataset and POSTs results back to the backend's callback route with the correct shared-secret header. Caveat: it still trains on a static pre-partitioned CSV rather than live hospital-submitted `patients` rows.
- **Federated → Backend (logs)**: live for the heart-disease path described above.

---

## 10. Current status / roadmap

Cross-checked against the code directly (not just `TODO.md`, which is stale in places):

| Area | `TODO.md` says | Verified in code |
| --- | --- | --- |
| Differential Privacy (Phase 4) | Not started (`[ ]`) | **Implemented** — `opacus_trainer.py` + `covid_opacus_trainer.py`, with a full real-world calibration writeup in `COVID_THRESHOLD_ANALYSIS.md` |
| Secure Aggregation (Phase 5) | Not started (`[ ]`) | Still not started — no SecAgg code found |
| Federated dataset scope | Heart-disease only (per `AGENT.md`'s scope-lock note) | **Expanded** — heart disease, diabetes, COVID mortality, and chest X-ray/imaging pipelines all exist |
| Backend service topology | Single `backend/` (per `README.md`) | **Split in progress** — `backend-local/` and `backend-global/` now exist alongside the original combined `backend/` |
| Docker Compose | Planned (`[ ]`) | Not present — no `Dockerfile` or `docker-compose.yml` in the repo |
| Public-health / PDS / ASHA voice layer | Secondary, "only after core demo works" | Not started — design-only in `AGENT.md` |

Remaining known gaps (still accurate per `TODO.md` and `API.md`'s own status section): `GET /privacy/status`, most Local Model endpoints beyond `/model` and `/model/metrics`, Global rounds/models detail endpoints, and all PDS endpoints. The Python↔patients-table integration (training on live submitted data instead of the static CSV) is also still open.

---

## 11. Key documents index

| Doc | Covers |
| --- | --- |
| [`README.md`](README.md) | Original quick-start (superseded in detail by §8 above, but still a fine short-form entry point) |
| [`AGENT.md`](AGENT.md) | Full product vision, architecture rationale, MVP phases, and the secondary public-health/PDS/voice roadmap |
| [`API.md`](API.md) | Complete endpoint reference with request/response samples and its own implementation-status log |
| [`SCHEMA.md`](SCHEMA.md) | Table-by-table data model with example rows and derived-query patterns |
| [`ML_ARCHITECTURE.md`](ML_ARCHITECTURE.md) | Flower/PyTorch/Opacus execution flow, one training round step-by-step |
| [`TODO.md`](TODO.md) | Phase-by-phase build log (see §10 above for where it's out of date) |
| [`COVID_THRESHOLD_ANALYSIS.md`](COVID_THRESHOLD_ANALYSIS.md) | A concrete DP-FedAvg experiment: threshold calibration for an imbalanced mortality classifier |
| `backend/test.md`, `backend/testing_io.md` | Manual endpoint testing notes |
