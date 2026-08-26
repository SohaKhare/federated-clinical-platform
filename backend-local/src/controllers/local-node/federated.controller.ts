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

  if (!storagePath) {
    return res.status(400).json({ message: "storage_path is required." });
  }

  try {
    await applyGlobalModel(storagePath);

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
 * so it takes an explicit nodeId in the body instead of a session.
 */
export async function handleStartTrainingRemote(req: Request, res: Response) {
  const roundId = typeof req.params.roundId === "string" ? req.params.roundId : undefined;
  const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId : undefined;
  const round = req.body?.round;

  if (!roundId || !nodeId || typeof round !== "number") {
    return res.status(400).json({ message: "roundId, nodeId, and round are required." });
  }

  try {
    const result = await startLocalTraining(nodeId, roundId, round, {
      ...(req.body?.config !== undefined ? { config: req.body.config } : {}),
    });

    return res.status(202).json(result);
  } catch (error) {
    console.error("Remote training start error:", error);

    return res.status(502).json({ message: "Unable to reach this node's ML service." });
  }
}
