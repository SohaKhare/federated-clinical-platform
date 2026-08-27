import { Router } from "express";

import { streamActivityLogController } from "../controllers/global-node/activity-log.controller.js";

const router = Router();

// No requireAuth/requireRole here on purpose — this feeds the unauthenticated
// frontend /logging page (see activity-log.controller.ts for what's safe
// to expose here).
router.get("/stream", streamActivityLogController);

export default router;
