import { Router } from "express";

import {
  getModelInfo,
  getModelMetrics,
} from "../controllers/local-node/ml.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/", getModelInfo);
router.get("/metrics", getModelMetrics);

export default router;
