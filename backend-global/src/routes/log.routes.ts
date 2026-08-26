import { Router } from "express";

import {
  getAllLogs,
  getNodeLogs,
  getRoundLogs,
} from "../controllers/global-node/log.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("global"));

router.get("/", getAllLogs);

router.get("/round/:roundId", getRoundLogs);

router.get("/:nodeId", getNodeLogs);

export default router;
