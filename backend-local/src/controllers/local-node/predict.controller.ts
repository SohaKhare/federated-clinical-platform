import type { Request, Response } from "express";
import { predictLocalPatient } from "../../services/local-node-service/ml.service.js";

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
