# Federated Clinical Intelligence — Data Schemas

Two collections/tables per hospital node: **patients** and **logs**.
No separate "weights" or "checkpoint" table — both are derived from these two.

---

## 1. Patients Schema

Source of truth for hospital-local patient data. Never leaves the hospital.

```json
{
  "patient_id": "8f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
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
  "updated_at": "2026-08-22T10:15:00Z"
}
```

**Notes:**

- `contributed_to_round` — last training round this patient's data was included in. Not a "per-patient weight," just a marker.
- `updated_at` — drives which patients are picked up for the _next_ training round (see query below).
- On patient update/creation: only this record changes. No weight computation happens here.

---

## 2. Logs Schema (Global I/O + Rounds)

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

**Patients to include in the next training round:**

```sql
SELECT * FROM patients
WHERE updated_at > (
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
