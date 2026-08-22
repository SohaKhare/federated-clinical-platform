export interface HealthConditions {
  [condition: string]: unknown;
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