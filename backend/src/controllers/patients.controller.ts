import type { Request, Response } from "express";

const MOCK_PATIENTS = [
  {
    "patient_id": "8f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
    "hospital_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
    "name": "Rekha Sharma",
    "age": 34,
    "sex": "F",
    "contributed_to_round": 14,
    "updated_at": "2026-08-22T10:15:00Z",
    "created_at": "2026-08-22T10:00:00Z"
  },
  {
    "patient_id": "a2c3b41d-8f9e-4a3b-b2c1-d4e5f6a7b8c9",
    "hospital_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
    "name": "Amit Patel",
    "age": 45,
    "sex": "M",
    "contributed_to_round": 12,
    "updated_at": "2026-08-20T09:30:00Z",
    "created_at": "2026-08-15T11:20:00Z"
  },
  {
    "patient_id": "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
    "hospital_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
    "name": "Priya Gupta",
    "age": 28,
    "sex": "F",
    "contributed_to_round": 8,
    "updated_at": "2026-08-21T14:45:00Z",
    "created_at": "2026-08-10T08:15:00Z"
  },
  {
    "patient_id": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
    "hospital_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
    "name": "Vikram Singh",
    "age": 52,
    "sex": "M",
    "contributed_to_round": 15,
    "updated_at": "2026-08-22T16:20:00Z",
    "created_at": "2026-08-05T10:05:00Z"
  },
  {
    "patient_id": "9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d",
    "hospital_id": "4f14e45f-ceea-4f3e-b6a1-0d2a3c4e5f6a",
    "name": "Neha Mehta",
    "age": 31,
    "sex": "F",
    "contributed_to_round": 5,
    "updated_at": "2026-08-19T11:10:00Z",
    "created_at": "2026-08-18T09:40:00Z"
  }
];

export function getPatients(req: Request, res: Response) {
  return res.json(MOCK_PATIENTS);
}
