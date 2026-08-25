import { supabase } from "../../config/supabase.js";
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
import type { Database } from "../../types/supabase.js";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientEventRow = Database["public"]["Tables"]["patient_events"]["Row"];

const EMPTY_SNAPSHOT: ClinicalSnapshot = {
  symptoms: [],
  diagnosed_diseases: [],
  health_conditions: {},
};

export async function createPatient(
  patient: CreatePatientInput,
  hospitalId: string,
): Promise<Patient> {
  const snapshot: ClinicalSnapshot = {
    symptoms: patient.symptoms,
    diagnosed_diseases: patient.diagnosed_diseases,
    health_conditions: patient.health_conditions,
  };

  const { data: createdPatient, error } = await supabase
    .from("patients")
    .insert({
      hospital_id: hospitalId,
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
    })
    .select()
    .single();

  if (error || !createdPatient) {
    throw new Error(error?.message ?? "Failed to create patient.");
  }

  const { error: eventError } = await supabase.from("patient_events").insert({
    patient_id: createdPatient.patient_id,
    event_type: "patient_created",
    event_data: snapshot,
  });

  if (eventError) {
    throw new Error(eventError.message);
  }

  return toPatient(createdPatient, snapshot);
}

export async function getPatients(hospitalId: string): Promise<Patient[]> {
  const { data: patients, error } = await supabase
    .from("patients")
    .select("*")
    .eq("hospital_id", hospitalId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  if (!patients || patients.length === 0) {
    return [];
  }

  const { data: events, error: eventsError } = await supabase
    .from("patient_events")
    .select("*")
    .in(
      "patient_id",
      patients.map((patient) => patient.patient_id),
    )
    .in("event_type", ["patient_created", "patient_updated"])
    .order("occurred_at", { ascending: false });

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const snapshotByPatientId = new Map<string, ClinicalSnapshot>();

  for (const event of events ?? []) {
    if (!snapshotByPatientId.has(event.patient_id)) {
      snapshotByPatientId.set(event.patient_id, toSnapshot(event.event_data));
    }
  }

  return patients.map((patient) =>
    toPatient(patient, snapshotByPatientId.get(patient.patient_id) ?? EMPTY_SNAPSHOT),
  );
}

export async function getPatientById(
  patientId: string,
): Promise<Patient | null> {
  const { data: patient, error } = await supabase
    .from("patients")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!patient) {
    return null;
  }

  const snapshot = await getLatestSnapshot(patientId);

  return toPatient(patient, snapshot);
}

export async function updatePatient(
  patientId: string,
  input: UpdatePatientInput,
): Promise<Patient | null> {
  const { data: existingPatient, error: existingError } = await supabase
    .from("patients")
    .select("patient_id")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existingPatient) {
    return null;
  }

  const clinicalFieldsChanged =
    input.symptoms !== undefined ||
    input.diagnosed_diseases !== undefined ||
    input.health_conditions !== undefined;

  let snapshot = await getLatestSnapshot(patientId);

  if (clinicalFieldsChanged) {
    snapshot = {
      symptoms: input.symptoms ?? snapshot.symptoms,
      diagnosed_diseases: input.diagnosed_diseases ?? snapshot.diagnosed_diseases,
      health_conditions: input.health_conditions ?? snapshot.health_conditions,
    };

    const { error: eventError } = await supabase.from("patient_events").insert({
      patient_id: patientId,
      event_type: "patient_updated",
      event_data: snapshot,
    });

    if (eventError) {
      throw new Error(eventError.message);
    }
  }

  const { data: patient, error } = await supabase
    .from("patients")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.age !== undefined ? { age: input.age } : {}),
      ...(input.sex !== undefined ? { sex: input.sex } : {}),
      // Always touch updated_at, even for a clinical-only change, since it
      // drives which patients are picked up for the next training round.
      updated_at: new Date().toISOString(),
    })
    .eq("patient_id", patientId)
    .select()
    .single();

  if (error || !patient) {
    throw new Error(error?.message ?? "Failed to update patient.");
  }

  return toPatient(patient, snapshot);
}

export async function getPatientEvents(
  patientId: string,
): Promise<PatientEvent[]> {
  const { data: events, error } = await supabase
    .from("patient_events")
    .select("*")
    .eq("patient_id", patientId)
    .order("occurred_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (events ?? []).map(toPatientEvent);
}

export async function addPatientEvent(
  patientId: string,
  event: CreatePatientEventInput,
): Promise<PatientEvent> {
  const { data, error } = await supabase
    .from("patient_events")
    .insert({
      patient_id: patientId,
      event_type: event.eventType,
      event_data: event.eventData,
      ...(event.occurredAt ? { occurred_at: event.occurredAt } : {}),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create patient event.");
  }

  return toPatientEvent(data);
}

/**
 * Every patient gets a `patient_created` event at creation time, so this
 * should always find one. Falls back to an empty snapshot only if that
 * invariant is ever somehow violated.
 */
async function getLatestSnapshot(patientId: string): Promise<ClinicalSnapshot> {
  const { data: event, error } = await supabase
    .from("patient_events")
    .select("*")
    .eq("patient_id", patientId)
    .in("event_type", ["patient_created", "patient_updated"])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return event ? toSnapshot(event.event_data) : EMPTY_SNAPSHOT;
}

function toSnapshot(eventData: unknown): ClinicalSnapshot {
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

function toPatient(patient: PatientRow, snapshot: ClinicalSnapshot): Patient {
  return {
    patient_id: patient.patient_id,
    hospital_id: patient.hospital_id,
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    symptoms: snapshot.symptoms,
    diagnosed_diseases: snapshot.diagnosed_diseases,
    health_conditions: snapshot.health_conditions,
    contributed_to_round: patient.contributed_to_round,
    updated_at: patient.updated_at,
    created_at: patient.created_at,
  };
}

function toPatientEvent(event: PatientEventRow): PatientEvent {
  return {
    event_id: event.event_id,
    patient_id: event.patient_id,
    event_type: event.event_type,
    event_data: event.event_data as PatientEvent["event_data"],
    occurred_at: event.occurred_at,
    created_at: event.created_at,
  };
}
