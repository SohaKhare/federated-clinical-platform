import type { HealthConditions } from "./patient.interface.js";

export interface CreatePatientEventInput {
  eventType: string;
  eventData: HealthConditions;
  occurredAt?: string;
}

export interface PatientEvent {
  event_id: string;
  patient_id: string;
  event_type: string;
  event_data: HealthConditions;
  occurred_at: string;
  created_at: string;
}

/**
 * System-managed event types that carry a full ClinicalSnapshot as their
 * event_data. Reserved: a client can never create one of these directly
 * through POST /patients/:id/events, since a hand-crafted payload of the
 * wrong shape would corrupt "current clinical state" lookups.
 */
export const CLINICAL_SNAPSHOT_EVENT_TYPES = [
  "patient_created",
  "patient_updated",
] as const;