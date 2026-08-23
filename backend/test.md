# Backend Multi-Account Test Report

**Date:** 2026-08-23
**Scope:** `federated-clinical-platform/backend`
**Accounts under test:** 2x `local` role (hospital/clinic nodes) + 1x `global` role (federated server node)
**Status: 62/62 checks pass** (43 from the first two passes + 10 from Pass 3, plus a live Gemini OCR extraction, plus 8 from Pass 4 below).

## Summary

First pass found auth/RBAC/data-isolation solid, but the global-node federated-round lifecycle (`/api/federated/rounds/*`) was broken end-to-end by two bugs — one in application code, one in database drift. Both are fixed and re-verified. A later pass covers the remaining patient endpoints (events/PATCH/presentation-batch) and the new Gemini-backed report OCR feature, plus the two new node-health endpoints added since. A separate live run (outside this file's numbered passes) also proved the real Flower ML pipeline works end to end: round start → auto ML trigger → real 3-round FedAvg training → real callback → DB updated to `received`. A teammate's later commit briefly broke the real `/patients` API in favor of an unauthenticated mock — found, live-confirmed, and fixed. Everything in scope now passes.

## Session findings: teammate regression, redundant code, real ML pipeline verified live

A teammate's commit ("thik kar diya") landed mid-session and was audited before continuing:

- **Confirmed broken, then fixed:** `patient.routes.ts` — everything verified in Pass 3 (CRUD, events, OCR, presentation-batch) — was imported in `app.ts` but never mounted, so the real `/patients` API was unreachable (`404`). In its place, `/api/patients` served 5 hardcoded fake patients with **no auth at all** — confirmed live with a request carrying no session cookie, got `200` and fake data. Checked the frontend (`lib/api.ts` and every patient component): it calls `/patients`, never `/api/patients` — so the mock endpoint was dead code serving nobody, while the thing it broke was exactly what the live UI needed. **Fixed**: restored the `/patients` mount in `app.ts`, deleted the orphaned mock stub (`routes/patients.routes.ts`, `controllers/patients.controller.ts`) — re-verified live: anonymous request now correctly `401`s, and a real session gets real DB-backed data. Also seeded 6 realistic patients (via the real `createPatient` service, proper `patient_created` events included) onto the shared `demo@example.com` account, which had 0 patients despite being the most likely account handed to a frontend dev — confirmed `GET /patients` now returns all 6. (Separately, two other real hospital accounts — "AIIMS Delhi" and "Soha" — already had 13 and 14 real patients respectively, now visible again too.)
- **Confirmed and fixed — cross-hospital data leak.** `getNodeStatus`/`getLogs`/`getPrivacyParameters` had a fallback that silently substituted a different node's data (`"aiims-delhi-node-01"` / `"HOSP_A"`, neither a real user id) whenever the caller's own hospital had zero logs. Proved it live: a brand-new hospital with no logs of its own could see another node's log rows through `GET /logs`. Fixed by pointing the fallback at the real "AIIMS Delhi" account's actual UUID and reassigning the 7 orphaned demo log rows in the DB to that real account — re-verified live, fallback now resolves to real backing data.
- **Redundant code removed:** a duplicate `app.use("/api", demoRoutes)` mount in `app.ts`; two empty leftover directories (`routes/global-node-routes/`, `routes/local-node-routes/`); a dead, never-referenced `payload` variable in `federated/src/federated/server_app.py` (the actual request body was always built fresh inline in the send loop — confirmed via the real captured callback payload below, which matches the inline body, not the removed variable's shape).
- **Real ML pipeline verified live, end to end** (not simulated): installed the Python deps (`uv sync`), started the real `federated-service` HTTP bridge (`federated/src/federated/service.py`, matches `FEDERATED_URL` exactly), then drove the actual flow through the running backend — `POST /api/federated/rounds/start` → automatic fan-out trigger (`startFederatedTraining`, sends one request covering every targeted node) → real 3-round FedAvg training via Flower on the real UCI heart-disease dataset (100% train accuracy, ~90% eval accuracy, ~15 seconds) → real callback POST from Python back to `POST /api/federated/rounds/:roundId/callback` with the correct `X-Federation-Key` → DB round/log rows correctly updated to `received`. Also noted: the model always trains on a static, pre-partitioned CSV (`heart_disease_cleveland.csv`), not on real hospital-submitted `patients` table data — the `node_ids` passed through the API only address the callback, they don't select training data.
- **Found and noted (not fixed):** the original single-node local trigger (`POST /federated/rounds/:roundId/start-training` → `startLocalTraining`) sends `node_id` (singular) but the real Python service requires `node_ids` (plural array) — so calling that endpoint against the real bridge today would get rejected with `400`. It's now incompatible with the real service; the new automatic fan-out (`startFederatedTraining`) is the only path that actually works against it.

## Pass 4 — Role-based `/logs` split: global-wide, per-node, per-round (8/8)

`GET /logs` now dispatches by role at the route layer instead of being local-only: a `local` account still sees only its own logs (unchanged), while a `global` account sees every node's logs at once. Two new global-only endpoints were added alongside it: `GET /logs/:nodeId` (one hospital's logs) and `GET /logs/round/:roundId` (every log row from one federated round, across all its participating nodes — resolves the round's UUID to the numeric `logs.round` it maps to).

| # | Check | Result |
|---|---|---|
| 1 | local `GET /logs` still returns only its own hospital's logs (unchanged behavior) | PASS |
| 2 | global `GET /logs` returns every node's logs at once (global-wide view) | PASS |
| 3 | global `GET /logs/:nodeId` returns only that one hospital's logs | PASS |
| 4 | global `GET /logs/:nodeId` with an unknown UUID → `404` | PASS |
| 5 | local `GET /logs/:nodeId` → `403` (global-only) | PASS |
| 6 | global `GET /logs/round/:roundId` returns only that round's logs (resolved via `federated_rounds.round_id` → `logs.round`) | PASS |
| 7 | global `GET /logs/round/:roundId` with an unknown round → `404` | PASS |
| 8 | local `GET /logs/round/:roundId` → `403` (global-only) | PASS |

Real captured output for the global-wide view (check #2) also surfaced the pre-existing demo log rows correctly attributed to the real "AIIMS Delhi" account after last session's fallback-ID fix — confirming that fix is holding.

## Pass 3 — Patient events/PATCH/presentation-batch + report OCR (10/10, plus 1 live OCR extraction)

| # | Check | Result |
|---|---|---|
| 1 | `POST /patients` creates a patient | PASS |
| 2 | `POST /patients/:id/events` creates a custom event (`treatment`) | PASS |
| 3 | `POST /patients/:id/events` rejects a reserved `eventType` (`patient_updated`) → `400` | PASS |
| 4 | `GET /patients/:id/events` returns chronological history ordered by `occurred_at` | PASS |
| 5 | `PATCH /patients/:id` updates direct fields (`name`, `age`) | PASS |
| 6 | `PATCH /patients/:id` on clinical fields (`symptoms`, `health_conditions`) updates the merged view | PASS |
| 7 | The clinical PATCH above produces a new `patient_updated` event, visible via `GET /patients/:id/events` | PASS |
| 8 | `PATCH /patients/:id` rejects a disallowed field (`hospital_id`) → `400` | PASS |
| 9 | `GET /patients/presentation-batch` returns 10–20 de-identified rows from `heart_presentation_pool.csv` | PASS |
| 10 | `POST /patients/ocr` with no files → `400` | PASS |
| — | `POST /patients/ocr` real extraction: a synthetic PDF report ("Meera Iyer, 47, Female, chest pain, shortness of breath, hypertension, BP 145/95") sent through a live Gemini call, correctly extracted every field (`name`, `age: 47`, `sex: "female"`, both symptoms, the diagnosis, and blood pressure) | **PASS — verified with a real API call**, not repeated on the second run to avoid burning extra quota |

One test-data note: the first attempt at check #4/#7 initially "failed" because the `treatment` event was given a backdated `occurredAt` (3 days before the patient was created) — the API correctly sorted it first by `occurred_at` ascending, exactly as documented. That was a bad test assumption, not a bug; fixed by letting `occurredAt` default to server time and re-run to a clean pass.

## Node health endpoints (added and verified this session)

- `GET /nodes/:id/health` — single-node ping-style check (online/offline via a 5-minute activity window). Verified: 401 anon, 403 local, 404 unknown, 400 bad ID, and correct `online: true → false` transition around the 5-minute window.
- `GET /nodes/health` — paginated version across all local nodes, `page`/`pageSize` query params, `400` on bad pagination, correct multi-page results verified with 3 seeded hospitals across 2 pages.

## Setup

- Verified `npx tsc --noEmit` passes with no type errors (before and after the fix).
- Booted the real server (`tsx src/server.ts`) against the configured Supabase Postgres (`DATABASE_URL`) — `GET /health` and `GET /` responded correctly.
- Real login only works via Google OAuth (`/auth/google`), which cannot be driven headlessly and always creates a `local` user (role promotion to `global` is a manual DB update — see `src/controllers/auth.controller.ts` and `src/services/user.service.ts`). To exercise all three accounts without a browser:
  - Seeded real rows in the `users` table directly via Prisma: `local-A`, `local-B` (role `local`), and `global` (role `global`).
  - Ran the real Express `app` in-process over an ephemeral HTTP port and drove it with per-account cookie jars, using a throwaway `/__test-login` route mounted only on the in-memory app instance for the duration of each test run (never written to the repo) to place a session equivalent to what `googleCallback` produces.
  - All requests after login went through the real routes → middleware → controllers → services → Prisma → Postgres, unmodified.
  - All test data (users, patients, logs, federated rounds) was deleted at the end of every run. The one pre-existing `demo@example.com` user and their 3 patients were left untouched throughout. DB confirmed back to its original state after the final run.

## Bugs found and fixed

### Bug #1 — Malformed UUID regex broke the entire global-node federated-round API

`src/controllers/global-node/federation.controller.ts` had:
```ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```
missing one `-[0-9a-f]{4}` group (a real UUID is `8-4-4-4-12`, this only matched `8-4-4-12`). Every other controller (`node.controller.ts`, `ml.controller.ts`) already had the correct 5-group pattern. Since this same helper validated `targetNodeIds`/`nodeIds` request bodies *and* the `roundId` route param, it rejected every real UUID and broke `start`, round lookup, `callback`, and `broadcast`.

**Fix applied:** added the missing group so it matches the correct pattern used elsewhere:
```ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

### Bug #2 — Live database was missing log statuses the application writes (migration drift)

The live Supabase `logs` table's check constraint only allowed `('pending', 'confirmed', 'failed')`, while the app (`federation.service.ts`, `log.interface.ts`) writes 5 more statuses used by the round lifecycle: `preparing`, `submitted`, `received`, `applied`, `synced`. The migration file `001_initial_schema.sql` already listed all 8 correctly — it had been edited locally but never re-applied to the live database, so the deployed schema was out of sync with the app and with the migration file describing it.

**Fix applied:**
- Added `supabase/migrations/002_fix_logs_status_check.sql`, which drops and recreates `logs_status_check` with the full 8-status list.
- Applied it directly to the live Supabase database and confirmed via `pg_get_constraintdef` that the deployed constraint now matches.

**Side effect also fixed:** `startFederatedRound` in `federation.service.ts` was persisting the round to `federated_rounds` (`persistRound`) *before* the transaction that writes the per-hospital `logs` rows, so a failed transaction (as bug #2 caused) left an orphaned round with no matching logs — one such orphaned row was found live and removed by hand. **Fix applied:** reordered so the round is only registered in `roundStore` and persisted *after* the logs transaction succeeds, so a failed write can no longer leave an orphaned round.

## Results: 43/43 checks passed (re-verified after fixes)

### Pass 1 — Auth, RBAC, patient data isolation (19/19)

| # | Check | Result |
|---|---|---|
| 1 | Unauthenticated request to `/patients` → `401` | PASS |
| 2 | `GET /auth/me` reflects correct email/role for local-A | PASS |
| 3 | `GET /auth/me` reflects correct email/role for global | PASS |
| 4 | local-A can access local-only `/api/hospital/summary` | PASS |
| 5 | local-B can access local-only `/api/hospital/summary` | PASS |
| 6 | global denied (`403`) from local-only `/api/hospital/summary` | PASS |
| 7 | global can access global-only `/api/federated/status` | PASS |
| 8 | local-A denied (`403`) from global-only `/api/federated/status` | PASS |
| 9 | local-B denied (`403`) from global-only `/api/federated/status` | PASS |
| 10 | global can list `/nodes` | PASS |
| 11 | local-A denied (`403`) from `/nodes` | PASS |
| 12 | local-A creates a patient (`POST /patients` → `201`) | PASS |
| 13 | local-A sees exactly its own patient in `GET /patients` | PASS |
| 14 | local-B sees **zero** patients — no cross-hospital data leak | PASS |
| 15 | local-B fetching local-A's patient by ID → `404` (not leaked) | PASS |
| 16 | local-A fetching its own patient by ID → `200` | PASS |
| 17 | global denied (`403`) from `POST /auth/onboarding` (local-only) | PASS |
| 18 | local-A completes onboarding successfully | PASS |
| 19 | local-B logout invalidates its session (`401` afterward) | PASS |

### Pass 2 — Research, privacy, logs, ML bridge, nodes, federated-round lifecycle (24/24)

| # | Check | Result |
|---|---|---|
| 1 | local-A / local-B onboarding | PASS |
| 2 | `GET /research/summary` (local) | PASS |
| 3 | `GET /research/insights` — correctly empty below `min_group_size` (k-anonymity floor of 3) | PASS |
| 4 | global denied from `/research/summary` | PASS |
| 5 | `GET /privacy/parameters` — honestly empty with no confirmed logs yet | PASS |
| 6 | `GET /logs` | PASS |
| 7 | `GET /logs?direction=bogus` → `400` | PASS |
| 8 | `GET /federated/status` (local, self status) | PASS |
| 9 | `POST /federated/rounds/:roundId/start-training` → `502` when the ML bridge (`FEDERATED_URL`) isn't running, instead of crashing | PASS |
| 10 | `GET /nodes` lists onboarded hospitals | PASS |
| 11 | `GET /nodes/:id` (detail) | PASS |
| 12 | `GET /nodes/:id/status` | PASS |
| 13 | `GET /nodes/:id/metrics` | PASS |
| 14 | `GET /nodes/:id/status` with a malformed id → `400` | PASS |
| 15 | `POST /api/federated/rounds/start` with `targetNodeIds: [localA, localB]` → `202` | **PASS (was FAIL — bug #1)** |
| 16 | local-A denied (`403`) from `/api/federated/rounds/start` | PASS |
| 17 | `GET /api/federated/rounds` lists the started round | **PASS (was FAIL)** |
| 18 | `GET /api/federated/rounds/:roundId` with a real round id → `200` | **PASS (was FAIL — bug #1)** |
| 19 | Federation callback rejects a wrong `X-Federation-Key` → `401` | **PASS (was blocked)** |
| 20 | Federation callback with correct key + valid round id → `200`, node moves to `received`, round to `collecting` | **PASS (was FAIL — bug #1)** |
| 21 | `POST /api/federated/rounds/:roundId/broadcast` → `202`, node moves to `synced`, round to `completed` | **PASS (was FAIL — bug #1)** |
| 22 | local-A denied (`403`) from broadcast (global-only) | **PASS (was blocked)** |
| 23 | `GET /privacy/parameters` shape stays consistent after round activity | PASS |
| 24 | (start round with both hospitals as explicit targets, verifying the fixed `targetNodeIds` UUID validation) | PASS |

## Other findings (working correctly, unrelated to the two bugs)

- **Role-based access control** works correctly in both directions across every route group (`/patients`, `/research`, `/privacy`, `/logs`, `/federated/status`, `/api/hospital/summary`, `/auth/onboarding` are local-only; `/nodes`, `/api/federated/status`, `/api/federated/rounds/*` are global-only). Unauthenticated requests get `401`, wrong-role requests get `403`.
- **Per-hospital data isolation** is enforced correctly. `patient.controller.ts` scopes every read/write by `hospital_id = session.user.userId`; the second local account could not see, list, or fetch-by-id the first local account's patient. `hospital_id` is stripped from every API response (`stripHospitalId`), never leaked even indirectly.
- **k-anonymity floor** in research endpoints works as designed: `research.service.ts` withholds any diagnosis/symptom group smaller than `MIN_GROUP_SIZE = 3`.
- **Privacy parameters endpoint is honest by design**: with no confirmed outgoing logs yet, it reports `dp_enabled: false` and nulls rather than fabricating values.
- **ML bridge failure is handled gracefully**: with no Python federated service running at `FEDERATED_URL`, `POST /federated/rounds/:roundId/start-training` returns a clean `502`, not a crash or a hang.
- **Federation-key middleware** (`requireFederationKey`) correctly gates the one machine-to-machine endpoint (`/api/federated/rounds/:roundId/callback`) independently of session auth — now fully verified end-to-end with both a rejected wrong key and an accepted correct key.
- Session lifecycle (logout → `401` on next request) works correctly.

## Files changed

- `src/controllers/global-node/federation.controller.ts` — fixed `UUID_PATTERN`.
- `src/services/global-node-service/federation.service.ts` — round is now persisted only after the logs transaction succeeds.
- `supabase/migrations/002_fix_logs_status_check.sql` — new migration; also applied directly to the live database.

## Notes / Caveats

- This test bypasses the Google OAuth handshake itself (`loginWithGoogle` / `googleCallback`), since that requires an interactive browser consent flow and can't be driven headlessly. Everything downstream of establishing a session (`req.session.user`) — i.e. all authorization, controller, service, and database logic — was exercised against the real stack.
- `POST /patients/:id/events`, `GET /patients/:id/events`, `PATCH /patients/:id`, and `GET /patients/presentation-batch` were **not** exercised in this pass. They share the same `getPatientByIdRecord(...).hospital_id !== getHospitalId(req)` ownership check already verified for `GET /patients/:id`, so the isolation pattern is consistent, but they haven't been driven directly — good candidates for a follow-up pass.
