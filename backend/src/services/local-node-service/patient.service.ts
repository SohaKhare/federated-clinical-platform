import type { InputJsonValue, JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma.js";
import type {
  CreatePatientInput,
  Patient,
  UpdatePatientInput,
} from "../../interfaces/model/patient.interface.js";
import type {
  CreatePatientEventInput,
  PatientChangeEventData,
  PatientEvent,
  PatientEventSnapshot,
} from "../../interfaces/model/patient-event.interface.js";

export async function createPatient(
  patient: CreatePatientInput,
  hospitalId: string,
): Promise<Patient> {
  const createdPatient = await prisma.patient.create({
    data: {
      hospitalId,
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
      symptoms: patient.symptoms,
      diagnosedDiseases: patient.diagnosed_diseases,
      healthConditions: patient.health_conditions as InputJsonValue,
    },
  });

  return toPatient(createdPatient);
}

export async function getPatients(hospitalId: string): Promise<Patient[]> {
  const patients = await prisma.patient.findMany({
    where: { hospitalId },
    orderBy: { updatedAt: "desc" },
  });

  return patients.map(toPatient);
}

export async function getPatientById(
  patientId: string,
): Promise<Patient | null> {
  const patient = await prisma.patient.findUnique({
    where: { patientId },
  });

  return patient ? toPatient(patient) : null;
}

export async function updatePatient(
  patientId: string,
  input: UpdatePatientInput,
): Promise<Patient | null> {
  const updatedPatient = await prisma.$transaction(async (transaction) => {
    const existingPatient = await transaction.patient.findUnique({
      where: { patientId },
    });

    if (!existingPatient) {
      return null;
    }

    const previous = toSnapshot(toPatient(existingPatient));
    const patient = await transaction.patient.update({
      where: { patientId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.age !== undefined ? { age: input.age } : {}),
        ...(input.sex !== undefined ? { sex: input.sex } : {}),
        ...(input.symptoms !== undefined ? { symptoms: input.symptoms } : {}),
        ...(input.diagnosed_diseases !== undefined
          ? { diagnosedDiseases: input.diagnosed_diseases }
          : {}),
        ...(input.health_conditions !== undefined
          ? { healthConditions: input.health_conditions as InputJsonValue }
          : {}),
      },
    });
    const current = toSnapshot(toPatient(patient));

    // Stack up every prior snapshot: the most recent one goes on top,
    // ahead of whatever the last patient_updated event had already stacked.
    const lastUpdateEvent = await transaction.patientEvent.findFirst({
      where: { patientId, eventType: "patient_updated" },
      orderBy: { occurredAt: "desc" },
    });

    const priorSnapshots = getPreviousSnapshots(lastUpdateEvent?.eventData);

    const eventData: PatientChangeEventData = {
      current,
      previous_snapshots: [previous, ...priorSnapshots],
    };

    await transaction.patientEvent.create({
      data: {
        patientId,
        eventType: "patient_updated",
        eventData: eventData as unknown as InputJsonValue,
      },
    });

    return patient;
  });

  return updatedPatient ? toPatient(updatedPatient) : null;
}

export async function getPatientEvents(
  patientId: string,
): Promise<PatientEvent[]> {
  const events = await prisma.patientEvent.findMany({
    where: { patientId },
    orderBy: { occurredAt: "asc" },
  });

  return events.map(toPatientEvent);
}

export async function addPatientEvent(
  patientId: string,
  event: CreatePatientEventInput,
): Promise<PatientEvent> {
  const createdEvent = await prisma.patientEvent.create({
    data: {
      patientId,
      eventType: event.eventType,
      eventData: event.eventData as InputJsonValue,
      ...(event.occurredAt ? { occurredAt: new Date(event.occurredAt) } : {}),
    },
  });

  return toPatientEvent(createdEvent);
}

function toPatient(patient: {
  patientId: string;
  hospitalId: string;
  name: string;
  age: number;
  sex: string;
  symptoms: string[];
  diagnosedDiseases: string[];
  healthConditions: JsonValue;
  contributedToRound: number | null;
  updatedAt: Date;
  createdAt: Date;
}): Patient {
  return {
    patient_id: patient.patientId,
    hospital_id: patient.hospitalId,
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

function toSnapshot(patient: Patient): PatientEventSnapshot {
  return {
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    symptoms: patient.symptoms,
    diagnosed_diseases: patient.diagnosed_diseases,
    health_conditions: patient.health_conditions,
  };
}

function getPreviousSnapshots(eventData: JsonValue | undefined): PatientEventSnapshot[] {
  if (
    !eventData ||
    typeof eventData !== "object" ||
    Array.isArray(eventData) ||
    !Array.isArray((eventData as { previous_snapshots?: unknown }).previous_snapshots)
  ) {
    return [];
  }

  return (eventData as unknown as PatientChangeEventData).previous_snapshots;
}

function toPatientEvent(event: {
  eventId: string;
  patientId: string;
  eventType: string;
  eventData: JsonValue;
  occurredAt: Date;
  createdAt: Date;
}): PatientEvent {
  return {
    event_id: event.eventId,
    patient_id: event.patientId,
    event_type: event.eventType,
    event_data: event.eventData as PatientEvent["event_data"],
    occurred_at: event.occurredAt.toISOString(),
    created_at: event.createdAt.toISOString(),
  };
}
