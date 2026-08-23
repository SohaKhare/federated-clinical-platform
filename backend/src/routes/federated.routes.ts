import { Router } from "express";

import { getFederatedStatus } from "../controllers/local-node/federated.controller.js";
import { startTraining } from "../controllers/local-node/ml.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/status", requireAuth, requireRole("local"), getFederatedStatus);

router.post(
	"/rounds/:roundId/start-training",
	requireAuth,
	requireRole("local"),
	startTraining,
);

export default router;
