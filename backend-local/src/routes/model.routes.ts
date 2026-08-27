import { Router } from "express";

import {
  getModelInfo,
  getModelMetrics,
} from "../controllers/local-node/ml.controller.js";
import {
  getMetrics as getDiseaseMetrics,
  retrain as retrainDiseaseModel,
} from "../controllers/local-node/disease.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/", getModelInfo);
router.get("/metrics", getModelMetrics);

// XGBoost disease classifier (patient_medical_dataset.csv) — held-out
// test-set evaluation metrics and on-demand retraining.
router.get("/disease-metrics", getDiseaseMetrics);
router.post("/disease-retrain", retrainDiseaseModel);

export default router;
