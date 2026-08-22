# Federated Clinical Intelligence — Data Schemas

Four collections/tables per hospital node: **users**, **patients**,
**patient_events**, and **logs**. No separate "weights" or "checkpoint" table —
model versions and round updates are represented through log metadata.

For the hackathon, one user represents one hospital. Every user created
through Google OAuth gets the `local` role and its own hospital identity on
that user's profile. A user is promoted to `global` (federated server role)
by manually updating their row's `role` column in the database — there is
no self-service way to become `global`.

---

## 1. Users Schema

The local hospital profile and authentication identity.

```json
{
  "user_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
  "google_id": "google-account-id",
  "email": "hospital@example.com",
  "picture": "https://...",
  "role": "local",
  "hospital_name": "AIIMS Delhi",
  "pincode": "110029",
  "geolocation": {
    "latitude": 28.5672,
    "longitude": 77.21
  },
  "created_at": "2026-08-22T10:00:00Z",
  "updated_at": "2026-08-22T10:15:00Z"
}
```

`hospital_name`, `pincode`, and `geolocation` are collected through the
onboarding endpoint. The hospital name is not taken from Google's profile
name.

---

## 2. Patients Schema

Source of truth for hospital-local patient data. Never leaves the hospital.

```json
{
  "patient_id": "8f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
  "hospital_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
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
  "contributed_to_round": 14,
  "updated_at": "2026-08-22T10:15:00Z",
  "created_at": "2026-08-22T10:00:00Z"
}
```

**Notes:**

- `patient_id` — always server-generated (`gen_random_uuid()`). The API never
  accepts a client-supplied patient ID on create.
- `hospital_id` — foreign key to `users.user_id`, the owning hospital. Set
  once at creation from the authenticated session and never exposed in API
  responses; every patient read/write is scoped to it so one hospital can
  never see or modify another hospital's patients.
- `contributed_to_round` — last training round this patient's data was included in. Not a "per-patient weight," just a marker.
- `updated_at` — drives which patients are picked up for the _next_ training round (see query below).
- On patient creation: only this record changes. No weight computation happens here.
- On patient update: this record is changed and a `patient_updated` event is
  appended in the same database transaction.

---

## 3. Patient Events Schema

Append-only clinical history for a patient. Patient updates also create an
event with `event_type: "patient_updated"`; its `event_data` holds the full
current snapshot plus a stack of every prior snapshot — most recent first —
instead of a computed diff.

```json
{
  "event_id": "c9a1...",
  "patient_id": "8f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
  "event_type": "patient_updated",
  "event_data": {
    "current": {
      "name": "Rekha Sharma",
      "age": 34,
      "sex": "F",
      "symptoms": ["fever", "cough"],
      "diagnosed_diseases": ["ICD10_J45"],
      "health_conditions": { "bp": "128/82" }
    },
    "previous_snapshots": [
      {
        "name": "Rekha Sharma",
        "age": 34,
        "sex": "F",
        "symptoms": ["fever"],
        "diagnosed_diseases": ["ICD10_J45"],
        "health_conditions": { "bp": "130/85" }
      }
    ]
  },
  "occurred_at": "2026-08-22T10:20:00Z",
  "created_at": "2026-08-22T10:20:00Z"
}
```

`current` is the full patient state right after that update. Each further
update prepends one more entry onto `previous_snapshots`, so the array grows
across the patient's whole edit history — the full timeline is recoverable
without walking every event and re-applying diffs. Neither snapshot includes
`patient_id` or `hospital_id`; only the editable clinical fields.

Events are stored locally and linked to `patients.patient_id`. Deleting a
patient deletes its events.

## 4. Logs Schema (Global I/O + Rounds)

One row per round per direction (outgoing = hospital → global, incoming = global → hospital).
This table also acts as the "was it sent" and "last successful round" tracker — no separate table needed.

```json
{
  "log_id": "b2f5...",
  "node_id": "HOSP_A",
  "timestamp": "2026-08-22T10:20:00Z",
  "direction": "outgoing",
  "round": 14,
  "metadata": {
    "num_examples": 4213,
    "parameters": {
      "fc1.weight": [
        [0.0182, -0.0093],
        [0.0044, 0.0271]
      ],
      "fc1.bias": [0.0011, -0.0005, 0.0032],
      "fc2.weight": [[0.0509, -0.0117]],
      "fc2.bias": [-0.0021, 0.0084]
    },
    "metrics": { "loss": 0.31, "epsilon": 3.2, "delta": 1e-5 }
  },
  "status": "confirmed"
}
```

**Field notes:**

- `direction`: `"outgoing"` (hospital → global) or `"incoming"` (global → hospital, next round's weights).
- `status`: `"pending"` | `"confirmed"` | `"failed"` — this replaces a separate `sent: true/false` column.
- `metadata.parameters` — the actual model weight arrays (post DP-noise/SecAgg masking if used).
- `metadata.metrics.epsilon` / `metadata.metrics.delta` — the DP privacy budget spent by this hospital as of this round, as reported by the Opacus `PrivacyEngine` (`get_epsilon(delta)`). `epsilon` is cumulative across rounds for a given node, not just this round's spend — only present on `outgoing` rows, since it's a property of the hospital's own local training, not the broadcast.

**Example incoming (global → hospital) row:**

```json
{
  "log_id": "c9a1...",
  "node_id": "HOSP_A",
  "timestamp": "2026-08-22T10:25:00Z",
  "direction": "incoming",
  "round": 15,
  "metadata": {
    "parameters": {
      "fc1.weight": [[0.0179, -0.0091]],
      "fc1.bias": [0.0012, -0.0004],
      "fc2.weight": [[0.0498, -0.011]],
      "fc2.bias": [-0.0019, 0.0081]
    }
  },
  "status": "confirmed"
}
```

---

## Derived queries (no extra tables required)

**Patients to include in the next training round** (scoped to one hospital
via `hospital_id`, since `patients` now holds every hospital's records):

```sql
SELECT * FROM patients
WHERE hospital_id = :hospital_user_id
  AND updated_at > (
    SELECT MAX(timestamp) FROM logs
    WHERE node_id = 'HOSP_A' AND direction = 'outgoing' AND status = 'confirmed'
  );
```

**Whether the current round has been sent:**

```sql
SELECT status FROM logs
WHERE node_id = 'HOSP_A' AND round = 14 AND direction = 'outgoing';
```

**Current privacy budget spent by a hospital:**

```sql
SELECT metadata->'metrics'->>'epsilon' AS epsilon
FROM logs
WHERE node_id = 'HOSP_A' AND direction = 'outgoing' AND status = 'confirmed'
ORDER BY round DESC
LIMIT 1;
```

---

## Why no third "weights" table

A per-patient weight doesn't exist in FL — weights come from training on the hospital's
full local batch for a round, not per patient. Whether a round was sent, and when the
last one succeeded, are both already derivable from `logs.status` and `logs.timestamp`.
Storing them again in a separate table risks the two sources of truth drifting apart
(e.g. a `sent: true` flag contradicting a `status: "failed"` log).
