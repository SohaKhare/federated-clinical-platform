import { prisma } from "../../config/prisma.js";
export async function createPatient(patient, hospitalId) {
    const createdPatient = await prisma.patient.create({
        data: {
            hospitalId,
            name: patient.name,
            age: patient.age,
            sex: patient.sex,
            symptoms: patient.symptoms,
            diagnosedDiseases: patient.diagnosed_diseases,
            healthConditions: patient.health_conditions,
        },
    });
    return toPatient(createdPatient);
}
export async function getPatients(hospitalId) {
    const patients = await prisma.patient.findMany({
        where: { hospitalId },
        orderBy: { updatedAt: "desc" },
    });
    return patients.map(toPatient);
}
export async function getPatientById(patientId) {
    const patient = await prisma.patient.findUnique({
        where: { patientId },
    });
    return patient ? toPatient(patient) : null;
}
export async function updatePatient(patientId, input) {
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
                    ? { healthConditions: input.health_conditions }
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
        const eventData = {
            current,
            previous_snapshots: [previous, ...priorSnapshots],
        };
        await transaction.patientEvent.create({
            data: {
                patientId,
                eventType: "patient_updated",
                eventData: eventData,
            },
        });
        return patient;
    });
    return updatedPatient ? toPatient(updatedPatient) : null;
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
function toPatient(patient) {
    return {
        patient_id: patient.patientId,
        hospital_id: patient.hospitalId,
        name: patient.name,
        age: patient.age,
        sex: patient.sex,
        symptoms: patient.symptoms,
        diagnosed_diseases: patient.diagnosedDiseases,
        health_conditions: patient.healthConditions,
        contributed_to_round: patient.contributedToRound,
        updated_at: patient.updatedAt.toISOString(),
        created_at: patient.createdAt.toISOString(),
    };
}
function toSnapshot(patient) {
    return {
        name: patient.name,
        age: patient.age,
        sex: patient.sex,
        symptoms: patient.symptoms,
        diagnosed_diseases: patient.diagnosed_diseases,
        health_conditions: patient.health_conditions,
    };
}
function getPreviousSnapshots(eventData) {
    if (!eventData ||
        typeof eventData !== "object" ||
        Array.isArray(eventData) ||
        !Array.isArray(eventData.previous_snapshots)) {
        return [];
    }
    return eventData.previous_snapshots;
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