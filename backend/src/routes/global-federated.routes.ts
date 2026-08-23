import { Router } from "express";

import {
  broadcastFederatedWeightsController,
  recordFederatedCallbackController,
  startFederatedRoundController,
  getFederatedRoundController,
} from "../controllers/global-node/federation.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireFederationKey } from "../middleware/federation.middleware.js";

const router = Router();

router.post(
  "/rounds/start",
  requireAuth,
  requireRole("global"),
  startFederatedRoundController,
);

router.get(
  "/rounds/:roundId",
  requireAuth,
  requireRole("global"),
  getFederatedRoundController,
);

router.post(
  "/rounds/:roundId/callback",
  requireFederationKey,
  recordFederatedCallbackController,
);

router.post(
  "/rounds/:roundId/broadcast",
  requireAuth,
  requireRole("global"),
  broadcastFederatedWeightsController,
);

export default router;
