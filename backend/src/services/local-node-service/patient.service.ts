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
} from "../../interfaces/model/patient-event.interface.js";

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
      healthConditions: patient.health_conditions as InputJsonValue,
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

    const previous = toPatient(existingPatient);
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
    const current = toPatient(patient);

    const changes = Object.fromEntries(
      Object.entries({
        name: [previous.name, current.name],
        age: [previous.age, current.age],
        sex: [previous.sex, current.sex],
        symptoms: [previous.symptoms, current.symptoms],
        diagnosed_diseases: [
          previous.diagnosed_diseases,
          current.diagnosed_diseases,
        ],
        health_conditions: [
          previous.health_conditions,
          current.health_conditions,
        ],
      })
        .filter(([, [oldValue, newValue]]) =>
          JSON.stringify(oldValue) !== JSON.stringify(newValue),
        )
        .map(([field, [oldValue, newValue]]) => [
          field,
          { previous: oldValue, current: newValue },
        ]),
    );

    const eventData: PatientChangeEventData = {
      previous,
      current,
      changes,
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