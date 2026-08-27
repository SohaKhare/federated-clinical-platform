import { env } from "../../config/env.js";
import { supabase } from "../../config/supabase.js";
import { logRoundEvent } from "./activity-log.service.js";
import type { ModelPerformanceSnapshot } from "../../interfaces/model/federation-round.interface.js";
import type { Database } from "../../types/supabase.js";

type TestPatientRow = Database["public"]["Tables"]["test_patients"]["Row"];

interface PredictResponse {
  prediction: boolean;
  probability: number;
}

// Clamp away from exact 0/1 so a single confident-and-wrong prediction
// doesn't send cross-entropy loss to infinity.
const PROBABILITY_EPSILON = 1e-7;

/**
 * Scores the just-broadcast global model against the held-out `test_patients`
 * table and records the result. Every target node's local ML service file
 * was just overwritten with the same aggregated weights (see
 * applyGlobalModel/_apply_model), so any one synced node's model IS the
 * global model — no separate "global model" file needs to exist.
 */
export async function evaluateGlobalModel(
  roundId: string,
  round: number,
  evaluationNodeId: string,
): Promise<ModelPerformanceSnapshot | null> {
  const testPatients = await getTestPatients();

  if (testPatients.length === 0) {
    logRoundEvent(`Round ${round}: skipping evaluation — test_patients is empty.`);
    console.warn(`Skipping model evaluation for round ${round}: test_patients is empty.`);
    return null;
  }

  logRoundEvent(
    `Round ${round}: evaluating global model against ${testPatients.length} held-out test patient(s)...`,
  );

  let correct = 0;
  let lossSum = 0;
  let scored = 0;

  for (const patient of testPatients) {
    let result: PredictResponse;

    try {
      result = await predict(evaluationNodeId, patient);
    } catch (error) {
      console.error(
        `Prediction failed for test_patient ${patient.test_patient_id} on round ${round}:`,
        error,
      );
      continue;
    }

    const actual = patient.actual_diagnosis;
    const probability = Math.min(
      1 - PROBABILITY_EPSILON,
      Math.max(PROBABILITY_EPSILON, result.probability),
    );

    if (result.prediction === actual) {
      correct += 1;
    }

    lossSum += actual
      ? -Math.log(probability)
      : -Math.log(1 - probability);
    scored += 1;
  }

  if (scored === 0) {
    console.error(`Model evaluation for round ${round} produced no scored predictions.`);
    return null;
  }

  const accuracy = correct / scored;
  const loss = lossSum / scored;
  const evaluatedAt = new Date().toISOString();

  const { error } = await supabase.from("model_performance").upsert(
    {
      round_id: roundId,
      round,
      accuracy,
      loss,
      sample_count: scored,
      evaluated_at: evaluatedAt,
    },
    { onConflict: "round_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  logRoundEvent(
    `Round ${round}: evaluation complete — accuracy ${(accuracy * 100).toFixed(1)}%, loss ${loss.toFixed(4)} (${scored} sample(s)).`,
  );

  return {
    round_id: roundId,
    round,
    accuracy,
    loss,
    sample_count: scored,
    evaluated_at: evaluatedAt,
  };
}

async function predict(nodeId: string, patient: TestPatientRow): Promise<PredictResponse> {
  const response = await fetch(`${env.federatedUrl}/federation/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      nodeId,
      age: patient.age,
      sex: patient.sex,
      symptoms: patient.symptoms,
      health_conditions: patient.health_conditions,
    }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status} for prediction.`);
  }

  return response.json() as Promise<PredictResponse>;
}

async function getTestPatients(): Promise<TestPatientRow[]> {
  const { data, error } = await supabase.from("test_patients").select("*");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getModelPerformanceHistory(): Promise<ModelPerformanceSnapshot[]> {
  const { data, error } = await supabase
    .from("model_performance")
    .select("*")
    .order("round", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    round_id: row.round_id,
    round: row.round,
    accuracy: row.accuracy,
    loss: row.loss,
    sample_count: row.sample_count,
    evaluated_at: row.evaluated_at,
  }));
}
