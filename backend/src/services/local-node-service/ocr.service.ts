import { GoogleGenAI } from "@google/genai";

import { env } from "../../config/env.js";
import type {
  CreatePatientInput,
  HealthConditions,
} from "../../interfaces/model/patient.interface.js";

/**
 * A best-effort patient record extracted from an uploaded report by Gemini.
 * Anchored to {@link CreatePatientInput} so the reviewed draft can be POSTed
 * straight to `POST /patients`. `age` is nullable because a report may not
 * state it — a clinician must set it before saving.
 */
export type PatientOcrDraft = Omit<CreatePatientInput, "age"> & {
  age: number | null;
};

export interface ReportExtractionResult {
  draft: PatientOcrDraft;
  warnings: string[];
}

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!env.gemini.apiKey) {
    throw new OcrConfigurationError(
      "GEMINI_API_KEY is not configured. Set it in the backend environment to enable report OCR.",
    );
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  }

  return geminiClient;
}

/**
 * Thrown when OCR cannot run because the server is missing configuration
 * (e.g. no Gemini API key). Distinct from extraction failures so the
 * controller can map it to a 503 rather than a 500.
 */
export class OcrConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrConfigurationError";
  }
}

const EXTRACTION_PROMPT = `You are a clinical data extraction assistant. You are given an image or PDF of a single patient's medical report. Read ALL text in the document — printed text, handwriting, tables, and lab result panels.

Extract the patient's information and return it as a JSON object with EXACTLY these keys and no others:
- "name": string. The patient's full name, or "" if not clearly stated.
- "age": integer or null. The patient's age in years. Use null if not stated. If only a date of birth is present, do not guess an age — use null.
- "sex": string. One of "male", "female", or "other" (lowercase), or "" if not stated.
- "symptoms": array of strings. Presenting complaints / symptoms mentioned in the report. Use [] if none.
- "diagnosed_diseases": array of strings. Confirmed diagnoses or diseases named in the report. Use [] if none.
- "health_conditions": object. A flat map of clinically relevant measurements and conditions as key/value pairs, e.g. {"blood_pressure": "120/80 mmHg", "hemoglobin": "13.5 g/dL", "diabetic": true}. Use lowercase snake_case keys. Values may be strings, numbers, or booleans only. Use {} if none.

Rules:
- Only use information present in the document. Do not invent or infer values that are not supported by what you can read.
- Correct obvious scanning/handwriting errors in medical terms only when you are confident (e.g. "diabetls" -> "diabetes").
- Return ONLY the JSON object, with no markdown fences or commentary.`;

/**
 * Sends an uploaded report (image or PDF) to Gemini, which reads it and maps it
 * onto the patient schema. Returns a reviewable draft — it never persists
 * anything.
 */
export async function extractPatientFromReport(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ReportExtractionResult> {
  const warnings: string[] = [];
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model: env.gemini.model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: fileBuffer.toString("base64"),
            },
          },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const text = response.text;

  if (!text) {
    warnings.push(
      "The extraction model returned an empty response. Please fill in the fields manually.",
    );

    return { draft: emptyDraft(), warnings };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(stripJsonFences(text));
  } catch {
    warnings.push(
      "Could not parse the extraction model's response. Please fill in the fields manually.",
    );

    return { draft: emptyDraft(), warnings };
  }

  const draft = coerceDraft(parsed, warnings);

  if (draft.age === null) {
    warnings.push("Age was not found in the report — set it before saving.");
  }

  return { draft, warnings };
}

function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  return (fenced?.[1] ?? text).trim();
}

function coerceDraft(value: unknown, warnings: string[]): PatientOcrDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    warnings.push(
      "The extraction model returned an unexpected shape. Please review all fields carefully.",
    );

    return emptyDraft();
  }

  const record = value as Record<string, unknown>;

  return {
    name: typeof record.name === "string" ? record.name.trim() : "",
    age: coerceAge(record.age),
    sex: coerceSex(record.sex),
    symptoms: coerceStringArray(record.symptoms),
    diagnosed_diseases: coerceStringArray(record.diagnosed_diseases),
    health_conditions: coerceHealthConditions(record.health_conditions),
  };
}

function coerceAge(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const age = Math.trunc(value);

    return age >= 0 ? age : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function coerceSex(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalised = value.trim().toLowerCase();

  if (normalised === "m" || normalised === "male") {
    return "male";
  }

  if (normalised === "f" || normalised === "female") {
    return "female";
  }

  if (normalised.length === 0) {
    return "";
  }

  return normalised;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function coerceHealthConditions(value: unknown): HealthConditions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: HealthConditions = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      result[key] = entry;
    }
  }

  return result;
}

function emptyDraft(): PatientOcrDraft {
  return {
    name: "",
    age: null,
    sex: "",
    symptoms: [],
    diagnosed_diseases: [],
    health_conditions: {},
  };
}
