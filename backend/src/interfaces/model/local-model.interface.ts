import type { LogDirection, LogStatus } from "./log.interface.js";

export const LOCAL_MODEL_STATUSES = [
  "untrained",
  "training",
  "ready",
  "failed",
] as const;

export type LocalModelStatus = (typeof LOCAL_MODEL_STATUSES)[number];

export interface LocalModelInfo {
  model_version: string | null;
  status: LocalModelStatus;
  last_trained_at: string | null;
  sample_count: number | null;
  latest_round: number | null;
}

export interface LocalModelRoundMetrics {
  round: number;
  direction: LogDirection;
  status: LogStatus;
  num_examples: number | null;
  train_loss: number | null;
  train_accuracy: number | null;
  eval_loss: number | null;
  eval_accuracy: number | null;
  recorded_at: string;
}

export interface LocalModelMetrics {
  latest_round: number | null;
  accuracy: number | null;
  loss: number | null;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  rounds: LocalModelRoundMetrics[];
}
