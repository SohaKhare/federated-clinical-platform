export interface AgeStats {
  average: number | null;
  min: number | null;
  max: number | null;
}

export interface ResearchSummary {
  total_patients: number;
  age: AgeStats;
  sex_breakdown: Record<string, number>;
  top_diagnosed_diseases: { diagnosis: string; count: number }[];
  top_symptoms: { symptom: string; count: number }[];
  min_group_size: number;
}

export interface DiagnosisSymptomAssociation {
  diagnosis: string;
  patient_count: number;
  common_symptoms: { symptom: string; count: number }[];
}

export interface ResearchInsights {
  associations: DiagnosisSymptomAssociation[];
  min_group_size: number;
  note: string;
}
