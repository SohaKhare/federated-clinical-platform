import { Router } from "express";

import {
	getFederatedStatus,
	handleLocalCallback,
	handleModelReady,
	handleStartTrainingRemote,
} from "../controllers/local-node/federated.controller.js";
import { startTraining } from "../controllers/local-node/ml.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireFederationKey } from "../middleware/federation.middleware.js";

const router = Router();

router.get("/status", requireAuth, requireRole("local"), getFederatedStatus);

router.post(
	"/rounds/:roundId/start-training",
	requireAuth,
	requireRole("local"),
	startTraining,
);

// Machine-to-machine: global pushes this to kick off a round on this node.
router.post(
	"/rounds/:roundId/start-training-remote",
	requireFederationKey,
	handleStartTrainingRemote,
);

// The co-located ML service's own callback — see reportTrainingResult().
router.post(
	"/rounds/:roundId/local-callback",
	requireFederationKey,
	handleLocalCallback,
);

router.post(
	"/rounds/:roundId/model-ready",
	requireFederationKey,
	handleModelReady,
);

export default router;
