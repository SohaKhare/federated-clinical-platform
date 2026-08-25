-- Schema drift fix: 001_initial_schema.sql declares `default gen_random_uuid()`
-- on every uuid primary key, but the live database never actually had these
-- defaults applied (confirmed via the PostgREST OpenAPI schema — these
-- columns show no default, unlike e.g. users.role or *.created_at). Prisma
-- always generated these ids client-side, masking the gap. Now that the
-- backend talks to Postgres directly via supabase-js (no more Prisma), it
-- needs the DB to actually generate them.

alter table public.users
  alter column user_id set default gen_random_uuid();

alter table public.patients
  alter column patient_id set default gen_random_uuid();

alter table public.patient_events
  alter column event_id set default gen_random_uuid();

alter table public.logs
  alter column log_id set default gen_random_uuid();

-- Same drift, different columns: 001_initial_schema.sql also declares
-- `updated_at timestamptz not null default now()` on users and
-- federated_rounds, but the live table lacks it (patients.updated_at
-- already has it live — only these two were missed). The `set_updated_at()`
-- trigger only fires BEFORE UPDATE, so it never covers the INSERT path.
alter table public.users
  alter column updated_at set default now();

alter table public.federated_rounds
  alter column updated_at set default now();
