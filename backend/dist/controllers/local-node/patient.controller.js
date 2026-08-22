import { createPatient as createPatientRecord, addPatientEvent as addPatientEventRecord, getPatientById as getPatientByIdRecord, getPatientEvents as getPatientEventsRecords, getPatients as getPatientRecords, updatePatient as updatePatientRecord, } from "../../services/local-node-service/patient.service.js";
/**
 * requireAuth + requireRole("local") run before every handler in this file,
 * so req.session.user is always present here.
 */
function getHospitalId(req) {
    return req.session.user.userId;
}
/**
 * hospital_id is only used internally to enforce ownership.
 * It must never appear in an API response.
 */
function stripHospitalId(patient) {
    const { hospital_id: _hospitalId, ...rest } = patient;
    return rest;
}
export async function createPatient(req, res) {
    if (!isCreatePatientInput(req.body)) {
        return res.status(400).json({
            message: "Invalid patient. Required fields: name, age, sex, symptoms, diagnosed_diseases, and health_conditions.",
        });
    }
    try {
        const patient = await createPatientRecord(req.body, getHospitalId(req));
        return res.status(201).json({ patient: stripHospitalId(patient) });
    }
    catch (error) {
        console.error("Patient creation error:", error);
        return res.status(500).json({
            message: "Unable to create patient.",
        });
    }
}
export async function getPatients(req, res) {
    try {
        const patients = await getPatientRecords(getHospitalId(req));
        return res.json({ patients: patients.map(stripHospitalId) });
    }
    catch (error) {
        console.error("Patient fetch error:", error);
        return res.status(500).json({
            message: "Unable to fetch patients.",
        });
    }
}
export async function getPatientById(req, res) {
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
    }
    catch (error) {
        console.error("Patient fetch error:", error);
        return res.status(500).json({
            message: "Unable to fetch patient.",
        });
    }
}
export async function updatePatient(req, res) {
    const { id } = req.params;
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
    }
    catch (error) {
        console.error("Patient update error:", error);
        return res.status(500).json({ message: "Unable to update patient." });
    }
}
export async function getPatientEvents(req, res) {
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
    }
    catch (error) {
        console.error("Patient events fetch error:", error);
        return res.status(500).json({ message: "Unable to fetch patient events." });
    }
}
export async function addPatientEvent(req, res) {
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
        const patient = await getPatientByIdRecord(id);
        if (!patient || patient.hospital_id !== getHospitalId(req)) {
            return res.status(404).json({ message: "Patient not found." });
        }
        const event = await addPatientEventRecord(id, req.body);
        return res.status(201).json({ event });
    }
    catch (error) {
        console.error("Patient event creation error:", error);
        return res.status(500).json({ message: "Unable to add patient event." });
    }
}
function isCreatePatientEventInput(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const event = value;
    return (typeof event.eventType === "string" &&
        event.eventType.trim().length > 0 &&
        typeof event.eventData === "object" &&
        event.eventData !== null &&
        !Array.isArray(event.eventData) &&
        (event.occurredAt === undefined ||
            (typeof event.occurredAt === "string" &&
                !Number.isNaN(Date.parse(event.occurredAt)))));
}
function isCreatePatientInput(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const patient = value;
    return (typeof patient.name === "string" &&
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
        !Array.isArray(patient.health_conditions));
}
function isUpdatePatientInput(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const patient = value;
    const fields = Object.keys(patient);
    const allowedFields = [
        "name",
        "age",
        "sex",
        "symptoms",
        "diagnosed_diseases",
        "health_conditions",
    ];
    if (fields.length === 0 ||
        fields.some((field) => !allowedFields.includes(field))) {
        return false;
    }
    return ((patient.name === undefined ||
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
                !Array.isArray(patient.health_conditions))));
}
//# sourceMappingURL=patient.controller.js.map