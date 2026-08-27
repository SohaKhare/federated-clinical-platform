import type { RiskBand } from "../interfaces/model/prediction.interface.js";

/**
 * Maps a model probability onto a clinical risk band and a suggested triage
 * action, per condition. These are deliberately config, not model output:
 * thresholds and wording are a clinical/product call and must be tunable
 * without retraining. `_default` covers any condition a future multi-disease
 * model emits that we haven't tuned by hand yet.
 *
 * `cutoffs` are the exclusive upper bounds for the lower bands, in order:
 * probability < cutoffs[0] → low, < cutoffs[1] → moderate, else → high.
 */
interface BandConfig {
  cutoffs: [number, number];
  triage: Record<RiskBand, string>;
}

const DEFAULT_BANDS: BandConfig = {
  cutoffs: [0.33, 0.66],
  triage: {
    low: "Routine follow-up; no immediate action indicated.",
    moderate: "Schedule review; monitor and reassess at next visit.",
    high: "Escalate for clinician review promptly.",
  },
};

const RISK_BANDS: Record<string, BandConfig> = {
  _default: DEFAULT_BANDS,
  heart_disease: {
    cutoffs: [0.33, 0.66],
    triage: {
      low: "Routine cardiovascular follow-up; reinforce lifestyle measures.",
      moderate: "Order ECG/lipids and schedule a cardiology review this week.",
      high: "Refer to cardiology within 24 hours; consider urgent workup.",
    },
  },
};

export function classifyRisk(
  condition: string,
  probability: number,
): { band: RiskBand; triage_action: string } {
  const config = RISK_BANDS[condition] ?? DEFAULT_BANDS;
  const [lowMax, moderateMax] = config.cutoffs;

  const band: RiskBand =
    probability < lowMax ? "low" : probability < moderateMax ? "moderate" : "high";

  return { band, triage_action: config.triage[band] };
}
