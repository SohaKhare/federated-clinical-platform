import { Router } from "express";

import {
  createPatient,
  getPatients,
} from "../controllers/local-node/patient.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/", getPatients);

router.post("/", createPatient);

export default router;