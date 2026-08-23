# Backend Testing I/O

Base URL:

```text
http://localhost:5000
```

The backend uses cookie-based sessions. For protected requests, keep the
session cookie returned after Google OAuth. All request bodies must use
`Content-Type: application/json`.

## Already built

These endpoints are currently implemented and can be tested against the
backend.

### Public endpoints

### GET `/`

Purpose: Confirm that the API is running.

Input: None.

Expected response `200`:

```json
{
  "message": "Federated Clinical Platform API",
  "status": "running"
}
```

### GET `/health`

Purpose: Basic backend health check.

Input: None.

Expected response `200`:

```json
{
  "status": "healthy",
  "service": "backend"
}
```

### Authentication endpoints

### GET `/auth/google`

Purpose: Start Google OAuth. Every login authenticates a `local` user — a
user is only ever promoted to `global` by manually updating their role in
the database.

Input: None.

Expected behavior: Redirects to Google and stores OAuth state in the session.

### GET `/auth/google/callback`

Query input:

```text
?code=<google-authorization-code>&state=<oauth-state>
```

Expected behavior:

- Exchanges the authorization code with Google.
- Verifies the Google ID token.
- Creates or updates a user in the database (role stays whatever it already
  was — `local` by default, `global` only if manually set).
- Stores the authenticated user in the session.
- Redirects to `/dashboard` on the frontend.

Failure responses:

- `400` missing code or invalid/mismatched state
- `401` missing ID token or unverifiable Google account
- `500` OAuth/database failure

### GET `/auth/me`

Purpose: Return the current session user.

Input: Valid session cookie required.

Expected response `200` after login (real captured output):

```json
{
  "authenticated": true,
  "user": {
    "userId": "02b6b04a-de58-4191-92fe-140fa2df84ed",
    "googleId": "fulltest-local-1787433028407",
    "email": "crab.ai2026+fulltest-local-1787433028407@gmail.com",
    "hospitalName": "AIIMS Delhi",
    "node": "local",
    "role": "local",
    "onboarded": true
  }
}
```

`picture` only appears if the Google account provided one; `hospitalName`
only appears once onboarding is complete. `node` always mirrors `role`.

Expected unauthenticated response `401`:

```json
{
  "authenticated": false,
  "message": "Not authenticated."
}
```

### POST `/auth/logout`

Purpose: Destroy the current session.

Input: None. Not gated by `requireAuth` — safe to call even with no active
session.

Expected response `200` (real captured output):

```json
{
  "message": "Logged out successfully."
}
```

Also clears the `connect.sid` cookie (real captured `Set-Cookie` header):

