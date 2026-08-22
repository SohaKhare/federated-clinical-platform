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

Expected response `200` after login:

```json
{
  "authenticated": true,
  "user": {
    "userId": "uuid",
    "googleId": "google-account-id",
    "email": "hospital@example.com",
    "picture": "https://...",
    "role": "local",
    "onboarded": false
  }
}
```

Expected unauthenticated response `401`:

```json
{
  "authenticated": false,
  "message": "Not authenticated."
}
```

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

Expected response `200`:

```json
{
  "user": {
    "userId": "uuid",
    "googleId": "google-account-id",
    "email": "hospital@example.com",
    "hospitalName": "AIIMS Delhi",
    "pincode": "110029",
    "geolocation": {
      "latitude": 28.5672,
      "longitude": 77.21
    },
    "role": "local",
    "onboarded": true
  }
}
```

Invalid input response `400`:

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

Expected response `201`:

```json
{
  "patient": {
    "patient_id": "uuid",
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
    "updated_at": "2026-08-22T10:15:00.000Z",
    "created_at": "2026-08-22T10:15:00.000Z"
  }
}
```

Invalid input response `400`:

```json
{
  "message": "Invalid patient. Required fields: name, age, sex, symptoms, diagnosed_diseases, and health_conditions."
}
```

### GET `/patients`

Purpose: List patients stored in the local database, newest updates first.

Input: Valid local session cookie required.

Expected response `200`:

```json
{
  "patients": [
    {
      "patient_id": "uuid",
      "name": "Rekha Sharma",
      "age": 34,
      "sex": "F",
      "symptoms": ["fever", "cough"],
      "diagnosed_diseases": ["ICD10_J45"],
      "health_conditions": {},
      "contributed_to_round": null,
      "updated_at": "2026-08-22T10:15:00.000Z",
      "created_at": "2026-08-22T10:15:00.000Z"
    }
  ]
}
```

Expected unauthenticated response `401`:

```json
{
  "message": "Authentication required."
}
```

Expected non-local-role response `403`:

```json
{
  "message": "Access denied. Requires role: local.",
  "yourRole": "global"
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

Expected response `200`:

```json
{
  "patient": {
    "patient_id": "uuid",
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
    "updated_at": "2026-08-22T10:40:00.000Z",
    "created_at": "2026-08-22T10:15:00.000Z"
  }
}
```

The corresponding event is available through `GET /patients/:id/events`:

```json
{
  "event_type": "patient_updated",
  "event_data": {
    "symptoms": ["fever", "cough", "fatigue", "shortness of breath"],
    "diagnosed_diseases": ["ICD10_J45"],
    "health_conditions": {
      "bp": "128/82",
      "sugar": "108mg/dL",
      "allergies": ["penicillin"]
    }
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

Expected response `200`:

```json
{
  "events": [
    {
      "event_id": "uuid",
      "patient_id": "uuid",
      "event_type": "treatment",
      "event_data": {
        "treatment": "Treatment A",
        "outcome": "improving"
      },
      "occurred_at": "2026-08-22T10:30:00.000Z",
      "created_at": "2026-08-22T10:30:00.000Z"
    }
  ]
}
```

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

Expected response `201`:

```json
{
  "event": {
    "event_id": "uuid",
    "patient_id": "uuid",
    "event_type": "treatment",
    "event_data": {
      "treatment": "Treatment A",
      "outcome": "improving"
    },
    "occurred_at": "2026-08-22T10:30:00.000Z",
    "created_at": "2026-08-22T10:30:00.000Z"
  }
}
```

Invalid input response `400`:

```json
{
  "message": "eventType and eventData are required."
}
```

### Local aggregates and records

Auth: Authenticated local user only.

### GET `/logs`

Purpose: Return this hospital's own federated-round activity log
(`node_id` is always the caller's own `userId` — one hospital never sees
another's logs).

Query params (all optional):

- `direction` — `outgoing` or `incoming`
- `status` — `pending`, `confirmed`, or `failed`
- `round` — non-negative integer, exact round match
- `page` — positive integer, default `1`
- `pageSize` — positive integer, default `20`, max `200`

Expected response `200` (ordered newest round first). `pagination.total`/
`totalPages` reflect the filtered count (i.e. after `direction`/`status`/
`round` are applied, not the hospital's total log count):

```json
{
  "logs": [
    {
      "log_id": "uuid",
      "node_id": "uuid",
      "timestamp": "2026-08-22T10:20:00.000Z",
      "direction": "outgoing",
      "round": 14,
      "metadata": { "num_examples": 4213 },
      "status": "confirmed",
      "created_at": "2026-08-22T10:20:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

Invalid query response `400`:

```json
{
  "message": "Invalid query. direction must be 'outgoing' or 'incoming', status must be 'pending', 'confirmed', or 'failed', round must be a non-negative integer, page must be a positive integer, and pageSize must be a positive integer up to 200."
}
```

Note: nothing currently writes to the `logs` table (the Python federated
package is still a scaffold), so this will return `{"logs": []}` until a
federated round actually runs and logs something.

### Current demo endpoints

### GET `/api/hospital/summary`

Auth: Authenticated local user only.

Expected response `200`:

```json
{
  "role": "local",
  "user": "hospital@example.com",
  "message": "Local institution dashboard data."
}
```

### GET `/api/federated/status`

Auth: Authenticated global user only.

Expected response `200`:

```json
{
  "role": "global",
  "user": "researcher@example.com",
  "message": "Federated server dashboard data."
}
```

### Basic test sequence

1. Start the backend with `npm run dev`.
2. Open `GET /auth/google` and complete Google login.
3. Call `GET /auth/me` and confirm `role` is `local`.
4. Call `POST /auth/onboarding` with hospital details.
5. Call `POST /patients` with a valid patient body.
6. Call `GET /patients` and confirm the created patient is returned.
7. Call `GET /api/hospital/summary` and confirm local access.
8. Call the same protected endpoints without the session cookie and confirm
   they return `401`.

## To be built

These items are planned but are not currently available through the backend.

### Clinical and model APIs

These API areas are described in `API.md` but are not currently wired in the
Express backend:

- Model status, prediction, and metrics — blocked on the Python federated
  package, which is still an empty scaffold (no trained model to call).

### Federated and privacy APIs

- Federated status/round/history/participation APIs (local-node side)
- Privacy status and parameters

### Research and operations APIs

- Research and heatmap APIs
- Audit trail API (`GET /audit`) — distinct from `GET /logs` above, which is
  already implemented.
