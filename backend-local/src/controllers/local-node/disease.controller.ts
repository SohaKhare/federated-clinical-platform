import type { Request, Response } from "express";

import {
  addFutureBatch,
  getDiseaseMetrics,
  getDiseaseTrends,
  predictDisease,
  retrainDiseaseModel,
} from "../../services/local-node-service/disease.service.js";

/**
 * XGBoost disease prediction — replaces the old heart-disease ClinicalModel
 * predict flow for the new patient_medical_dataset.csv feature set.
 */
export async function predictDiseasePatient(req: Request, res: Response) {
  const { age, gender, previous_diagnosis, medical_conditions, current_symptoms, hospital, location, diagnosis_date } =
    req.body ?? {};

  if (!Number.isInteger(age) || age < 0 || typeof gender !== "string") {
    return res.status(400).json({ message: "age (integer) and gender are required." });
  }

  try {
    const prediction = await predictDisease({
      age,
      gender,
      previous_diagnosis,
      medical_conditions,
      current_symptoms,
      hospital,
      location,
      diagnosis_date,
    });
    return res.json(prediction);
  } catch (error) {
    console.error("Disease prediction error:", error);
    return res.status(502).json({ message: "Unable to reach the disease model." });
  }
}

export async function getMetrics(_req: Request, res: Response) {
  try {
    return res.json(await getDiseaseMetrics());
  } catch (error) {
    console.error("Disease metrics fetch error:", error);
    return res.status(502).json({ message: "Unable to fetch model metrics." });
  }
}

export async function retrain(_req: Request, res: Response) {
  try {
    return res.json(await retrainDiseaseModel());
  } catch (error) {
    console.error("Disease retrain error:", error);
    return res.status(502).json({ message: "Unable to retrain the model." });
  }
}

export async function getTrends(req: Request, res: Response) {
  const granularity = req.query.granularity === "year" ? "year" : "month";
  try {
    return res.json(await getDiseaseTrends(granularity));
  } catch (error) {
    console.error("Disease trends fetch error:", error);
    return res.status(502).json({ message: "Unable to fetch disease trends." });
  }
}

/** Add 10-20 unseen future-pool patients into patients2 with predictions. */
export async function addFuturePatients(req: Request, res: Response) {
  try {
    const patients = await addFutureBatch(req.user!.userId);
    return res.status(201).json({
      hospital_id: req.user!.userId,
      added: patients.length,
      patients,
    });
  } catch (error) {
    console.error("Future batch add error:", error);
    return res.status(502).json({ message: "Unable to load the future patient pool." });
  }
}