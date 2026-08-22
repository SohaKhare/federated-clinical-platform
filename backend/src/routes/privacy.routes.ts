import { Router } from "express";

import { getPrivacyParameters } from "../controllers/local-node/privacy.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/parameters", getPrivacyParameters);

export default router;
