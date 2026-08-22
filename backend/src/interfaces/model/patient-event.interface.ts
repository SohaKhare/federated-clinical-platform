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

export interface PatientChangeEventData {
  current: PatientEventSnapshot;
  previous_snapshots: PatientEventSnapshot[];
}

export interface PatientEventSnapshot {
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: HealthConditions;
}