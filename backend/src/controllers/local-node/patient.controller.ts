import type { Request, Response } from "express";

import {
  createPatient as createPatientRecord,
  addPatientEvent as addPatientEventRecord,
  getPatientEvents as getPatientEventsRecords,
  getPatients as getPatientRecords,
  updatePatient as updatePatientRecord,
} from "../../services/local-node-service/patient.service.js";
import type {
  CreatePatientInput,
  UpdatePatientInput,
} from "../../interfaces/model/patient.interface.js";
import type { CreatePatientEventInput } from "../../interfaces/model/patient-event.interface.js";

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

export async function updatePatient(req: Request, res: Response) {
  const { id } = req.params;

  if (typeof id !== "string" || !isUpdatePatientInput(req.body)) {
    return res.status(400).json({ message: "Invalid patient update." });
  }

  try {
    const patient = await updatePatientRecord(id, req.body);

    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    return res.json({ patient });
  } catch (error) {
    console.error("Patient update error:", error);

    return res.status(500).json({ message: "Unable to update patient." });
  }
}

export async function getPatientEvents(req: Request, res: Response) {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({ message: "Invalid patient ID." });
  }

  try {
    const events = await getPatientEventsRecords(id);

    return res.json({ events });
  } catch (error) {
    console.error("Patient events fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch patient events." });
  }
}

export async function addPatientEvent(req: Request, res: Response) {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({ message: "Invalid patient ID." });
  }

  if (!isCreatePatientEventInput(req.body)) {
    return res.status(400).json({
      message: "eventType and eventData are required.",
    });
  }

  try {
    const event = await addPatientEventRecord(id, req.body);

    return res.status(201).json({ event });
  } catch (error) {
    console.error("Patient event creation error:", error);

    return res.status(500).json({ message: "Unable to add patient event." });
  }
}

function isCreatePatientEventInput(
  value: unknown,
): value is CreatePatientEventInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Record<string, unknown>;

  return (
    typeof event.eventType === "string" &&
    event.eventType.trim().length > 0 &&
    typeof event.eventData === "object" &&
    event.eventData !== null &&
    !Array.isArray(event.eventData) &&
    (event.occurredAt === undefined ||
      (typeof event.occurredAt === "string" &&
        !Number.isNaN(Date.parse(event.occurredAt))))
  );
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

function isUpdatePatientInput(value: unknown): value is UpdatePatientInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const patient = value as Record<string, unknown>;
  const fields = Object.keys(patient);
  const allowedFields = [
    "name",
    "age",
    "sex",
    "symptoms",
    "diagnosed_diseases",
    "health_conditions",
  ];

  if (
    fields.length === 0 ||
    fields.some((field) => !allowedFields.includes(field))
  ) {
    return false;
  }

  return (
    (patient.name === undefined ||
      (typeof patient.name === "string" && patient.name.trim().length > 0)) &&
    (patient.age === undefined ||
      (typeof patient.age === "number" &&
        Number.isInteger(patient.age) &&
        patient.age >= 0)) &&
    (patient.sex === undefined || typeof patient.sex === "string") &&
    (patient.symptoms === undefined ||
      (Array.isArray(patient.symptoms) &&
        patient.symptoms.every((symptom) => typeof symptom === "string"))) &&
    (patient.diagnosed_diseases === undefined ||
      (Array.isArray(patient.diagnosed_diseases) &&
        patient.diagnosed_diseases.every((disease) => typeof disease === "string"))) &&
    (patient.health_conditions === undefined ||
      (typeof patient.health_conditions === "object" &&
        patient.health_conditions !== null &&
        !Array.isArray(patient.health_conditions)))
  );
}
