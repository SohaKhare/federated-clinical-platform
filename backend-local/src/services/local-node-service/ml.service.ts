import { readFile } from "node:fs/promises";

import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";
import { classifyRisk } from "../../config/risk-bands.js";
import { getLastCompletedRoundTimestamp } from "./log.service.js";
import { getPatients } from "./patient.service.js";
import type {
  HistoryEntry,
  PatientPrediction,
  RawPatientPrediction,
} from "../../interfaces/model/prediction.interface.js";
import type { LocalTrainingStartInput } from "../../interfaces/model/federation-round.interface.js";
import type {
  LocalModelInfo,
  LocalModelMetrics,
  LocalModelRoundMetrics,
  LocalModelStatus,
} from "../../interfaces/model/local-model.interface.js";
import type { LogDirection, LogStatus } from "../../interfaces/model/log.interface.js";
import type { Database } from "../../types/supabase.js";

type LogRow = Database["public"]["Tables"]["logs"]["Row"];

export async function startLocalTraining(
  nodeIds: string[],
  roundId: string,
  round: number,
  input: LocalTrainingStartInput = {},
) {
  // Each hospital's patients created/updated since its last completed round
  // — what the Python side blends into that hospital's training partition.
  const patientsByNode = await Promise.all(
    nodeIds.map(async (nodeId) => {
      const since = await getLastCompletedRoundTimestamp(nodeId);
      const patients = await getPatients(nodeId, since ?? undefined);

      return { node_id: nodeId, patients };
    }),
  );

  const response = await fetch(`${env.federatedUrl}/federation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      // The Python service trains one Flower client per entry and calls back
      // once per node_id after aggregating — one batched request for the
      // whole round instead of N concurrent runs racing on the same files.
      node_ids: nodeIds,
      round_id: roundId,
      round,
      // Points at this node's own backend (co-located with this ML
      // service) — global can't read a file path off this machine's disk,
      // so results get relayed through here first. See reportTrainingResult.
      callback_url: `${env.backendUrl}/local/federated/rounds/${roundId}/local-callback`,
      patients_by_node: patientsByNode,
      config: input.config ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status}.`);
  }

  return response.json();
}

/**
 * The ML service's own callback lands here first (co-located, same
 * filesystem) — read the .pt it wrote off disk, upload it to Supabase
 * ourselves, then forward only the small resulting storage_path to global.
 * Global never needs to touch this machine's filesystem.
 */
export async function reportTrainingResult(
  roundId: string,
  body: { nodeId: string; update?: unknown; metrics?: Record<string, unknown> },
): Promise<void> {
  const modelFile =
    body.update && typeof body.update === "object" && "model_file" in body.update
      ? (body.update as Record<string, unknown>).model_file
      : undefined;

  let storagePath: string | null = null;

  if (typeof modelFile === "string" && modelFile) {
    const buffer = await readFile(modelFile);
    const path = `${roundId}/${body.nodeId}.pt`;

    const { data, error } = await supabase.storage.from("models").upload(path, buffer, {
      contentType: "application/octet-stream",
      upsert: true,
    });

    if (error) {
      throw new Error(error.message);
    }

    storagePath = data.path;
  }

  const response = await fetch(`${env.globalNodeUrl}/global/api/federated/rounds/${roundId}/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      nodeId: body.nodeId,
      metrics: body.metrics ?? null,
      ...(storagePath ? { storage_path: storagePath } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Global node returned status ${response.status} for training callback.`);
  }
}

/**
 * The global node only pushes a storage path, not bytes — this node fetches
 * the aggregated model from Supabase itself, then hands the raw bytes to its
 * own local ML service (same machine/LAN) so it becomes the active model.
 */
export async function applyGlobalModel(storagePath: string, nodeId: string): Promise<void> {
  const { data, error } = await supabase.storage.from("models").download(storagePath);

  if (error) {
    throw new Error(error.message);
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  const response = await fetch(`${env.federatedUrl}/federation/apply-model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Federation-Key": env.federationSharedSecret,
      "X-Node-Id": nodeId,
    },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status} for model update.`);
  }
}

export async function predictLocalPatient(input: {
  nodeId: string;
  age: number;
  sex: string;
  symptoms: string[];
  health_conditions?: Record<string, unknown>;
}) {
  const response = await fetch(`${env.federatedUrl}/federation/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(`ML service returned status ${response.status}.`);
  return response.json();
}

/**
 * History-aware, multi-condition prediction for the clinician's risk card.
 * Sends the patient's full ordered clinical history to the ML bridge, then
 * layers on the risk band + triage action (config, not model output) for each
 * condition the model returned.
 */
export async function predictPatientConditions(input: {
  nodeId: string;
  patientId: string;
  patient: { age: number; sex: string };
  history: HistoryEntry[];
}): Promise<PatientPrediction> {
  const response = await fetch(`${env.federatedUrl}/federation/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      nodeId: input.nodeId,
      patient: input.patient,
      history: input.history,
    }),
  });

  if (!response.ok) throw new Error(`ML service returned status ${response.status}.`);

  const raw = (await response.json()) as RawPatientPrediction;

  return {
    patient_id: input.patientId,
    model_version: raw.model_version ?? null,
    model_source: raw.model_source ?? "baseline",
    regions_trained: raw.regions_trained ?? null,
    history_window: raw.history_window ?? null,
    generated_at: new Date().toISOString(),
    predictions: (raw.predictions ?? []).map((prediction) => ({
      ...prediction,
      ...classifyRisk(prediction.condition, prediction.probability),
    })),
  };
}

