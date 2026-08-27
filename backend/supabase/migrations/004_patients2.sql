-- patients2: the new patient_medical_dataset.csv table.
--
-- Rows 1-2500 of federated/data/patient_medical_dataset.csv are seeded here
-- (see scripts/seed_patients2.mjs). Rows 2501-3000 are the held-out test set
-- and are never inserted; rows 3001-5000 are the unseen future pool that the
-- "Add 10-20 Patients" button pulls from at runtime.

create extension if not exists pgcrypto;

create table if not exists public.patients2 (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.users(user_id) on delete set null,
  source_row integer unique,
  dataset_patient_id text unique,
  previous_diagnosis text,
  medical_conditions text,
  current_symptoms text[] not null default '{}',
  age integer check (age >= 0),
  gender text,
  hospital text,
  location text,
  diagnosis_date date,
  diagnosis text,
  disease_type text,
  predicted_diagnosis text,
  prediction_confidence numeric(5, 4),
  is_future_pool boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patients2_hospital_idx on public.patients2 (hospital_id);
create index if not exists patients2_source_row_idx on public.patients2 (source_row);
create index if not exists patients2_diagnosis_date_idx on public.patients2 (diagnosis_date);

drop trigger if exists patients2_set_updated_at on public.patients2;
create trigger patients2_set_updated_at
before update on public.patients2
for each row execute function public.set_updated_at();

alter table public.patients2 enable row level security;