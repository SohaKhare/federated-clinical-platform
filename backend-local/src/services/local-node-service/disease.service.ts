import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";

/**
 * Bridge to the XGBoost disease-classifier endpoints exposed by the
 * co-located Python ML service (federated/src/federated/service.py).
 *
 * Dataset contract:
 *   rows 1-2500    -> training data, seeded into public.patients2
 *   rows 2501-3000 -> held-out test set (never inserted)
 *   rows 3001-5000 -> unseen future pool; the Add Patients button pulls
 *                     10-20 random rows from here and inserts them.
 */

const FEDERATION_HEADERS = {
  "Content-Type": "application/json",
  "X-Federation-Key": env.federationSharedSecret,
};

export interface DiseasePrediction {
  predicted_diagnosis: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface FuturePoolPatient {
  source_row: number;
  patient_id: string;
  previous_diagnosis: string;
  medical_conditions: string;
  current_symptoms: string[];
  age: number;
  gender: string;
  hospital: string;
  location: string;
  diagnosis_date: string;
  actual_diagnosis: string;
  prediction: DiseasePrediction;
}

export interface DiseaseMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: number[][];
  classes: string[];
  train_rows: number;
  test_rows: number;
  trained_at: string;
}

export interface TrendPoint {
  period: string;
  total: number;
  [diagnosis: string]: unknown;
}

export interface DiseaseTrends {
  granularity: string;
  points: TrendPoint[];
  diseases: string[];
  regional_top: Record<string, Array<{ diagnosis: string; count: number }>>;
}

async function mlFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.federatedUrl}${path}`, {
    ...init,
    headers: FEDERATION_HEADERS,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ML service returned status ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return response.json() as Promise<T>;
}

export async function predictDisease(input: {
  age: number;
  gender: string;
  previous_diagnosis?: string;
  medical_conditions?: string;
  current_symptoms?: string | string[];
  hospital?: string;
  location?: string;
  diagnosis_date?: string;
}): Promise<DiseasePrediction> {
  return mlFetch<DiseasePrediction>("/federation/disease/predict", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      current_symptoms: Array.isArray(input.current_symptoms)
        ? input.current_symptoms.join(", ")
        : (input.current_symptoms ?? ""),
    }),
  });
}

export async function getDiseaseMetrics(): Promise<DiseaseMetrics> {
  return mlFetch<DiseaseMetrics>("/federation/disease/metrics");
}

export async function retrainDiseaseModel(): Promise<{ status: string } & DiseaseMetrics> {
  return mlFetch<{ status: string } & DiseaseMetrics>("/federation/disease/train", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getDiseaseTrends(granularity = "month"): Promise<DiseaseTrends[]> {
  return mlFetch<DiseaseTrends[]>(
    `/federation/disease/trends?granularity=${encodeURIComponent(granularity)}`,
  );
}

/**
 * Pulls a random 10-20 row batch from the unseen 3001-5000 pool (with model
 * predictions attached), then persists each row into public.patients2 so it
 * becomes part of this hospital's records. Rows already inserted are skipped
 * on conflict thanks to the unique source_row index.
 */
export async function addFutureBatch(hospitalId: string): Promise<FuturePoolPatient[]> {
  const { patients } = await mlFetch<{ patients: FuturePoolPatient[] }>(
    "/federation/disease/future-batch",
  );

  if (patients.length === 0) {
    return [];
  }

  const rows = patients.map((patient) => ({
    hospital_id: hospitalId,
    source_row: patient.source_row,
    dataset_patient_id: patient.patient_id,
    previous_diagnosis: patient.previous_diagnosis,
    medical_conditions: patient.medical_conditions,
    current_symptoms: patient.current_symptoms,
    age: patient.age,
    gender: patient.gender,
    hospital: patient.hospital,
    location: patient.location,
    diagnosis_date: patient.diagnosis_date,
    diagnosis: patient.actual_diagnosis,
    predicted_diagnosis: patient.prediction.predicted_diagnosis,
    prediction_confidence: patient.prediction.confidence,
    is_future_pool: true,
  }));

  const { error } = await supabase.from("patients2").upsert(rows, {
    onConflict: "source_row",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return patients;
}