/** Log statuses that mean a training run is still in flight. */
const IN_FLIGHT_STATUSES = new Set<string>(["pending", "preparing", "submitted"]);
/** Statuses proving an exchange for a round actually completed. */
const COMPLETED_STATUSES = new Set<string>(["confirmed", "received", "applied", "synced"]);

/**
 * Local model state derived from this hospital's own logs — no models table
 * exists yet, and per API.md the federated bridge writes per-round metrics
 * into `logs`. Fields stay honestly null until real rounds report data.
 */
export async function getLocalModelInfo(nodeId: string): Promise<LocalModelInfo> {
  const [latestLog, latestTrainedLog, latestRoundRow] = await Promise.all([
    fetchLatestLog(nodeId),
    findLatestTrainedLog(nodeId),
    fetchLatestRound(nodeId),
  ]);

  return {
    model_version: await deriveModelVersion(nodeId),
    status: deriveStatus(latestLog?.status ?? null),
    last_trained_at: latestTrainedLog?.timestamp ?? null,
    sample_count: readNumber(latestTrainedLog?.metadata, "num_examples"),
    latest_round: latestRoundRow,
  };
}

export async function getLocalModelMetrics(nodeId: string): Promise<LocalModelMetrics> {
  const [logs, latestTrainedLog] = await Promise.all([
    fetchAllLogs(nodeId),
    findLatestTrainedLog(nodeId),
  ]);

  const rounds: LocalModelRoundMetrics[] = logs.map((log) => ({
    round: log.round,
    direction: log.direction as LogDirection,
    status: log.status as LogStatus,
    num_examples: readNumber(log.metadata, "num_examples"),
    train_loss: readNumber(log.metadata, "train_loss"),
    train_accuracy: readNumber(log.metadata, "train_accuracy"),
    eval_loss: readNumber(log.metadata, "eval_loss"),
    eval_accuracy: readNumber(log.metadata, "eval_accuracy"),
    recorded_at: log.timestamp,
  }));

  // Latest evaluation wins; fall back to the newest trained log so a node
  // that only ever reported train metrics still shows something real.
  const latestEval = [...rounds].reverse().find((entry) => entry.eval_accuracy !== null);
  const summarySource = latestEval ?? rounds.at(-1);

  return {
    latest_round: summarySource?.round ?? null,
    accuracy: summarySource?.eval_accuracy ?? null,
    loss: summarySource?.eval_loss ?? null,
    precision: readNumber(latestTrainedLog?.metadata, "precision"),
    recall: readNumber(latestTrainedLog?.metadata, "recall"),
    f1_score:
      readNumber(latestTrainedLog?.metadata, "f1_score") ??
      readNumber(latestTrainedLog?.metadata, "f1"),
    rounds,
  };
}

async function fetchLatestLog(nodeId: string): Promise<LogRow | null> {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("node_id", nodeId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function fetchLatestRound(nodeId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("logs")
    .select("round")
    .eq("node_id", nodeId)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.round ?? null;
}

async function fetchAllLogs(nodeId: string): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("node_id", nodeId)
    .order("round", { ascending: true })
    .order("timestamp", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function findLatestTrainedLog(nodeId: string): Promise<LogRow | null> {
  // A log only proves local training happened if its metadata carries
  // metrics — plain round bookkeeping entries carry none.
  const { data: candidates, error } = await supabase
    .from("logs")
    .select("*")
    .eq("node_id", nodeId)
    .order("round", { ascending: false })
    .order("timestamp", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return (candidates ?? []).find((log) => hasTrainingMetrics(log.metadata)) ?? null;
}

async function deriveModelVersion(nodeId: string): Promise<string | null> {
  const { data: completed, error } = await supabase
    .from("logs")
    .select("*")
    .eq("node_id", nodeId)
    .in("status", [...COMPLETED_STATUSES])
    .order("round", { ascending: false })
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return completed ? `v${completed.round}` : null;
}

function deriveStatus(latestStatus: string | null): LocalModelStatus {
  if (latestStatus === null) {
    return "untrained";
  }

  if (IN_FLIGHT_STATUSES.has(latestStatus)) {
    return "training";
  }

  return latestStatus === "failed" ? "failed" : "ready";
}

/**
 * Metric numbers have been written in three shapes over time: flat on
 * metadata (API.md bridge contract), nested under `metrics` (privacy
 * service), or under `payload.metrics` (round callbacks). Try each.
 */
function readNumber(metadata: unknown, key: string): number | null {
  for (const source of metricSources(metadata)) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function hasTrainingMetrics(metadata: unknown): boolean {
  return ["train_loss", "train_accuracy", "eval_loss", "eval_accuracy"].some(
    (key) => readNumber(metadata, key) !== null,
  );
}

function metricSources(metadata: unknown): Array<Record<string, unknown>> {
  const sources: Array<Record<string, unknown>> = [];
  const root = asRecord(metadata);

  if (root) {
    sources.push(root);

    for (const key of ["metrics", "payload"]) {
      const nested = asRecord(root[key]);

      if (nested) {
        sources.push(nested);

        const inner = asRecord(nested.metrics);

        if (inner) {
          sources.push(inner);
        }
      }
    }
  }

  return sources;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

