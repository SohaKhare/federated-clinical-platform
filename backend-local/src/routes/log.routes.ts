import { Router } from "express";

import { getLogs } from "../controllers/local-node/log.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth);

router.get("/", getLogs);

export default router;
