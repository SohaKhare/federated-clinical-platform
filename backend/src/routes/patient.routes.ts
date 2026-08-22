import { Router } from "express";

import {
  createPatient,
  getPatients,
  getPatientById,
  getPatientEvents,
  addPatientEvent,
  updatePatient,
  getPresentationBatch,
} from "../controllers/local-node/patient.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/", getPatients);

router.get("/presentation-batch", getPresentationBatch);

router.post("/", createPatient);

router.get("/:id/events", getPatientEvents);

router.post("/:id/events", addPatientEvent);

router.patch("/:id", updatePatient);

router.get("/:id", getPatientById);

export default router;
