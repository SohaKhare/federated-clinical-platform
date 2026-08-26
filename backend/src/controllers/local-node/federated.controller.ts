import type { Request, Response } from "express";

import { getNodeStatus } from "../../services/global-node-service/node.service.js";
import { applyGlobalModel } from "../../services/local-node-service/ml.service.js";

/**
 * "My own federation status" for the authenticated hospital — reuses the
 * same lookup the global node uses to check on any node, just always scoped
 * to the caller's own userId.
 */
export async function getFederatedStatus(req: Request, res: Response) {
  try {
    const status = await getNodeStatus(req.session.user!.userId);

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
