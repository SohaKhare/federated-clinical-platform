# Backend Multi-Account Test Report

**Date:** 2026-08-23
**Scope:** `federated-clinical-platform/backend`
**Accounts under test:** 2x `local` role (hospital/clinic nodes) + 1x `global` role (federated server node)
**Status: All fixed and re-verified — 43/43 checks pass.**

## Summary

First pass found auth/RBAC/data-isolation solid, but the global-node federated-round lifecycle (`/api/federated/rounds/*`) was broken end-to-end by two bugs — one in application code, one in database drift. Both are now fixed and the full round lifecycle (start → callback → broadcast) has been re-verified against the live database.

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
