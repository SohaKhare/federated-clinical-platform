import type { JsonValue } from "@prisma/client/runtime/library";

import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import type { LocalTrainingStartInput } from "../../interfaces/model/federation-round.interface.js";
import type {
  LocalModelInfo,
  LocalModelMetrics,
  LocalModelRoundMetrics,
  LocalModelStatus,
} from "../../interfaces/model/local-model.interface.js";
import type { LogDirection, LogStatus } from "../../interfaces/model/log.interface.js";

export async function startLocalTraining(
  nodeId: string,
  roundId: string,
  round: number,
  input: LocalTrainingStartInput = {},
) {
  const response = await fetch(`${env.federatedUrl}/federation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      node_id: nodeId,
      round_id: roundId,
      round,
      callback_url: `${env.backendUrl}/api/federated/rounds/${roundId}/callback`,
      config: input.config ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status}.`);
  }

  return response.json();
}

export async function startFederatedTraining(input: {
  roundId: string;
  round: number;
  nodeIds: string[];
}) {
  const response = await fetch(`${env.federatedUrl}/federation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Federation-Key": env.federationSharedSecret,
    },
    body: JSON.stringify({
      round_id: input.roundId,
      round: input.round,
      node_ids: input.nodeIds,
      callback_url: `${env.backendUrl}/api/federated/rounds/${input.roundId}/callback`,
      config: { "num-server-rounds": 3 },
    }),
  });

  if (!response.ok) {
    throw new Error(`ML service returned status ${response.status}.`);
  }

  return response.json();
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
  const [latestLog, latestTrainedLog, roundAggregate] = await Promise.all([
    prisma.log.findFirst({
      where: { nodeId },
      orderBy: [{ round: "desc" }, { timestamp: "desc" }],
    }),
    findLatestTrainedLog(nodeId),
    prisma.log.aggregate({ where: { nodeId }, _max: { round: true } }),
  ]);

  return {
    model_version: await deriveModelVersion(nodeId),
    status: deriveStatus(latestLog?.status ?? null),
    last_trained_at: toIsoOrNull(latestTrainedLog?.timestamp ?? null),
    sample_count: readNumber(latestTrainedLog?.metadata, "num_examples"),
    latest_round: roundAggregate._max.round ?? null,
  };
}

export async function getLocalModelMetrics(nodeId: string): Promise<LocalModelMetrics> {
  const [logs, latestTrainedLog] = await Promise.all([
    prisma.log.findMany({
      where: { nodeId },
      orderBy: [{ round: "asc" }, { timestamp: "asc" }],
    }),
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
    recorded_at: log.timestamp.toISOString(),
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

async function findLatestTrainedLog(nodeId: string) {
  // A log only proves local training happened if its metadata carries
  // metrics — plain round bookkeeping entries carry none.
  const candidates = await prisma.log.findMany({
    where: { nodeId },
    orderBy: [{ round: "desc" }, { timestamp: "desc" }],
    take: 50,
  });

  return candidates.find((log) => hasTrainingMetrics(log.metadata)) ?? null;
}

async function deriveModelVersion(nodeId: string): Promise<string | null> {
  const completed = await prisma.log.findFirst({
    where: { nodeId, status: { in: [...COMPLETED_STATUSES] } },
    orderBy: [{ round: "desc" }, { timestamp: "desc" }],
  });

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
function readNumber(metadata: JsonValue | null | undefined, key: string): number | null {
  for (const source of metricSources(metadata)) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function hasTrainingMetrics(metadata: JsonValue | null | undefined): boolean {
  return ["train_loss", "train_accuracy", "eval_loss", "eval_accuracy"].some(
    (key) => readNumber(metadata, key) !== null,
  );
}

function metricSources(metadata: JsonValue | null | undefined): Array<Record<string, unknown>> {
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

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
