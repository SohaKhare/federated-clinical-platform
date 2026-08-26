import type { Request, Response } from "express";

import { getNodeStatus } from "../../services/local-node-service/node.service.js";
import {
  applyGlobalModel,
  reportTrainingResult,
  startLocalTraining,
} from "../../services/local-node-service/ml.service.js";

/**
 * "My own federation status" for the authenticated hospital — reuses the
 * same lookup the global node uses to check on any node, just always scoped
 * to the caller's own userId.
 */
export async function getFederatedStatus(req: Request, res: Response) {
  try {
    const status = await getNodeStatus(req.user!.userId);

    if (!status) {
      return res.status(404).json({
        message: "Hospital profile not found. Complete onboarding first.",
      });
    }

    return res.json(status);
  } catch (error) {
    console.error("Federated status fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch federated status." });
  }
}

/**
 * The global node pushes just a storage path once a round's aggregation is
 * done — this node fetches the actual model itself and applies it.
 */
export async function handleModelReady(req: Request, res: Response) {
  const storagePath =
    typeof req.body?.storage_path === "string" ? req.body.storage_path : undefined;
  const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId : undefined;

  if (!storagePath || !nodeId) {
    return res.status(400).json({ message: "storage_path and nodeId are required." });
  }

  try {
    await applyGlobalModel(storagePath, nodeId);

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Failed to apply global model:", error);

    return res.status(502).json({ message: "Unable to apply the global model." });
  }
}

/**
 * The co-located ML service's own /federation/runs callback lands here —
 * see reportTrainingResult() for why (it needs local disk access global doesn't have).
 */
export async function handleLocalCallback(req: Request, res: Response) {
  const roundId = typeof req.params.roundId === "string" ? req.params.roundId : undefined;
  const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId : undefined;

  if (!roundId || !nodeId) {
    return res.status(400).json({ message: "roundId and nodeId are required." });
  }

  try {
    await reportTrainingResult(roundId, {
      nodeId,
      update: req.body?.update,
      metrics: req.body?.metrics,
    });

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Failed to report training result:", error);

    return res.status(502).json({ message: "Unable to report the training result to global." });
  }
}

/**
 * Global pushes this to kick off a round on this node — machine-to-machine,
 * so it takes explicit nodeIds in the body instead of a session. All target
 * hospitals arrive in ONE request so the co-located ML service runs a single
 * training simulation for the whole group.
 */
export async function handleStartTrainingRemote(req: Request, res: Response) {
  const roundId = typeof req.params.roundId === "string" ? req.params.roundId : undefined;
  const nodeIds = readNodeIds(req.body);
  const round = req.body?.round;

  if (!roundId || !nodeIds || typeof round !== "number") {
    return res.status(400).json({
      message: "roundId, round, and nodeIds (array of node UUIDs) are required.",
    });
  }

  try {
    const result = await startLocalTraining(nodeIds, roundId, round, {
      ...(req.body?.config !== undefined ? { config: req.body.config } : {}),
    });

    return res.status(202).json(result);
  } catch (error) {
    console.error("Remote training start error:", error);

    return res.status(502).json({ message: "Unable to reach this node's ML service." });
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readNodeIds(body: Request["body"]): string[] | null {
  const raw =
    body && typeof body === "object"
      ? Array.isArray((body as Record<string, unknown>).nodeIds)
        ? ((body as Record<string, unknown>).nodeIds as unknown[])
        : typeof (body as Record<string, unknown>).nodeId === "string"
          ? [(body as Record<string, unknown>).nodeId]
          : null
      : null;

  if (!raw) {
    return null;
  }

  const ids: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string" || !UUID_PATTERN.test(item)) {
      return null;
    }

    ids.push(item);
  }

  return ids.length > 0 ? ids : null;
}
