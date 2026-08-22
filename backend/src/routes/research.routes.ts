import { Router } from "express";

import {
  getResearchSummary,
  getResearchInsights,
} from "../controllers/local-node/research.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/summary", getResearchSummary);

router.get("/insights", getResearchInsights);

export default router;