```text
connect.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

Calling `GET /auth/me` with the now-destroyed session cookie afterward
correctly returns `401` (verified live). Calling `POST /auth/logout` with no
session cookie at all still returns `200` with the same message — it's
idempotent rather than requiring an active session first.

### POST `/auth/onboarding`

Auth: Authenticated local user only.

Purpose: Save the hospital profile. One user represents one hospital for the
hackathon.

Input:

```json
{
  "hospitalName": "AIIMS Delhi",
  "pincode": "110029",
  "geolocation": {
    "latitude": 28.5672,
    "longitude": 77.21
  }
}
```

Expected response `200` (real captured output):

```json
{
  "user": {
    "userId": "02b6b04a-de58-4191-92fe-140fa2df84ed",
    "googleId": "fulltest-local-1787433028407",
    "email": "crab.ai2026+fulltest-local-1787433028407@gmail.com",
    "hospitalName": "AIIMS Delhi",
    "node": "local",
    "role": "local",
    "onboarded": true
  }
}
```

Note: `pincode` and `geolocation` are saved to the database but **not**
included in the session/`user` object returned here or from `GET /auth/me`
— `UserSession` (`user.interface.ts`) only ever exposes `hospitalName`. If
the frontend needs pincode/geolocation back, that's a gap to close later,
not something currently returned.

Invalid input response `400` (real captured output):

```json
{
  "message": "hospitalName, pincode, and geolocation are required."
}
```

### Local patient endpoints

Auth: Authenticated local user only.

Patient data must stay inside the local node. Do not expose these endpoints to
the global node.

### POST `/patients`

Purpose: Create a patient record in the local database. Internally this also
writes a `patient_created` event carrying the initial clinical snapshot
(`symptoms`/`diagnosed_diseases`/`health_conditions`), visible right away via
`GET /patients/:id/events` — the response below is unaffected.

Input:

```json
{
  "name": "Rekha Sharma",
  "age": 34,
  "sex": "F",
  "symptoms": ["fever", "cough", "fatigue"],
  "diagnosed_diseases": ["ICD10_J45"],
  "health_conditions": {
    "bp": "130/85",
    "sugar": "110mg/dL",
    "allergies": ["penicillin"]
  }
}
```

Expected response `201` (real captured output):

```json
{
  "patient": {
    "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
    "name": "Rekha Sharma",
    "age": 34,
    "sex": "F",
    "symptoms": ["fever", "cough", "fatigue"],
    "diagnosed_diseases": ["ICD10_J45"],
    "health_conditions": {
      "bp": "130/85",
      "sugar": "110mg/dL",
      "allergies": ["penicillin"]
    },
    "contributed_to_round": null,
    "updated_at": "2026-08-22T21:11:15.558Z",
    "created_at": "2026-08-22T21:11:15.558Z"
  }
}
```

Invalid input response `400` (real captured output):

```json
{
  "message": "Invalid patient. Required fields: name, age, sex, symptoms, diagnosed_diseases, and health_conditions."
}
```

### GET `/patients`

Purpose: List patients stored in the local database, newest updates first.

Input: Valid local session cookie required.

Expected response `200` (real captured output, before the PATCH below):

```json
{
  "patients": [
    {
      "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
      "name": "Rekha Sharma",
      "age": 34,
      "sex": "F",
      "symptoms": ["fever", "cough", "fatigue"],
      "diagnosed_diseases": ["ICD10_J45"],
      "health_conditions": {
        "bp": "130/85",
        "sugar": "110mg/dL",
        "allergies": ["penicillin"]
      },
      "contributed_to_round": null,
      "updated_at": "2026-08-22T21:11:15.558Z",
      "created_at": "2026-08-22T21:11:15.558Z"
    }
  ]
}
```

Expected unauthenticated response `401` (real captured output):

```json
{
  "message": "Authentication required."
}
```

Expected non-local-role response `403` (real captured output, global user
hitting a local-only route):

```json
{
  "message": "Access denied. Requires role: local.",
  "yourRole": "global"
}
```

### GET `/patients/:id`

Purpose: Return one patient's full profile (same merged shape as the list
endpoint).

Expected response `200` (real captured output):

```json
{
  "patient": {
    "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
    "name": "Rekha Sharma",
    "age": 34,
    "sex": "F",
    "symptoms": ["fever", "cough", "fatigue"],
    "diagnosed_diseases": ["ICD10_J45"],
    "health_conditions": {
      "bp": "130/85",
      "sugar": "110mg/dL",
      "allergies": ["penicillin"]
    },
    "contributed_to_round": null,
    "updated_at": "2026-08-22T21:11:15.558Z",
    "created_at": "2026-08-22T21:11:15.558Z"
  }
}
```

Expected response `404` for a nonexistent patient ID, or one belonging to
a different hospital (real captured output — never a `403`, so a caller
can't tell the difference between "doesn't exist" and "not yours"):

```json
{
  "message": "Patient not found."
}
```

### PATCH `/patients/:id`

Purpose: Update patient data. Changes to `name`/`age`/`sex` update the
patient record directly; changes to `symptoms`/`diagnosed_diseases`/
`health_conditions` are recorded as a new `patient_updated` event instead
(clinical data is never stored on the patient record itself — see
`SCHEMA.md`). The response always returns the full merged view either way.

Input:

```json
{
  "symptoms": ["fever", "cough", "fatigue", "shortness of breath"],
  "health_conditions": {
    "bp": "128/82",
    "sugar": "108mg/dL",
    "allergies": ["penicillin"]
  }
}
```

Expected response `200` (real captured output):

```json
{
  "patient": {
    "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
    "name": "Rekha Sharma",
    "age": 34,
    "sex": "F",
    "symptoms": ["fever", "cough", "fatigue", "shortness of breath"],
    "diagnosed_diseases": ["ICD10_J45"],
    "health_conditions": {
      "bp": "128/82",
      "sugar": "108mg/dL",
      "allergies": ["penicillin"]
    },
    "contributed_to_round": null,
    "updated_at": "2026-08-22T21:11:16.515Z",
    "created_at": "2026-08-22T21:11:15.558Z"
  }
}
```

The corresponding event is available through `GET /patients/:id/events`
(real captured `event_data` for the `patient_updated` entry):

```json
{
  "event_type": "patient_updated",
  "event_data": {
    "symptoms": ["fever", "cough", "fatigue", "shortness of breath"],
    "health_conditions": {
      "bp": "128/82",
      "sugar": "108mg/dL",
      "allergies": ["penicillin"]
    },
    "diagnosed_diseases": ["ICD10_J45"]
  }
}
```

`event_data` is just the flat clinical state right after this update — no
diff, no wrapper. The patient's current clinical state is always whichever
`patient_created`/`patient_updated` event is most recent; the full history
is the ordered list `GET /patients/:id/events` already returns.
`patient_created` and `patient_updated` are reserved event types — a
`POST /patients/:id/events` call using either of those two names as
`eventType` is rejected with `400`.

### GET `/patients/:id/events`

Purpose: Return the patient's chronological clinical events.

Input: Valid local session cookie and a patient UUID in the URL.

Expected response `200` (real captured output — full chronological history
after the create + treatment event + PATCH above, oldest first):

```json
{
  "events": [
    {
      "event_id": "9f3a00eb-776d-454a-b78c-14e8cb5e5243",
      "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
      "event_type": "patient_created",
      "event_data": {
        "symptoms": ["fever", "cough", "fatigue"],
        "health_conditions": { "bp": "130/85", "sugar": "110mg/dL", "allergies": ["penicillin"] },
        "diagnosed_diseases": ["ICD10_J45"]
      },
      "occurred_at": "2026-08-22T21:11:15.648Z",
      "created_at": "2026-08-22T21:11:15.648Z"
    },
    {
      "event_id": "8c313937-0742-472c-90d9-14a2f5c1885b",
      "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
      "event_type": "treatment",
      "event_data": {
        "outcome": "improving",
        "treatment": "Treatment A"
      },
      "occurred_at": "2026-08-22T10:30:00.000Z",
      "created_at": "2026-08-22T21:11:16.869Z"
    },
    {
      "event_id": "50183fd1-b206-4d8d-bb6e-83495c8e93f0",
      "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
      "event_type": "patient_updated",
      "event_data": {
        "symptoms": ["fever", "cough", "fatigue", "shortness of breath"],
        "health_conditions": { "bp": "128/82", "sugar": "108mg/dL", "allergies": ["penicillin"] },
        "diagnosed_diseases": ["ICD10_J45"]
      },
      "occurred_at": "2026-08-22T21:11:16.580Z",
      "created_at": "2026-08-22T21:11:16.580Z"
    }
  ]
}
```

Note the ordering is by `occurred_at`, not `created_at`: the `treatment`
event was created last (`created_at` 21:11:16.869) but its caller-supplied
`occurredAt` (10:30:00.000Z, earlier that same day) puts it second in the
list, ahead of the `patient_updated` event that was actually created before
it. `patient_created` and `patient_updated` always use the real server time
for `occurred_at` since they're system-generated.

### POST `/patients/:id/events`

Purpose: Append a clinical event to a patient history.

Input:

```json
{
  "eventType": "treatment",
  "eventData": {
    "treatment": "Treatment A",
    "outcome": "improving"
  },
  "occurredAt": "2026-08-22T10:30:00.000Z"
}
```

Expected response `201` (real captured output):

```json
{
  "event": {
    "event_id": "8c313937-0742-472c-90d9-14a2f5c1885b",
    "patient_id": "e99e6134-b043-4058-9f7e-201f002da401",
    "event_type": "treatment",
    "event_data": {
      "outcome": "improving",
      "treatment": "Treatment A"
    },
    "occurred_at": "2026-08-22T10:30:00.000Z",
    "created_at": "2026-08-22T21:11:16.869Z"
  }
}
```

Invalid input response `400` (real captured output):

```json
{
  "message": "eventType and eventData are required."
}
```

Reserved-event-type response `400` (real captured output, attempting
`eventType: "patient_updated"`):

```json
{
  "message": "eventType 'patient_updated' is reserved and cannot be created directly."
}
```

### GET `/patients/presentation-batch`

Purpose: Return 10–20 held-out, de-identified demo rows from
`federated/data/heart_presentation_pool.csv`, scoped to a stable
per-hospital partition (`hash(hospitalId) % 3`) and shuffled/sliced fresh
on every call — a live-demo prop, not real patient data.

Input: Valid local session cookie required.

Expected response `200` (real captured output, truncated to 3 of 10 rows —
`patients.length` varies 10–20 between calls):

```json
{
  "hospital_id": 1,
  "patients": [
    {
      "source_row": 127,
      "age": 54,
      "sex": "1.0",
      "symptoms": ["clinical screening"],
      "heart_disease": true
    },
    {
      "source_row": 15,
      "age": 57,
      "sex": "1.0",
      "symptoms": ["clinical screening"],
      "heart_disease": false
    },
    {
      "source_row": 31,
      "age": 60,
      "sex": "1.0",
      "symptoms": ["clinical screening"],
      "heart_disease": true
    }
  ]
}
```

Note `sex` is the raw dataset encoding (`"1.0"`/`"0.0"`), not the
`"male"`/`"female"` strings used elsewhere in the API — this endpoint reads
straight from the CSV without normalizing it, unlike the OCR/patient
endpoints above.

### POST `/patients/ocr`

Auth: Authenticated local user only. Verified live against the real Gemini
API (not mocked) — see `API.md`'s `POST /patients/ocr` section for the full
request/response contract; this note just records what was actually tested.

A synthetic one-page PDF report ("Name: Meera Iyer / Age: 47 Sex: Female /
Presenting complaints: chest pain, shortness of breath / Diagnosis:
hypertension / Blood pressure: 145/95 mmHg / Diabetic: No") was uploaded and
correctly extracted end to end (real captured output):

```json
{
  "results": [
    {
      "filename": "report.pdf",
      "draft": {
        "name": "Meera Iyer",
        "age": 47,
        "sex": "female",
        "symptoms": ["chest pain", "shortness of breath"],
        "diagnosed_diseases": ["hypertension"],
        "health_conditions": { "blood_pressure": "145/95 mmHg", "diabetic": false }
      },
      "warnings": []
    }
  ]
}
```

`POST /patients/ocr` with no files attached returns `400` (real captured
output):

```json
{
  "message": "No reports uploaded. Attach one or more images/PDFs as the 'reports' form field."
}
```

### Local aggregates and records

Auth: Authenticated local user only.

### GET `/logs`

Purpose: Role-aware — the same path behaves differently depending on the
caller. A `local` account gets this section's original behavior: its own
hospital's federated-round activity log (`node_id` is always the caller's
own `userId` — one hospital never sees another's logs, unchanged). A
`global` account instead gets every node's logs at once — see "GET `/logs`
(global)" below for that shape.

Query params (all optional):

- `direction` — `outgoing` or `incoming`
- `status` — `pending`, `confirmed`, or `failed`
- `round` — non-negative integer, exact round match
- `page` — positive integer, default `1`
- `pageSize` — positive integer, default `20`, max `200`

Expected response `200` (ordered newest round first). `pagination.total`/
`totalPages` reflect the filtered count (i.e. after `direction`/`status`/
`round` are applied, not the hospital's total log count). Real captured
output for a hospital with 3 seeded log rows:

```json
{
  "logs": [
    {
      "log_id": "4fc58403-7a07-4981-b112-aee10bcfe5cd",
      "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
      "timestamp": "2026-08-22T21:11:46.404Z",
      "direction": "incoming",
      "round": 3,
      "metadata": {},
      "status": "confirmed",
      "created_at": "2026-08-22T21:11:46.404Z"
    },
    {
      "log_id": "407d9ed3-c289-4406-af46-bb99ee9621c8",
      "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
      "timestamp": "2026-08-22T21:11:46.318Z",
      "direction": "outgoing",
      "round": 3,
      "metadata": {
        "num_examples": 500,
        "metrics": { "epsilon": 3.2, "delta": 0.00001, "clipping_norm": 1, "noise_multiplier": 1.1 }
      },
      "status": "confirmed",
      "created_at": "2026-08-22T21:11:46.318Z"
    },
    {
      "log_id": "62ff1a84-4a65-4418-9d2b-e5abbade3970",
      "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
      "timestamp": "2026-08-22T21:11:46.433Z",
      "direction": "outgoing",
      "round": 2,
      "metadata": { "num_examples": 480 },
      "status": "failed",
      "created_at": "2026-08-22T21:11:46.433Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 }
}
```

With `?direction=outgoing&status=confirmed` applied, only the round-3
outgoing row is returned, and `pagination.total` drops to `1` — confirming
the count reflects the filtered set, not the hospital's full log count.

Invalid query response `400` (real captured output, `?pageSize=99999`):

```json
{
  "message": "Invalid query. direction must be 'outgoing' or 'incoming', status must be 'pending', 'confirmed', 'failed', 'preparing', 'submitted', 'received', 'applied', or 'synced', round must be a non-negative integer, page must be a positive integer, and pageSize must be a positive integer up to 200."
}
```

Note: the new federation round endpoints write round lifecycle rows into the
`logs` table, but until a federated round is started this will still return
`{"logs": [], "pagination": {"page":1,"pageSize":20,"total":0,"totalPages":0}}`.

### GET `/logs` (global)

Auth: Authenticated global user only. Same path and query params as the
local view above (`direction`, `status`, `round`, `page`, `pageSize`), but
with no per-hospital scoping at all — every node's log rows, newest round
first.

Expected response `200` (real captured output, mixing a freshly-seeded row
from one test hospital with the pre-existing "AIIMS Delhi" demo history —
`node_id` varies across rows, unlike the local view):

```json
{
  "logs": [
    {
      "log_id": "9a9c84c5-689e-4001-a2e6-223d59545e84",
      "node_id": "6ef414e9-3a43-4362-8b65-94782fae7da8",
      "timestamp": "2026-08-23T07:53:57.505Z",
      "direction": "outgoing",
      "round": 701,
      "metadata": {
        "num_examples": 210,
        "batch_size": 32,
        "local_epochs": 1,
        "metrics": { "loss": 0.42, "epsilon": 3.2, "delta": 0.00001, "clipping_norm": 1, "noise_multiplier": 1.1 }
      },
      "status": "preparing",
      "created_at": "2026-08-23T07:53:57.505Z"
    },
    {
      "log_id": "e1c25641-42ce-4dbb-a3be-0e6e8cf503ca",
      "node_id": "754d6124-0e06-4a5c-9f47-2e16bda13ae9",
      "timestamp": "2026-08-23T07:53:57.294Z",
      "direction": "outgoing",
      "round": 700,
      "metadata": {
        "num_examples": 210,
        "metrics": { "epsilon": 3.2, "delta": 0.00001, "clipping_norm": 1, "noise_multiplier": 1.1 },
        "loss": 0.31
      },
      "status": "confirmed",
      "created_at": "2026-08-23T07:53:57.294Z"
    },
    {
      "log_id": "30000000-0000-4000-8000-000000000007",
      "node_id": "1bb53b66-de9d-432b-8851-9cedd26f1ea9",
      "timestamp": "2026-08-22T06:35:44.350Z",
      "direction": "incoming",
      "round": 4,
      "metadata": {
        "message": "Global model successfully synchronized",
        "global_round": 4,
        "model_version": "global-v4",
        "participating_nodes": 5,
        "metrics": { "epsilon": 3.2, "delta": 0.00001, "clipping_norm": 1, "noise_multiplier": 1.1 }
      },
      "status": "synced",
      "created_at": "2026-08-22T06:35:44.350Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 9, "totalPages": 1 }
}
```

A `local` account still hits the `/logs` section above, not this one — the
route dispatches on `req.session.user.role`, not a different path.

### GET `/logs/:nodeId`

Auth: Authenticated global user only (`403` for a `local` caller — real
captured output: `{"message":"Access denied. Requires role: global.","yourRole":"local"}`).

Purpose: One specific hospital's logs — same query params as above, scoped
to the `nodeId` in the URL instead of the caller.

Expected response `200` (real captured output):

```json
{
  "logs": [
    {
      "log_id": "9a9c84c5-689e-4001-a2e6-223d59545e84",
      "node_id": "6ef414e9-3a43-4362-8b65-94782fae7da8",
      "timestamp": "2026-08-23T07:53:57.505Z",
      "direction": "outgoing",
      "round": 701,
      "metadata": {
        "num_examples": 210,
        "batch_size": 32,
        "local_epochs": 1,
        "metrics": { "loss": 0.42, "epsilon": 3.2, "delta": 0.00001, "clipping_norm": 1, "noise_multiplier": 1.1 }
      },
      "status": "preparing",
      "created_at": "2026-08-23T07:53:57.505Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`400` for a malformed node id; `404` for a well-formed but unregistered one
(real captured output: `{"message":"Node not found."}`). Unlike the local
node's own `GET /logs`, this view has **no** empty-account demo fallback —
a node with zero logs correctly returns an empty list here, not another
hospital's data.

### GET `/logs/round/:roundId`

Auth: Authenticated global user only (`403` for `local`, same shape as
above).

Purpose: Every log row written during one federated round, across all its
participating nodes. Resolves `roundId` (the `federated_rounds.round_id`
uuid) to the numeric `logs.round` it corresponds to, then filters on that.

Expected response `200` (real captured output):

```json
{
  "logs": [
    {
      "log_id": "e1c25641-42ce-4dbb-a3be-0e6e8cf503ca",
      "node_id": "754d6124-0e06-4a5c-9f47-2e16bda13ae9",
      "timestamp": "2026-08-23T07:53:57.294Z",
      "direction": "outgoing",
      "round": 700,
      "metadata": {
        "num_examples": 210,
        "metrics": { "epsilon": 3.2, "delta": 0.00001, "clipping_norm": 1, "noise_multiplier": 1.1 },
        "loss": 0.31
      },
      "status": "confirmed",
      "created_at": "2026-08-23T07:53:57.294Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`400` for a malformed round id; `404` for a well-formed but unknown one
(real captured output: `{"message":"Round not found."}`).

### GET `/federated/status`

Purpose: Return the caller's own hospital's federation status. This is the
local node's view of the current federated round lifecycle and reuses the
same lookup the global node uses to check any hospital
(`node.service.ts::getNodeStatus`), just scoped to the caller.

Expected response `200` (real captured output, same 3 seeded logs as above):

```json
{
  "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
  "hospital_name": "AIIMS Delhi",
  "status": "active",
  "federation_state": {
    "latest_round_seen": 3,
    "last_direction": "outgoing",
    "last_status": "failed"
  },
  "last_activity_at": "2026-08-22T21:11:46.433Z"
}
```

`status` is `"registered"` if the hospital has never appeared in `logs`,
`"active"` if its last activity was within 24 hours, otherwise `"idle"`.
`federation_state` is the compact round-state summary that the global node
tracks per hospital. In the async push/callback model, the lifecycle will
usually move through these statuses:

- `preparing` when the global round start request lands on a local node
- `submitted` or `training_complete` when the local node finishes training
  and reports back
- `received` when the global node accepts and stores the update
- `applied` or `synced` when the local node receives the new global weights

Note `federation_state` reflects the single most-recent log **by
timestamp**, not the highest round number — here the round-2 `outgoing`
row happened to be inserted after the round-3 rows, so it's what
`last_direction`/`last_status` report, even though `latest_round_seen`
correctly reports the max round (`3`) across all logs.

Response `404` if the caller hasn't completed onboarding yet (real captured
output):

```json
{
  "message": "Hospital profile not found. Complete onboarding first."
}
```

### GET `/privacy/parameters`

Purpose: Return this hospital's DP metadata. This is read from the latest
confirmed `outgoing` log's `metadata.metrics`, never fabricated — until a
real federated round reports these numbers, every field stays `null` and
`dp_enabled` stays `false` (per `API.md`'s rule against describing an update
as private unless the mechanism is actually enabled and measured).

Expected response `200` (real captured output, once a round has reported
DP metrics):

```json
{
  "dp_enabled": true,
  "epsilon": 3.2,
  "delta": 0.00001,
  "clipping_norm": 1,
  "noise_multiplier": 1.1,
  "as_of_round": 3
}
```

Before any round has run (real captured output, a different hospital with
no logs at all):

```json
{
  "dp_enabled": false,
  "epsilon": null,
  "delta": null,
  "clipping_norm": null,
  "noise_multiplier": null,
  "as_of_round": null
}
```

### GET `/research/summary`

Purpose: Return coarse aggregate stats over this hospital's own patients —
age distribution, sex breakdown, and top diagnoses/symptoms. Pure SQL
aggregation over real patient data, no ML involved.

Any diagnosis or symptom seen in fewer than `min_group_size` patients (3) is
left out entirely, per `API.md`'s rule against exposing small groups that
could re-identify a patient.

Expected response `200` (real captured output, 3 patients — Rekha Sharma,
Amit Verma, and Sita Devi — all sharing `ICD10_J45` with `fever`+`cough`):

```json
{
  "total_patients": 3,
  "age": { "average": 31.3, "min": 8, "max": 52 },
  "sex_breakdown": { "F": 2, "M": 1 },
  "top_diagnosed_diseases": [{ "diagnosis": "ICD10_J45", "count": 3 }],
  "top_symptoms": [
    { "symptom": "fever", "count": 3 },
    { "symptom": "cough", "count": 3 }
  ],
  "min_group_size": 3
}
```

Confirmed live: when a 4th patient was seeded with a unique diagnosis seen
by only 1 patient, it correctly did **not** appear in
`top_diagnosed_diseases` (below the threshold of 3) — verified in an
earlier test run, not shown in this exact capture.

### GET `/research/insights`

Purpose: Return observed symptom/diagnosis associations within this
hospital's own patients — still plain co-occurrence counting, not ML.
Labelled as observed patterns, never a causal claim, per `API.md`.

Same `min_group_size` suppression applies: a diagnosis is only included if
at least 3 patients share it.

Expected response `200` (real captured output, same 3 patients as above):

```json
{
  "associations": [
    {
      "diagnosis": "ICD10_J45",
      "patient_count": 3,
      "common_symptoms": [
        { "symptom": "fever", "count": 3 },
        { "symptom": "cough", "count": 3 }
      ]
    }
  ],
  "min_group_size": 3,
  "note": "Observed associations only, derived from co-occurrence counts within this hospital's own patients. Not a causal claim."
}
```

### Current demo endpoints

### GET `/api/hospital/summary`

Auth: Authenticated local user only.

Expected response `200` (real captured output):

```json
{
  "role": "local",
  "user": "crab.ai2026+fulltest-local-1787433028407@gmail.com",
  "message": "Local institution dashboard data."
}
```

Real captured `403` when a `global` user calls it:

```json
{
  "message": "Access denied. Requires role: local.",
  "yourRole": "global"
}
```

### GET `/api/federated/status`

Auth: Authenticated global user only.

Expected response `200` (real captured output):

```json
{
  "role": "global",
  "user": "test@example.com",
  "message": "Federated server dashboard data."
}
```

Real captured `403` when a `local` user calls it: same shape as above, with
`"yourRole": "local"` and a message requiring role `global`.

### Global node endpoints

Auth: Authenticated global user only. These give the global/federation side
a read-only view of registered hospitals, derived from `users` (role
`local`, onboarded) and their `logs` rows — no patient data is ever
exposed here.

### GET `/nodes`

Purpose: List every onboarded local hospital with its current federation
status.

Expected response `200` (real captured output, one onboarded hospital with
the 3 seeded logs from above):

```json
{
  "nodes": [
    {
      "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
      "hospital_name": "AIIMS Delhi",
      "pincode": "110029",
      "geolocation": { "latitude": 28.5672, "longitude": 77.21 },
      "contact_email": "crab.ai2026+fulltest-local-1787433028407@gmail.com",
      "joined_at": "2026-08-22T21:10:28.986Z",
      "last_activity_at": "2026-08-22T21:11:46.433Z",
      "status": "active"
    }
  ]
}
```

### GET `/nodes/:id`

Purpose: Return one hospital's registration details plus its full
round-by-round participation history, grouped from `logs`.

Expected response `200` (real captured output):

```json
{
  "node": {
    "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
    "hospital_name": "AIIMS Delhi",
    "pincode": "110029",
    "geolocation": { "latitude": 28.5672, "longitude": 77.21 },
    "contact_email": "crab.ai2026+fulltest-local-1787433028407@gmail.com",
    "joined_at": "2026-08-22T21:10:28.986Z",
    "updated_at": "2026-08-22T21:11:01.635Z",
    "status": "active",
    "participation_history": [
      {
        "round": 2,
        "directions": ["outgoing"],
        "statuses": ["failed"],
        "exchanges": 1,
        "last_activity_at": "2026-08-22T21:11:46.433Z"
      },
      {
        "round": 3,
        "directions": ["outgoing", "incoming"],
        "statuses": ["confirmed"],
        "exchanges": 2,
        "last_activity_at": "2026-08-22T21:11:46.404Z"
      }
    ]
  }
}
```

`GET /nodes/:id` with a syntactically invalid ID returns `400`; a
well-formed but nonexistent UUID returns `404` (both confirmed live).

### GET `/nodes/:id/status`

Expected response `200` (real captured output — same shape and data as
`GET /federated/status` from the local side, since both reuse
`getNodeStatus`):

```json
{
  "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
  "hospital_name": "AIIMS Delhi",
  "status": "active",
  "federation_state": {
    "latest_round_seen": 3,
    "last_direction": "outgoing",
    "last_status": "failed"
  },
  "last_activity_at": "2026-08-22T21:11:46.433Z"
}
```

### GET `/nodes/health`

Purpose: Same ping-style check as `/nodes/:id/health`, but for every
onboarded local node at once, paginated. Registered before `/nodes/:id` in
the router so the literal path `/health` never gets swallowed by the `:id`
wildcard.

Query params (all optional):

- `page` — positive integer, default `1`
- `pageSize` — positive integer, default `20`, max `200`

Expected response `200` (real captured output, `pageSize=2`):

```json
{
  "checked_at": "2026-08-23T05:37:49.001Z",
  "nodes": [
    {
      "node_id": "1bb53b66-de9d-432b-8851-9cedd26f1ea9",
      "hospital_name": "AIIMS Delhi",
      "online": false,
      "last_seen_at": null,
      "checked_at": "2026-08-23T05:37:49.001Z"
    },
    {
      "node_id": "def06c04-466e-4a35-87ef-eacb9b4c275c",
      "hospital_name": "Demo General Hospital",
      "online": false,
      "last_seen_at": null,
      "checked_at": "2026-08-23T05:37:49.001Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 2, "total": 6, "totalPages": 3 }
}
```

Nodes are ordered alphabetically by `hospital_name`. `pagination.total`/
`totalPages` reflect the full onboarded-node count, not just the current
page. Invalid `page`/`pageSize` → `400` (same message shape as `GET
/logs`'s query validation).

### GET `/nodes/:id/health`

Purpose: Ping-style health check for one local node. There's no separate
server deployed per hospital to literally ping — a "local node" is a
role-scoped user in this shared backend — so `online` is derived from how
recently that node had any log activity, using a **5-minute** window (much
tighter than the 24-hour window `status`/`active` uses elsewhere).

Expected response `200` (real captured output, node with no recent
activity):

```json
{
  "node_id": "92408405-7871-4d5d-9bc6-3a9aa45dea82",
  "hospital_name": "Health Hospital A",
  "online": false,
  "last_seen_at": null,
  "checked_at": "2026-08-23T05:18:00.917Z"
}
```

Immediately after a fresh log row lands for that node (real captured
output):

```json
{
  "node_id": "92408405-7871-4d5d-9bc6-3a9aa45dea82",
  "hospital_name": "Health Hospital A",
  "online": true,
  "last_seen_at": "2026-08-23T05:18:00.922Z",
  "checked_at": "2026-08-23T05:18:01.027Z"
}
```

`400` for a malformed node ID, `404` for a well-formed but unknown/not-yet-
onboarded one (both real captured output).

### GET `/nodes/:id/metrics`

Expected response `200` (real captured output):

```json
{
  "node_id": "02b6b04a-de58-4191-92fe-140fa2df84ed",
  "hospital_name": "AIIMS Delhi",
  "total_exchanges": 3,
  "rounds_participated": 2,
  "exchanges_by_status": { "confirmed": 2, "failed": 1 },
  "first_activity_at": "2026-08-22T21:11:46.318Z",
  "last_activity_at": "2026-08-22T21:11:46.433Z"
}
```

Real captured `403` when a `local` user calls any `/nodes*` route (same
shape as the other role-guard `403`s above, `yourRole: "local"`).

### Basic test sequence

**Local node:**

1. Start the backend with `npm run dev`.
2. Open `GET /auth/google` and complete Google login.
3. Call `GET /auth/me` and confirm `role` is `local`.
4. Call `POST /auth/onboarding` with hospital details.
5. Call `POST /patients` with a valid patient body.
6. Call `GET /patients` and confirm the created patient is returned.
7. Call `GET /patients/:id`, `PATCH /patients/:id`, `GET/POST /patients/:id/events` and confirm the clinical-event history behaves as documented above.
8. Call `GET /logs`, `GET /federated/status`, `GET /privacy/parameters`, `GET /research/summary`, `GET /research/insights` and confirm real (not mock) data scoped to this hospital.
9. Call `GET /api/hospital/summary` and confirm local access.
10. Call the same protected endpoints without the session cookie and confirm they return `401`.

**Global node** (requires a separate user row with `role = 'global'`,
manually set in the database — see `SCHEMA.md`):

1. Log in as the `global` user and call `GET /auth/me` to confirm `role` is `global`.
2. Call `GET /api/federated/status` and confirm global access.
3. Call `GET /nodes`, `GET /nodes/:id`, `GET /nodes/:id/status`, `GET /nodes/:id/metrics` for an onboarded local hospital and confirm real participation data derived from `logs`.
4. Call every local-only route (`/patients`, `/logs`, `/research/*`, `/privacy/*`, `/federated/status`, `/api/hospital/summary`) as the global user and confirm each returns `403`.
5. Call every global-only route (`/nodes*`, `/api/federated/status`) as a local user and confirm each returns `403`.

## Federation and ML bridge (now available)

### POST `/federated/rounds/:roundId/start-training`

Auth: Authenticated local user only.

Input:

```json
{
  "round": 1,
  "config": {
    "local_epochs": 1,
    "batch_size": 32
  }
}
```

The backend forwards the local user ID, round ID, round number, config, and
callback URL to the ML service. Patient records are never sent.

Expected response: `202` with the ML service's accepted-run response.

### POST `/api/federated/rounds/start`

Auth: Authenticated global user only.

Purpose: Start a new federated round against onboarded local hospitals.
Writes an `outgoing`/`preparing` log row for each targeted hospital and
persists the round snapshot.

Input (all fields optional — omit `targetNodeIds` to target every onboarded
local hospital):

```json
{
  "targetNodeIds": ["local-user-uuid-1", "local-user-uuid-2"]
}
```

Expected response `202` (real captured output, 2 targeted hospitals):

```json
{
  "message": "Federated round started.",
  "round": {
    "round_id": "14cffeef-2d20-4a08-8824-fda6a42565b3",
    "round": 1,
    "status": "starting",
    "created_at": "2026-08-23T02:56:06.694Z",
    "updated_at": "2026-08-23T02:56:06.694Z",
    "target_node_ids": ["46b26dd6-84d4-4e68-a4c1-841e7cda2113", "c3a83530-4cf4-4cb2-bd1c-0d76b2b491ee"],
    "nodes": [
      {
        "node_id": "46b26dd6-84d4-4e68-a4c1-841e7cda2113",
        "hospital_name": "Hospital A",
        "status": "preparing",
        "last_event_at": "2026-08-23T02:56:06.694Z",
        "events": [{ "status": "preparing", "timestamp": "2026-08-23T02:56:06.694Z", "details": "Round started." }]
      },
      {
        "node_id": "c3a83530-4cf4-4cb2-bd1c-0d76b2b491ee",
        "hospital_name": "Hospital B",
        "status": "preparing",
        "last_event_at": "2026-08-23T02:56:06.694Z",
        "events": [{ "status": "preparing", "timestamp": "2026-08-23T02:56:06.694Z", "details": "Round started." }]
      }
    ],
    "ready_nodes": 0,
    "synced_nodes": 0
  }
}
```

`targetNodeIds` containing an unknown node ID → `404` with
`"Unknown local node(s): <id>"`. No eligible local hospitals at all → `500`
(`"No eligible local hospitals are available for a federated round."`
surfaces as a generic 500 via `mapFederationError`, since it isn't one of
the specifically-mapped error messages).

### GET `/api/federated/rounds/:roundId`

Auth: Authenticated global user only.

Purpose: Return the persisted status snapshot for a federated round.

Expected response: `200` with round status, participating nodes, node phases,
and progress counters. Unknown round IDs return `404`.

### GET `/api/federated/rounds`

Auth: Authenticated global user only.

Purpose: List persisted federated round snapshots, newest round first.

Expected response `200`:

```json
{
  "rounds": [
    {
      "round_id": "round-uuid",
      "round": 1,
      "status": "starting",
      "target_node_ids": ["local-user-uuid"],
      "nodes": [],
      "ready_nodes": 0,
      "synced_nodes": 0
    }
  ]
}
```

### POST `/api/federated/rounds/:roundId/callback`

Auth: ML service only, using the `X-Federation-Key` header. A browser session
is not required.

Input uses the existing callback format:

```json
{
  "nodeId": "local-user-uuid",
  "update": {
    "weights": {
      "layer.weight": [[0.1, 0.2]]
    }
  },
  "metrics": {
    "loss": 0.31,
    "epsilon": 3.2,
    "delta": 0.00001
  },
  "notes": "Local training completed"
}
```

The callback accepts only protocol data and rejects a missing or incorrect key
with `401`.

### POST `/api/federated/rounds/:roundId/broadcast`

Auth: Authenticated global user only.

Purpose: Broadcast aggregated weights to nodes that have already submitted
an update for this round (status `received` or `submitted`). Nodes not yet
ready are skipped rather than erroring the whole call.

Input (all fields optional — omit `nodeIds` to broadcast to every node
targeted by the round):

```json
{
  "nodeIds": ["local-user-uuid-1"],
  "weights": { "layer1": [0.1, 0.2] },
  "notes": "Round 1 aggregated weights"
}
```

Expected response `202` (real captured output — one of two round
participants had already submitted via the callback above, the other
hadn't):

```json
{
  "message": "Global weights broadcast completed.",
  "round": {
    "round_id": "14cffeef-2d20-4a08-8824-fda6a42565b3",
    "round": 1,
    "status": "completed",
    "nodes": [
      { "node_id": "46b26dd6-84d4-4e68-a4c1-841e7cda2113", "hospital_name": "Hospital A", "status": "synced", "...": "..." },
      { "node_id": "c3a83530-4cf4-4cb2-bd1c-0d76b2b491ee", "hospital_name": "Hospital B", "status": "preparing", "...": "..." }
    ],
    "ready_nodes": 0,
    "synced_nodes": 1
  },
  "broadcasted_nodes": ["46b26dd6-84d4-4e68-a4c1-841e7cda2113"],
  "skipped_nodes": []
}
```

Note `round.status` is `"completed"` only when every targeted node ended up
broadcasted; it's `"partial"` if some were skipped (still not ready) — that
distinction wasn't hit in this capture since `nodeIds` was scoped to just
the one ready node. Unknown/nonexistent `roundId` → `404`
(`"Round not found."`). No requested node is ready yet → `409`
(`"No participating nodes have completed training yet."`).

## To be built

These items are planned but are not currently available through the backend.

### Clinical and model APIs

These API areas are described in `API.md` but are not currently wired in the
Express backend:

- Model status, prediction, and metrics — the Python federated package now
  has real Flower app code (`model.py`, `task.py`, `server_app.py`,
  `client_app.py`), but nothing in it talks to this backend yet, so there's
  no trained model/version for these endpoints to call.

### Federated and privacy APIs

- `GET /privacy/status` — nothing yet configures whether DP/SecAgg are
  meant to be on, so there's nothing honest to report here (distinct from
  `GET /privacy/parameters`, which is implemented and reports real numbers
  once available).

### Research and operations APIs

- Heatmap APIs — deferred; more meaningful once more than one hospital's
  data exists (better suited to the Global Node).
