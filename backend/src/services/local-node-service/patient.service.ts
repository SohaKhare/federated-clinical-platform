import type { InputJsonValue, JsonValue } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type {
  ClinicalSnapshot,
  CreatePatientInput,
  Patient,
  UpdatePatientInput,
} from "../../interfaces/model/patient.interface.js";
import type {
  CreatePatientEventInput,
  PatientEvent,
} from "../../interfaces/model/patient-event.interface.js";

const EMPTY_SNAPSHOT: ClinicalSnapshot = {
  symptoms: [],
  diagnosed_diseases: [],
  health_conditions: {},
};

export async function createPatient(
  patient: CreatePatientInput,
  hospitalId: string,
): Promise<Patient> {
  return prisma.$transaction(async (transaction) => {
    const createdPatient = await transaction.patient.create({
      data: {
        hospitalId,
        name: patient.name,
        age: patient.age,
        sex: patient.sex,
      },
    });

    const snapshot: ClinicalSnapshot = {
      symptoms: patient.symptoms,
      diagnosed_diseases: patient.diagnosed_diseases,
      health_conditions: patient.health_conditions,
    };

    await transaction.patientEvent.create({
      data: {
        patientId: createdPatient.patientId,
        eventType: "patient_created",
        eventData: snapshot as unknown as InputJsonValue,
      },
    });

    return toPatient(createdPatient, snapshot);
  });
}

export async function getPatients(hospitalId: string): Promise<Patient[]> {
  const patients = await prisma.patient.findMany({
    where: { hospitalId },
    orderBy: { updatedAt: "desc" },
  });

  if (patients.length === 0) {
    return [];
  }

  const latestSnapshotEvents = await prisma.patientEvent.findMany({
    where: {
      patientId: { in: patients.map((patient) => patient.patientId) },
      eventType: { in: ["patient_created", "patient_updated"] },
    },
    orderBy: { occurredAt: "desc" },
    distinct: ["patientId"],
  });

  const snapshotByPatientId = new Map(
    latestSnapshotEvents.map((event) => [
      event.patientId,
      toSnapshot(event.eventData),
    ]),
  );

  return patients.map((patient) =>
    toPatient(patient, snapshotByPatientId.get(patient.patientId) ?? EMPTY_SNAPSHOT),
  );
}

export async function getPatientById(
  patientId: string,
): Promise<Patient | null> {
  const patient = await prisma.patient.findUnique({
    where: { patientId },
  });

  if (!patient) {
    return null;
  }

  const snapshot = await getLatestSnapshot(patientId, prisma);

  return toPatient(patient, snapshot);
}

export async function updatePatient(
  patientId: string,
  input: UpdatePatientInput,
): Promise<Patient | null> {
  const updated = await prisma.$transaction(async (transaction) => {
    const existingPatient = await transaction.patient.findUnique({
      where: { patientId },
    });

    if (!existingPatient) {
      return null;
    }

    const clinicalFieldsChanged =
      input.symptoms !== undefined ||
      input.diagnosed_diseases !== undefined ||
      input.health_conditions !== undefined;

    let snapshot = await getLatestSnapshot(patientId, transaction);

    if (clinicalFieldsChanged) {
      snapshot = {
        symptoms: input.symptoms ?? snapshot.symptoms,
        diagnosed_diseases: input.diagnosed_diseases ?? snapshot.diagnosed_diseases,
        health_conditions: input.health_conditions ?? snapshot.health_conditions,
      };

      await transaction.patientEvent.create({
        data: {
          patientId,
          eventType: "patient_updated",
          eventData: snapshot as unknown as InputJsonValue,
        },
      });
    }

    const patient = await transaction.patient.update({
      where: { patientId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.age !== undefined ? { age: input.age } : {}),
        ...(input.sex !== undefined ? { sex: input.sex } : {}),
        // Always touch updatedAt, even for a clinical-only change, since it
        // drives which patients are picked up for the next training round.
        updatedAt: new Date(),
      },
    });

    return { patient, snapshot };
  });

  return updated ? toPatient(updated.patient, updated.snapshot) : null;
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

/**
 * Every patient gets a `patient_created` event in the same transaction it's
 * created in, so this should always find one. Falls back to an empty
 * snapshot only if that invariant is ever somehow violated.
 */
async function getLatestSnapshot(
  patientId: string,
  client: Pick<Prisma.TransactionClient, "patientEvent">,
): Promise<ClinicalSnapshot> {
  const event = await client.patientEvent.findFirst({
    where: { patientId, eventType: { in: ["patient_created", "patient_updated"] } },
    orderBy: { occurredAt: "desc" },
  });

  return event ? toSnapshot(event.eventData) : EMPTY_SNAPSHOT;
}

function toSnapshot(eventData: JsonValue): ClinicalSnapshot {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return EMPTY_SNAPSHOT;
  }

  const data = eventData as Record<string, unknown>;

  return {
    symptoms: Array.isArray(data.symptoms) ? (data.symptoms as string[]) : [],
    diagnosed_diseases: Array.isArray(data.diagnosed_diseases)
      ? (data.diagnosed_diseases as string[])
      : [],
    health_conditions:
      typeof data.health_conditions === "object" &&
      data.health_conditions !== null &&
      !Array.isArray(data.health_conditions)
        ? (data.health_conditions as ClinicalSnapshot["health_conditions"])
        : {},
  };
}

function toPatient(
  patient: {
    patientId: string;
    hospitalId: string;
    name: string;
    age: number;
    sex: string;
    contributedToRound: number | null;
    updatedAt: Date;
    createdAt: Date;
  },
  snapshot: ClinicalSnapshot,
): Patient {
  return {
    patient_id: patient.patientId,
    hospital_id: patient.hospitalId,
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    symptoms: snapshot.symptoms,
    diagnosed_diseases: snapshot.diagnosed_diseases,
    health_conditions: snapshot.health_conditions,
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
