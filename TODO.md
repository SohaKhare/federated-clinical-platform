# Project TODO

> Status legend: [x] done · [~] in progress · [ ] not started
>
> **Direction:** `AGENT.md` is the current source of truth (tabular treatment/outcome model).
> The older pitch doc (chest X-ray / CheXpert) is superseded — see note at bottom.

---

## Foundation

- [x] Project vision & MVP plan (`AGENT.md`)
- [x] ML architecture & execution flow (`ARCHITECTURE.md`)
- [x] Data schemas: `patients` + `logs`, ε/δ privacy-budget tracking (`SCHEMA.md`, `federated/schema.md`)
- [x] Backend scaffold (Express + TS)
- [x] Google OAuth + session auth (`backend/src/controllers/auth.controller.ts`)
- [x] Node roles: `local` / `global` + role-guarded routes (`backend/src/auth/roles.ts`)

## Phase 0 — Scope lock

- [ ] Confirm research question & target variable (e.g. readmission / adverse outcome from patient features)
- [ ] Pick public/de-identified tabular dataset(s) for simulated hospitals

## Phase 1 — Clinical Learning Model (core ML)

- [ ] Dataset download + preprocessing script (pandas)
- [ ] Feature engineering & train/eval splits per hospital partition
- [ ] `ClinicalModel(nn.Module)` in PyTorch
- [ ] Local train/eval loop with metrics (AUROC/F1/loss)

## Phase 2 — Federated Learning

- [ ] Flower server (`federated/src/federated/server/`)
- [ ] Hospital client (`fl.client.NumPyClient`) — 3 simulated nodes
- [ ] Data partitioning across clients (non-IID to be realistic)

## Phase 3 — FedAvg Aggregation

- [ ] FedAvg strategy wiring on server (`federated/src/federated/aggregation/`)
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

- [ ] Database implementing `patients`/`logs` schema (Postgres)
- [ ] FastAPI or extend Express backend: `/federated/status`, `/hospital/summary` returning real data
- [ ] Docker Compose: flower-server, hospital-a/b/c, backend, db, frontend
- [ ] Frontend: replace starter template with hospital dashboard + federated server dashboard

## Secondary (only after core demo works)

- [ ] Public-health regional aggregate signals layer
- [ ] ASHA voice input (STT → structured community report)
- [ ] PDS decision-support recommendations

---

## Note on scope conflict

The older pitch document proposed NIH ChestX-ray14 + CheXpert (imaging/CNN federated diagnosis).
`AGENT.md` (newer) defines the platform as **treatment/outcome learning on tabular clinical data**.
Going forward, follow `AGENT.md`: tabular is lighter to train/demo at a hackathon (no multi-GB
downloads, CPU-friendly), matches the existing `patients` schema, and non-IID hospital partitions
are trivially simulated by splitting records by region/hospital.
