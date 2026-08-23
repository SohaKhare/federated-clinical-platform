import type { Request, Response } from "express";

import { getNodeStatus } from "../../services/global-node-service/node.service.js";

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
