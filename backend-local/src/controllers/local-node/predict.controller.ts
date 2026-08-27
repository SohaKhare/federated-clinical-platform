import type { Request, Response } from "express";
import {
  predictLocalPatient,
  predictPatientConditions,
} from "../../services/local-node-service/ml.service.js";
import {
  getClinicalHistory,
  getPatientById,
} from "../../services/local-node-service/patient.service.js";
import type { HistoryEntry } from "../../interfaces/model/prediction.interface.js";

/**
 * History-aware, multi-condition risk for a saved patient — the clinician's
 * risk card. Loads the patient (ownership-checked) and their full clinical
 * history, then returns per-condition probability, band, triage, and top
 * contributing features.
 */
export async function predictPatientById(req: Request, res: Response) {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({ message: "Invalid patient ID." });
  }

  try {
    const patient = await getPatientById(id);

    if (!patient || patient.hospital_id !== req.user!.userId) {
      return res.status(404).json({ message: "Patient not found." });
    }

    const history = await getClinicalHistory(id);

    const prediction = await predictPatientConditions({
      nodeId: req.user!.userId,
      patientId: id,
      patient: { age: patient.age, sex: patient.sex },
      history: history as HistoryEntry[],
    });

    return res.json(prediction);
  } catch (error) {
    console.error("Patient prediction error:", error);
    return res.status(502).json({ message: "Unable to reach the local model." });
  }
}

export async function predictPatient(req: Request, res: Response) {
  const { age, sex, symptoms, health_conditions } = req.body ?? {};
  if (!Number.isInteger(age) || age < 0 || typeof sex !== "string" || !Array.isArray(symptoms)) {
    return res.status(400).json({ message: "age, sex, and symptoms are required." });
  }

  try {
    const prediction = await predictLocalPatient({
      nodeId: req.user!.userId,
      age,
      sex,
      symptoms,
      health_conditions,
    });
    return res.json(prediction);
  } catch (error) {
    console.error("Patient prediction error:", error);
    return res.status(502).json({ message: "Unable to reach the local model." });
  }
}
