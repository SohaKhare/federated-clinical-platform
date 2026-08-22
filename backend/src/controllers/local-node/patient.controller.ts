import type { Request, Response } from "express";

import {
  createPatient as createPatientRecord,
  getPatients as getPatientRecords,
} from "../../services/local-node-service/patient.service.js";
import type { CreatePatientInput } from "../../interfaces/model/patient.interface.js";


export async function createPatient(req: Request, res: Response) {
  if (!isCreatePatientInput(req.body)) {
    return res.status(400).json({
      message:
        "Invalid patient. Required fields: name, age, sex, symptoms, diagnosed_diseases, and health_conditions.",
    });
  }

  try {
    const patient = await createPatientRecord(req.body);

    return res.status(201).json({ patient });
  } catch (error) {
    console.error("Patient creation error:", error);

    return res.status(500).json({
      message: "Unable to create patient.",
    });
  }
}

export async function getPatients(_req: Request, res: Response) {
  try {
    const patients = await getPatientRecords();

    return res.json({ patients });
  } catch (error) {
    console.error("Patient fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch patients.",
    });
  }
}

export async function getPatientById(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const patients = await getPatientRecords();
    const patient = patients.find((p) => p.patient_id === id);

    if (!patient) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    return res.json({ patient });
  } catch (error) {
    console.error("Patient fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch patient.",
    });
  }
}

function isCreatePatientInput(value: unknown): value is CreatePatientInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const patient = value as Record<string, unknown>;

  return (
    typeof patient.name === "string" &&
    typeof patient.age === "number" &&
    Number.isInteger(patient.age) &&
    patient.age >= 0 &&
    typeof patient.sex === "string" &&
    Array.isArray(patient.symptoms) &&
    patient.symptoms.every((symptom) => typeof symptom === "string") &&
    Array.isArray(patient.diagnosed_diseases) &&
    patient.diagnosed_diseases.every((disease) => typeof disease === "string") &&
    typeof patient.health_conditions === "object" &&
    patient.health_conditions !== null &&
    !Array.isArray(patient.health_conditions)
  );
}
