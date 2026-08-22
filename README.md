# Federated Clinical Platform

A federated learning platform for clinical data. Hospitals (Local Nodes) keep patient data on-premise; a Global Node coordinates federated training rounds and only ever sees model parameters and aggregate metrics — never raw records.

## Repository layout

| Folder | Stack | Role |
| --- | --- | --- |
| `backend/` | Node.js, Express 5, TypeScript, Prisma, Supabase/Postgres | REST API for Local + Global nodes: auth (Google OAuth), patients, logs, node registry |
| `frontend/` | Next.js, TypeScript, Tailwind | Dashboards for hospital staff (local) and researchers (global) |
| `federated/` | Python 3.13, Flower, PyTorch | Federated training: FedAvg across 3 simulated hospital clients on the heart-disease dataset |

See [`API.md`](API.md) for the full API surface (with input/output samples), [`SCHEMA.md`](SCHEMA.md) for the data model, and [`ML_ARCHITECTURE.md`](ML_ARCHITECTURE.md) for the training design.

## Prerequisites

- Node.js ≥ 20 (or [Bun](https://bun.sh))
- Python ≥ 3.13 with [uv](https://docs.astral.sh/uv/)
- A Google Cloud OAuth client (web application) for login
- A Postgres database (Supabase works)

## Quick start

### 1. Backend (port 5000)

```bash
cd backend
npm install
cp .env.example .env        # fill in values below
npx prisma migrate dev      # create/update schema
npm run dev
```

Fill `.env`:

```env
PORT=5000
NODE_ENV=development
SESSION_SECRET=<random string>
LOCAL_GOOGLE_CLIENT_ID=<from Google Cloud Console>
LOCAL_GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000     # comma-separated allowlist
FEDERATED_URL=http://localhost:8000    # Python service bridge (planned)
DATABASE_URL=<postgres connection string>
```

The OAuth redirect URI must be `<BACKEND_URL>/auth/google/callback` in Google Cloud Console.

Verify it's up: `curl http://localhost:5000/health`

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Note: `frontend/lib/api.ts` currently serves mock data — wire it to `http://localhost:5000` as endpoints get connected.

### 3. Federated package

```bash
cd federated
uv sync                      # install deps into a venv
uv run prepare-data          # split/scale the heart-disease CSV
uv run run-federated         # Flower simulation: 3 clients, FedAvg, 3 rounds
```

On completion the global model is saved to `federated/models/clinical_model.pt`. Hyperparameters live in `[tool.flwr.app.config]` inside `federated/pyproject.toml`.

## How the pieces connect

```
frontend :3000 --REST + session cookies--> backend :5000
backend  :5000 --HTTP bridge (planned) --> federated :8000
federated       --metrics/log rows-------> backend (logs table)
```

- **Frontend → Backend** is live: cookie-based sessions, CORS restricted to `CORS_ORIGINS` with credentials enabled.
- **Backend → Federated** is planned: a small HTTP sidecar in the Python package will expose `POST /federation/runs` and `GET /federation/runs/{id}` (contract + samples in [`API.md`](API.md#backend--federated-connection)). Until then the simulation runs standalone.
- Only model parameters, metrics, and protocol status cross the federation boundary — never patient records.

## Testing flow

1. Start backend + frontend.
2. Visit the frontend, log in via Google (`GET /auth/google`).
3. Complete onboarding (`POST /auth/onboarding`) with your hospital profile — this registers you as a Local Node visible under `GET /nodes`.
4. Create/read patients (`POST /patients`, `GET /patients`).
5. Run the federated simulation (`uv run run-federated`) to produce a global model.

Detailed endpoint-by-endpoint request/response examples: see [`API.md`](API.md) and [`backend/testing_io.md`](backend/testing_io.md).
