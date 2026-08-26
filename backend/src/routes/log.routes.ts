import { Router } from "express";

import { getLogs } from "../controllers/local-node/log.controller.js";
import {
  getAllLogs,
  getNodeLogs,
  getRoundLogs,
} from "../controllers/global-node/log.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth);

/**
 * Same path, different views depending on who's asking: a local hospital
 * sees only its own logs (local-node/log.controller.ts); the global node
 * sees every hospital's logs at once (global-node/log.controller.ts).
 */
router.get("/", (req, res) => {
  if (req.user!.role === "global") {
    return getAllLogs(req, res);
  }

  return getLogs(req, res);
});

router.get("/round/:roundId", requireRole("global"), getRoundLogs);

router.get("/:nodeId", requireRole("global"), getNodeLogs);

export default router;
