import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { env } from "../../config/env.js";

import {
  createPatient as createPatientRecord,
  addPatientEvent as addPatientEventRecord,
  getPatientById as getPatientByIdRecord,
  getPatientEvents as getPatientEventsRecords,
  getPatients as getPatientRecords,
  updatePatient as updatePatientRecord,
} from "../../services/local-node-service/patient.service.js";
import type {
  CreatePatientInput,
  Patient,
  UpdatePatientInput,
} from "../../interfaces/model/patient.interface.js";
import {
  CLINICAL_SNAPSHOT_EVENT_TYPES,
  type CreatePatientEventInput,
} from "../../interfaces/model/patient-event.interface.js";

const dailyPresentationBatches = new Map<string, Patient[]>();

/**
 * requireAuth + requireRole("local") run before every handler in this file,
 * so req.user is always present here.
 */
function getHospitalId(req: Request): string {
  return req.user!.userId;
}

/**
 * hospital_id is only used internally to enforce ownership.
 * It must never appear in an API response.
 */
function stripHospitalId(patient: Patient): Omit<Patient, "hospital_id"> {
  const { hospital_id: _hospitalId, ...rest } = patient;

  return rest;
}

export async function createPatient(req: Request, res: Response) {
  if (!isCreatePatientInput(req.body)) {
    return res.status(400).json({
      message:
        "Invalid patient. Required fields: name, age, sex, symptoms, diagnosed_diseases, and health_conditions.",
    });
  }

  try {
    const patient = await createPatientRecord(req.body, getHospitalId(req));

    return res.status(201).json({ patient: stripHospitalId(patient) });
  } catch (error) {
    console.error("Patient creation error:", error);

    return res.status(500).json({
      message: "Unable to create patient.",
    });
  }
}

export async function getPatients(req: Request, res: Response) {
  try {
    const patients = await getPatientRecords(getHospitalId(req));

    return res.json({ patients: patients.map(stripHospitalId) });
  } catch (error) {
    console.error("Patient fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch patients.",
    });
  }
}

export async function getPresentationBatch(req: Request, res: Response) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const batchKey = `${getHospitalId(req)}:${day}`;
    const existingBatch = dailyPresentationBatches.get(batchKey);
    if (existingBatch) {
      return res.json({
        hospital_id: getHospitalId(req),
        patients: existingBatch.map(stripHospitalId),
      });
    }

    const poolPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../federated/data/heart_presentation_pool.csv",
    );
    const lines = (await readFile(poolPath, "utf8")).trim().split("\n");
    const headerLine = lines.shift();
    if (!headerLine) {
      throw new Error("Presentation pool is empty.");
    }
    const headers = headerLine.split(",");
    const index = (name: string) => headers.indexOf(name);
    const hospitalIndex = index("hospital_id");
    const rows = lines.map((line) => line.split(","));
    const hospitalId = Math.abs(hashUserId(getHospitalId(req))) % 3;
    const available = rows.filter((row) => Number(row[hospitalIndex]) === hospitalId);
    const batch = available.sort(() => Math.random() - 0.5).slice(0, 10 + Math.floor(Math.random() * 11));

    const patients = await Promise.all(batch.map((row) => createPatientRecord({
      name: `Demo patient ${row[index("_source_row")]}`,
      age: Number(row[index("age")]),
      sex: row[index("sex")] === "1" ? "male" : "female",
      symptoms: [row[index("cp")] === "4" ? "chest pain" : "clinical screening"],
      diagnosed_diseases: Number(row[index("target")]) > 0 ? ["heart disease"] : [],
      health_conditions: {
        source_row: Number(row[index("_source_row")]),
        trestbps: Number(row[index("trestbps")]),
        chol: Number(row[index("chol")]),
        thalach: Number(row[index("thalach")]),
        oldpeak: Number(row[index("oldpeak")]),
        demo_record: true,
      },
    }, getHospitalId(req))));
    dailyPresentationBatches.set(batchKey, patients);

    return res.json({ hospital_id: hospitalId, patients: patients.map(stripHospitalId) });
  } catch (error) {
    console.error("Presentation batch error:", error);
    return res.status(500).json({
      message: "Unable to load presentation patients.",
      ...(env.nodeEnv === "development" && error instanceof Error
        ? { detail: error.message }
        : {}),
    });
  }
}

function hashUserId(value: string): number {
  return [...value].reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0);
}

export async function getPatientById(req: Request, res: Response) {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({ message: "Invalid patient ID." });
  }

  try {
    const patient = await getPatientByIdRecord(id);

    if (!patient || patient.hospital_id !== getHospitalId(req)) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    return res.json({ patient: stripHospitalId(patient) });
  } catch (error) {
    console.error("Patient fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch patient.",
    });
  }
}

export async function updatePatient(req: Request, res: Response) {
  const { id } = req.params as { id: string };

  if (typeof id !== "string" || !isUpdatePatientInput(req.body)) {
    return res.status(400).json({ message: "Invalid patient update." });
  }

  try {
    const existingPatient = await getPatientByIdRecord(id);

    if (!existingPatient || existingPatient.hospital_id !== getHospitalId(req)) {
      return res.status(404).json({ message: "Patient not found." });
    }

    const patient = await updatePatientRecord(id, req.body);

    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    return res.json({ patient: stripHospitalId(patient) });
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
    const patient = await getPatientByIdRecord(id);

    if (!patient || patient.hospital_id !== getHospitalId(req)) {
      return res.status(404).json({ message: "Patient not found." });
    }

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

  if ((CLINICAL_SNAPSHOT_EVENT_TYPES as readonly string[]).includes(req.body.eventType)) {
    return res.status(400).json({
      message: `eventType '${req.body.eventType}' is reserved and cannot be created directly.`,
    });
  }

  try {
    const patient = await getPatientByIdRecord(id);

    if (!patient || patient.hospital_id !== getHospitalId(req)) {
      return res.status(404).json({ message: "Patient not found." });
    }

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
