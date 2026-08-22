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

### GET `/auth/google/local`

Purpose: Start Google OAuth for a local hospital user.

Input: None.

Expected behavior: Redirects to Google and stores OAuth state in the session.

### GET `/auth/google/:node/callback`

Supported `node` value: `local`.

Query input:

```text
?code=<google-authorization-code>&state=<oauth-state>
```

Expected behavior:

- Exchanges the authorization code with Google.
- Verifies the Google ID token.
- Creates or updates a local user in the database.
- Stores the authenticated user in the session.
- Redirects to `/dashboard` on the frontend.

Failure responses:

- `400` invalid node, OAuth node mismatch, missing code, or invalid state
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

Purpose: Create a patient record in the local database.

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

Purpose: Update patient data while preserving the previous values in a
`patient_updated` event.

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
    "previous": {
      "symptoms": ["fever", "cough", "fatigue"],
      "health_conditions": {
        "bp": "130/85",
        "sugar": "110mg/dL",
        "allergies": ["penicillin"]
      }
    },
    "current": {
      "symptoms": ["fever", "cough", "fatigue", "shortness of breath"],
      "health_conditions": {
        "bp": "128/82",
        "sugar": "108mg/dL",
        "allergies": ["penicillin"]
      }
    },
    "changes": {
      "symptoms": {
        "previous": ["fever", "cough", "fatigue"],
        "current": ["fever", "cough", "fatigue", "shortness of breath"]
      },
      "health_conditions": {
        "previous": {
          "bp": "130/85",
          "sugar": "110mg/dL",
          "allergies": ["penicillin"]
        },
        "current": {
          "bp": "128/82",
          "sugar": "108mg/dL",
          "allergies": ["penicillin"]
        }
      }
    }
  }
}
```

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
2. Open `GET /auth/google/local` and complete Google login.
3. Call `GET /auth/me` and confirm `role` is `local`.
4. Call `POST /auth/onboarding` with hospital details.
5. Call `POST /patients` with a valid patient body.
6. Call `GET /patients` and confirm the created patient is returned.
7. Call `GET /api/hospital/summary` and confirm local access.
8. Call the same protected endpoints without the session cookie and confirm
   they return `401`.

## To be built

These items are planned but are not currently available through the backend.

### Patient APIs

`GET /patients/:id`

A controller exists for fetching one patient, but this endpoint is not yet
registered in `patient.routes.ts`. Add the route before testing it through HTTP.

### Clinical and model APIs

These API areas are described in `API.md` but are not currently wired in the
Express backend:

- Model status, prediction, and metrics

### Federated and privacy APIs

- Federated status/round/history/participation APIs
- Privacy status and parameters

### Research and operations APIs

- Research and heatmap APIs
- Logs and audit APIs
- Global node management APIs
