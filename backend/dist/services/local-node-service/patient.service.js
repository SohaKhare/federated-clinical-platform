import { prisma } from "../../config/prisma.js";
const EMPTY_SNAPSHOT = {
    symptoms: [],
    diagnosed_diseases: [],
    health_conditions: {},
};
export async function createPatient(patient, hospitalId) {
    return prisma.$transaction(async (transaction) => {
        const createdPatient = await transaction.patient.create({
            data: {
                hospitalId,
                name: patient.name,
                age: patient.age,
                sex: patient.sex,
            },
        });
        const snapshot = {
            symptoms: patient.symptoms,
            diagnosed_diseases: patient.diagnosed_diseases,
            health_conditions: patient.health_conditions,
        };
        await transaction.patientEvent.create({
            data: {
                patientId: createdPatient.patientId,
                eventType: "patient_created",
                eventData: snapshot,
            },
        });
        return toPatient(createdPatient, snapshot);
    });
}
export async function getPatients(hospitalId) {
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
    const snapshotByPatientId = new Map(latestSnapshotEvents.map((event) => [
        event.patientId,
        toSnapshot(event.eventData),
    ]));
    return patients.map((patient) => toPatient(patient, snapshotByPatientId.get(patient.patientId) ?? EMPTY_SNAPSHOT));
}
export async function getPatientById(patientId) {
    const patient = await prisma.patient.findUnique({
        where: { patientId },
    });
    if (!patient) {
        return null;
    }
    const snapshot = await getLatestSnapshot(patientId, prisma);
    return toPatient(patient, snapshot);
}
export async function updatePatient(patientId, input) {
    const updated = await prisma.$transaction(async (transaction) => {
        const existingPatient = await transaction.patient.findUnique({
            where: { patientId },
        });
        if (!existingPatient) {
            return null;
        }
        const clinicalFieldsChanged = input.symptoms !== undefined ||
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
                    eventData: snapshot,
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
export async function getPatientEvents(patientId) {
    const events = await prisma.patientEvent.findMany({
        where: { patientId },
        orderBy: { occurredAt: "asc" },
    });
    return events.map(toPatientEvent);
}
export async function addPatientEvent(patientId, event) {
    const createdEvent = await prisma.patientEvent.create({
        data: {
            patientId,
            eventType: event.eventType,
            eventData: event.eventData,
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
async function getLatestSnapshot(patientId, client) {
    const event = await client.patientEvent.findFirst({
        where: { patientId, eventType: { in: ["patient_created", "patient_updated"] } },
        orderBy: { occurredAt: "desc" },
    });
    return event ? toSnapshot(event.eventData) : EMPTY_SNAPSHOT;
}
function toSnapshot(eventData) {
    if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
        return EMPTY_SNAPSHOT;
    }
    const data = eventData;
    return {
        symptoms: Array.isArray(data.symptoms) ? data.symptoms : [],
        diagnosed_diseases: Array.isArray(data.diagnosed_diseases)
            ? data.diagnosed_diseases
            : [],
        health_conditions: typeof data.health_conditions === "object" &&
            data.health_conditions !== null &&
            !Array.isArray(data.health_conditions)
            ? data.health_conditions
            : {},
    };
}
function toPatient(patient, snapshot) {
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
function toPatientEvent(event) {
    return {
        event_id: event.eventId,
        patient_id: event.patientId,
        event_type: event.eventType,
        event_data: event.eventData,
        occurred_at: event.occurredAt.toISOString(),
        created_at: event.createdAt.toISOString(),
    };
}
//# sourceMappingURL=patient.service.js.map