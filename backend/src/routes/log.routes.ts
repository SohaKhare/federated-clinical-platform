import { Router } from "express";

import { getLogs } from "../controllers/local-node/log.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/", getLogs);

export default router;
