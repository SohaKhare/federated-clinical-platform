import { Router } from "express";

import {
  getNode,
  getNodes,
  getNodeMetrics,
  getNodeStatus,
} from "../controllers/global-node/node.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("global"));

router.get("/", getNodes);

router.get("/:id/status", getNodeStatus);

router.get("/:id/metrics", getNodeMetrics);

router.get("/:id", getNode);

export default router;
