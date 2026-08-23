import { Router } from "express";

import {
  getNode,
  getNodes,
  getNodeHealth,
  getNodesHealth,
  getNodeMetrics,
  getNodeStatus,
} from "../controllers/global-node/node.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("global"));

router.get("/", getNodes);

router.get("/health", getNodesHealth);

router.get("/:id/status", getNodeStatus);

router.get("/:id/health", getNodeHealth);

router.get("/:id/metrics", getNodeMetrics);

router.get("/:id", getNode);

export default router;
