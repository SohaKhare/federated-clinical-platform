import { Router } from "express";

import {
  getResearchSummary,
  getResearchInsights,
} from "../controllers/local-node/research.controller.js";
import { getTrends as getDiseaseTrends } from "../controllers/local-node/disease.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/summary", getResearchSummary);

router.get("/insights", getResearchInsights);

// Historical disease counts over time from diagnosis_date — kept separate
// from prediction on purpose.
router.get("/trends", getDiseaseTrends);

export default router;
