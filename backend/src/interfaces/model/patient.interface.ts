export interface HealthConditions {
  [condition: string]: unknown;
}

/**
 * The clinical fields for a patient. These are never stored on the
 * `patients` row itself — only inside `patient_created`/`patient_updated`
 * events. A patient's "current" clinical state is the latest such event.
 */
export interface ClinicalSnapshot {
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: HealthConditions;
}

export interface CreatePatientInput {
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: HealthConditions;
}

export interface UpdatePatientInput {
  name?: string;
  age?: number;
  sex?: string;
  symptoms?: string[];
  diagnosed_diseases?: string[];
  health_conditions?: HealthConditions;
}

export interface Patient extends CreatePatientInput {
  patient_id: string;
  hospital_id: string;
  contributed_to_round: number | null;
  updated_at: string;
  created_at: string;
}