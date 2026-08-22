import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type {
  CreatePatientInput,
  Patient,
} from "../../interfaces/model/patient.interface.js";

export async function createPatient(
  patient: CreatePatientInput,
): Promise<Patient> {
  const createdPatient = await prisma.patient.create({
    data: {
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
      symptoms: patient.symptoms,
      diagnosedDiseases: patient.diagnosed_diseases,
      healthConditions: patient.health_conditions as Prisma.InputJsonValue,
    },
  });

  return toPatient(createdPatient);
}

export async function getPatients(): Promise<Patient[]> {
  const patients = await prisma.patient.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return patients.map(toPatient);
}

function toPatient(patient: {
  patientId: string;
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosedDiseases: string[];
  healthConditions: Prisma.JsonValue;
  contributedToRound: number | null;
  updatedAt: Date;
  createdAt: Date;
}): Patient {
  return {
    patient_id: patient.patientId,
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    symptoms: patient.symptoms,
    diagnosed_diseases: patient.diagnosedDiseases,
    health_conditions: patient.healthConditions as Patient["health_conditions"],
    contributed_to_round: patient.contributedToRound,
    updated_at: patient.updatedAt.toISOString(),
    created_at: patient.createdAt.toISOString(),
  };
}