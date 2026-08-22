# Project TODO

> Status legend: [x] done · [~] in progress · [ ] not started
>
> **Direction:** `AGENT.md` is the current source of truth (tabular treatment/outcome model).
> The older pitch doc (chest X-ray / CheXpert) is superseded — see note at bottom.

---

## Foundation

- [x] Project vision & MVP plan (`AGENT.md`)
- [x] ML architecture & execution flow (`ML_ARCHITECTURE.md`)
- [x] Data schemas: `patients` + `logs`, ε/δ privacy-budget tracking (`SCHEMA.md`)
- [x] Backend scaffold (Express + TS)
- [x] Google OAuth + session auth (`backend/src/controllers/auth.controller.ts`)
- [x] Node roles: `local` / `global` + role-guarded routes (`backend/src/auth/roles.ts`)
- [x] Per-hospital patient data isolation (`patients.hospital_id`) — one hospital can never read/write another's patient records or events

## Phase 0 — Scope lock

- [x] Confirm research question & target variable: heart-disease presence from age, sex, symptoms, and clinical measurements
- [x] Pick public/de-identified tabular dataset(s) for simulated hospitals: UCI Cleveland Heart Disease

## Phase 1 — Clinical Learning Model (core ML)

- [x] Dataset download + preprocessing script (pandas)
- [x] Feature engineering & train/eval splits per hospital partition
- [x] `ClinicalModel(nn.Module)` in PyTorch
- [x] Local train/eval loop with metrics (loss/accuracy)

## Phase 2 — Federated Learning

- [x] Flower server (`federated/src/federated/server_app.py`)
- [x] Hospital client (`ClientApp`) — 3 simulated nodes
- [x] Data partitioning across clients (hospital-based)

## Phase 3 — FedAvg Aggregation

- [x] FedAvg strategy wiring on server (`federated/src/federated/server_app.py`)
- [ ] Round tracking + global loss/metrics logging across rounds
- [ ] Persist round history (maps to `logs` schema)

## Phase 4 — Differential Privacy

- [ ] Opacus `PrivacyEngine` integration in client training loop (`federated/src/federated/privacy/`)
- [ ] Gradient clipping + noise multiplier config
- [ ] Report ε (cumulative), δ per node/round → into log metadata
- [ ] Compare DP vs non-DP baseline performance

## Phase 5 — Secure Aggregation

- [ ] Enable/prototype SecAgg so server never sees individual hospital updates

## Platform Layer

- [x] Database implementing `patients`/`logs` schema (Postgres, live on Supabase — `users`, `patients`, `patient_events`, `logs`)
- [x] Express backend: local-node endpoints returning real data — patients CRUD/events (hospital-isolated), `GET /logs`, `GET /federated/status`, `GET /privacy/parameters`, `GET /research/summary`, `GET /research/insights`. `/api/hospital/summary` is still a static demo stub, not real data.
- [ ] Docker Compose: flower-server, hospital-a/b/c, backend, db, frontend
- [ ] Frontend: replace starter template with hospital dashboard + federated server dashboard
- [x] Add a local-only presentation control using 10–20 held-out real patient rows for the selected day
- [ ] Clearly label generated records as demo/synthetic data and keep them separate from real clinical data
- [ ] Add a Global Node control to start/approve an aggregation round and broadcast the resulting global model to local nodes
- [ ] Show each local node receiving the new global model version and using it for the next prediction
- [ ] Display model-version and weight/update-change information without exposing raw patient records or individual hospital updates
- [ ] Add an analytics page showing local/global sample counts, participating nodes, round progress, update counts, model versions, and metric changes over time
- [ ] Show how local model updates contribute to a new global model while preserving the Local/Global Node boundary

## Secondary (only after core demo works)

- [ ] Public-health regional aggregate signals layer
- [ ] ASHA voice input (STT → structured community report)
- [ ] PDS decision-support recommendations

---

## Changes made / Updates log

- [x] Added Flower dependency and verified the Python package import/version output.
- [x] Switched the active model to the real UCI Cleveland Heart Disease dataset and trained three FedAvg rounds.

## Note on scope conflict

The older pitch document proposed NIH ChestX-ray14 + CheXpert (imaging/CNN federated diagnosis).
`AGENT.md` (newer) defines the platform as **treatment/outcome learning on tabular clinical data**.
Going forward, follow `AGENT.md`: tabular is lighter to train/demo at a hackathon (no multi-GB
downloads, CPU-friendly), matches the existing `patients` schema, and non-IID hospital partitions
are trivially simulated by splitting records by region/hospital.
