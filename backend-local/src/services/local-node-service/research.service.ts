import { getPatients } from "./patient.service.js";
import type {
  DiagnosisSymptomAssociation,
  ResearchInsights,
  ResearchSummary,
} from "../../interfaces/model/research.interface.js";

/**
 * Per API.md's design rules, aggregate endpoints must not expose small
 * groups that could re-identify a patient. Any diagnosis/symptom seen in
 * fewer than this many patients is left out of the response entirely.
 */
const MIN_GROUP_SIZE = 3;
const TOP_N = 10;

export async function getResearchSummary(hospitalId: string): Promise<ResearchSummary> {
  const patients = await getPatients(hospitalId);

  const ages = patients.map((patient) => patient.age);
  const sexBreakdown: Record<string, number> = {};
  const diagnosisCounts = new Map<string, number>();
  const symptomCounts = new Map<string, number>();

  for (const patient of patients) {
    sexBreakdown[patient.sex] = (sexBreakdown[patient.sex] ?? 0) + 1;

    for (const diagnosis of patient.diagnosed_diseases) {
      diagnosisCounts.set(diagnosis, (diagnosisCounts.get(diagnosis) ?? 0) + 1);
    }

    for (const symptom of patient.symptoms) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }

  return {
    total_patients: patients.length,
    age:
      ages.length === 0
        ? { average: null, min: null, max: null }
        : {
            average: Number((ages.reduce((sum, age) => sum + age, 0) / ages.length).toFixed(1)),
            min: Math.min(...ages),
            max: Math.max(...ages),
          },
    sex_breakdown: sexBreakdown,
    top_diagnosed_diseases: toTopList(diagnosisCounts, "diagnosis"),
    top_symptoms: toTopList(symptomCounts, "symptom"),
    min_group_size: MIN_GROUP_SIZE,
  };
}

export async function getResearchInsights(hospitalId: string): Promise<ResearchInsights> {
  const patients = await getPatients(hospitalId);

  const patientsByDiagnosis = new Map<string, (typeof patients)[number][]>();

  for (const patient of patients) {
    for (const diagnosis of patient.diagnosed_diseases) {
      const group = patientsByDiagnosis.get(diagnosis) ?? [];
      group.push(patient);
      patientsByDiagnosis.set(diagnosis, group);
    }
  }

  const associations: DiagnosisSymptomAssociation[] = [];

  for (const [diagnosis, group] of patientsByDiagnosis) {
    if (group.length < MIN_GROUP_SIZE) {
      continue;
    }

    const symptomCounts = new Map<string, number>();

    for (const patient of group) {
      for (const symptom of patient.symptoms) {
        symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
      }
    }

    associations.push({
      diagnosis,
      patient_count: group.length,
      common_symptoms: toTopList(symptomCounts, "symptom", 5),
    });
  }

  associations.sort((a, b) => b.patient_count - a.patient_count);

  return {
    associations,
    min_group_size: MIN_GROUP_SIZE,
    note:
      "Observed associations only, derived from co-occurrence counts within this hospital's own patients. Not a causal claim.",
  };
}

function toTopList<K extends string>(
  counts: Map<string, number>,
  key: K,
  limit = TOP_N,
): Array<Record<K, string> & { count: number }> {
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_GROUP_SIZE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ [key]: value, count }) as Record<K, string> & { count: number });
}
