import { Router } from "express";
import { getPatients } from "../controllers/patients.controller.js";

const router = Router();

router.get("/", getPatients);

export default router;
