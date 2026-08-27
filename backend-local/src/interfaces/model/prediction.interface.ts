/**
 * The per-patient prediction contract returned by
 * POST /local/patients/:id/predict and rendered by the clinician's risk card.
 *
 * The served model owns probabilities, gradient×input feature attribution, and
 * data completeness; the backend maps each probability onto a risk band and a
 * suggested triage action via config (see config/risk-bands.ts), so those stay
 * tunable without retraining the model.
 */

export type RiskBand = "low" | "moderate" | "high";

export interface FeatureContribution {
  /** Raw feature key from the model's schema, e.g. "trestbps". */
  feature: string;
  /** Human-readable feature name, e.g. "Resting blood pressure". */
  label: string;
  /** The patient's value for this feature, formatted for display. */
  value: string;
  /** Signed gradient×input contribution; positive pushes risk up. */
  contribution: number;
  direction: "increases" | "lowers";
}

export interface DataCompleteness {
  /** Inputs sourced from the patient record. */
  provided: number;
  /** Total inputs the model consumes. */
  total: number;
  /** Inputs that fell back to a clinical default. */
  defaulted: string[];
}

export interface ConditionPrediction {
  /** Stable condition key, e.g. "heart_disease". */
  condition: string;
  /** Display name, e.g. "Heart disease". */
  label: string;
  /** Model probability in [0, 1]. */
  probability: number;
  /** Assigned by the backend from `probability` via config. */
  band: RiskBand;
  /** Suggested action for this condition + band, from config. */
  triage_action: string;
  top_features: FeatureContribution[];
  data_completeness: DataCompleteness;
}

export interface HistoryWindow {
  entries: number;
  from: string | null;
  to: string | null;
}

export interface PatientPrediction {
  patient_id: string;
  model_version: string | null;
  regions_trained: number | null;
  history_window: HistoryWindow | null;
  generated_at: string;
  predictions: ConditionPrediction[];
}

/** One timestamped clinical snapshot in a patient's history (oldest→newest). */
export interface HistoryEntry {
  occurred_at: string;
  symptoms: string[];
  diagnosed_diseases: string[];
  health_conditions: Record<string, unknown>;
}

/** Shape the ML bridge returns before the backend attaches band/triage. */
export interface RawConditionPrediction {
  condition: string;
  label: string;
  probability: number;
  top_features: FeatureContribution[];
  data_completeness: DataCompleteness;
}

export interface RawPatientPrediction {
  model_version: string | null;
  regions_trained: number | null;
  history_window: HistoryWindow | null;
  predictions: RawConditionPrediction[];
}
