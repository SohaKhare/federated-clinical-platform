// Seeds public.patients2 with rows 1-2500 of
// federated/data/patient_medical_dataset.csv.
//
// Rows 2501-3000 are the held-out test set — never inserted. Rows 3001-5000
// are the unseen future pool, added at runtime by the Add Patients button.
//
// Usage: node scripts/seed_patients2.mjs   (reads ../.env for Supabase creds)

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader so this runs standalone without tsx/dotenv wiring.
try {
  const envFile = readFileSync(path.join(here, "..", ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // fall through to ambient env
}

const { createClient } = require("@supabase/supabase-js");
const csvParse = await import("csv-parse/sync").catch(() => null);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DATASET_PATH = path.resolve(
  here,
  "../../federated/data/patient_medical_dataset.csv",
);
const TRAIN_ROWS = 2500;
const BATCH_SIZE = 500;

function parseCsv(text) {
  // Simple RFC4180-ish parser: handles quoted fields with embedded commas.
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

async function main() {
  const text = readFileSync(DATASET_PATH, "utf8");
  const raw = parseCsv(text);
  const header = raw[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));

  const rows = raw.slice(1, TRAIN_ROWS + 1).map((cells, i) => ({
    source_row: i + 1,
    dataset_patient_id: cells[idx.patient_id],
    previous_diagnosis: cells[idx.previous_diagnosis],
    medical_conditions: cells[idx.medical_conditions],
    current_symptoms: String(cells[idx.current_symptoms] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    age: Number(cells[idx.age]),
    gender: cells[idx.gender],
    hospital: cells[idx.hospital],
    location: cells[idx.location],
    diagnosis_date: cells[idx.diagnosis_date],
    diagnosis: cells[idx.diagnosis],
    disease_type: cells[idx.disease_type],
    is_future_pool: false,
  }));

  let inserted = 0;
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from("patients2").upsert(batch, {
      onConflict: "source_row",
      ignoreDuplicates: false,
    });
    if (error) throw new Error(error.message);
    inserted += batch.length;
    console.log(`inserted ${inserted}/${rows.length}`);
  }

  console.log(`Done. Seeded ${inserted} training rows into patients2.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});