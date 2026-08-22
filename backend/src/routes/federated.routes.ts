import { Router } from "express";

import { getFederatedStatus } from "../controllers/local-node/federated.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/status", getFederatedStatus);

export default router;
