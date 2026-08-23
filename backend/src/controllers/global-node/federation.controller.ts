import type { Request, Response } from "express";

import {
  broadcastFederatedWeights,
  recordFederatedCallback,
  startFederatedRound,
  getFederatedRoundSnapshot,
  getFederatedRoundSnapshots,
} from "../../services/global-node-service/federation.service.js";
import type {
  FederatedRoundBroadcastInput,
  FederatedRoundCallbackInput,
  FederatedRoundStartInput,
} from "../../interfaces/model/federation-round.interface.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startFederatedRoundController(
  req: Request,
  res: Response,
) {
  const input = parseStartInput(req.body);

  if (input === null) {
    return res.status(400).json({
      message:
        "Invalid input. targetNodeIds must be an array of valid node UUIDs when provided.",
    });
  }

  try {
    const result = await startFederatedRound(input);

    return res.status(202).json(result);
  } catch (error) {
    return mapFederationError(error, res);
  }
}

export async function getFederatedRoundController(
  req: Request,
  res: Response,
) {
  const { roundId } = req.params;

  if (!isValidUuid(roundId)) {
    return res.status(400).json({ message: "Invalid round ID." });
  }

  const round = await getFederatedRoundSnapshot(roundId);

  if (!round) {
    return res.status(404).json({ message: "Round not found." });
  }

  return res.json({ round });
}

export async function getFederatedRoundsController(
  _req: Request,
  res: Response,
) {
  try {
    const rounds = await getFederatedRoundSnapshots();

    return res.json({ rounds });
  } catch (error) {
    console.error("Federated rounds fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch federated rounds." });
  }
}

export async function recordFederatedCallbackController(
  req: Request,
  res: Response,
) {
  const { roundId } = req.params;

  if (!isValidUuid(roundId)) {
    return res.status(400).json({ message: "Invalid round ID." });
  }

  const input = parseCallbackInput(req);

  if (input === null) {
    return res.status(400).json({
      message:
        "Invalid input. nodeId must match the authenticated local node, and update/metrics/notes must be valid JSON values when provided.",
    });
  }

  try {
    const result = await recordFederatedCallback(roundId, input);

    return res.json(result);
  } catch (error) {
    return mapFederationError(error, res);
  }
}

export async function broadcastFederatedWeightsController(
  req: Request,
  res: Response,
) {
  const { roundId } = req.params;

  if (!isValidUuid(roundId)) {
    return res.status(400).json({ message: "Invalid round ID." });
  }

  const input = parseBroadcastInput(req.body);

  if (input === null) {
    return res.status(400).json({
      message:
        "Invalid input. nodeIds must be an array of valid node UUIDs when provided.",
    });
  }

  try {
    const result = await broadcastFederatedWeights(roundId, input);

    return res.status(202).json(result);
  } catch (error) {
    return mapFederationError(error, res);
  }
}

function parseStartInput(body: Request["body"]): FederatedRoundStartInput | null {
  if (!body || typeof body !== "object") {
    return {};
  }

  const targetNodeIds = readUuidArray(
    (body as Record<string, unknown>).targetNodeIds,
  );

  if (targetNodeIds === null) {
    return null;
  }

  return targetNodeIds ? { targetNodeIds } : {};
}

function parseCallbackInput(req: Request): FederatedRoundCallbackInput | null {
  const body = req.body;

  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const nodeId = typeof record.nodeId === "string" ? record.nodeId : undefined;

  if (!nodeId || !isValidUuid(nodeId)) {
    return null;
  }

  return {
    nodeId,
    ...(record.update !== undefined ? { update: record.update } : {}),
    ...(record.metrics !== undefined
      ? { metrics: record.metrics as Record<string, unknown> }
      : {}),
    ...(typeof record.notes === "string" ? { notes: record.notes } : {}),
  };
}

function parseBroadcastInput(
  body: Request["body"],
): FederatedRoundBroadcastInput | null {
  if (!body || typeof body !== "object") {
    return {};
  }

  const record = body as Record<string, unknown>;
  const nodeIds = readUuidArray(record.nodeIds);

  if (nodeIds === null) {
    return null;
  }

  return {
    ...(nodeIds ? { nodeIds } : {}),
    ...(record.weights !== undefined ? { weights: record.weights } : {}),
    ...(typeof record.notes === "string" ? { notes: record.notes } : {}),
  };
}

function readUuidArray(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];

  for (const item of value) {
    if (typeof item !== "string" || !isValidUuid(item)) {
      return null;
    }

    ids.push(item);
  }

  return ids;
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function mapFederationError(error: unknown, res: Response) {
  const message =
    error instanceof Error ? error.message : "Unexpected federation error.";

  if (message === "Round not found.") {
    return res.status(404).json({ message });
  }

  if (
    message === "This node is not part of the round." ||
    message === "No participating nodes have completed training yet."
  ) {
    return res.status(409).json({ message });
  }

  if (message.startsWith("Unknown local node(s):")) {
    return res.status(404).json({ message });
  }

  console.error("Federation operation error:", error);

  return res
    .status(500)
    .json({ message: "Unable to process federated round request." });
}
