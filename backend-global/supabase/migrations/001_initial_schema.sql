create extension if not exists pgcrypto;

create table if not exists public.users (
  user_id uuid primary key default gen_random_uuid(),
  google_id text not null unique,
  email text not null unique,
  hospital_name text,
  picture text,
  role text not null check (role in ('local', 'global')),
  pincode text,
  geolocation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  patient_id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.users(user_id) on delete cascade,
  name text not null,
  age integer not null check (age >= 0),
  sex text not null,
  contributed_to_round integer check (contributed_to_round >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists patients_hospital_id_updated_at_idx
  on public.patients (hospital_id, updated_at desc);

create table if not exists public.patient_events (
  event_id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(patient_id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists patient_events_patient_occurred_idx
  on public.patient_events (patient_id, occurred_at);

create table if not exists public.logs (
  log_id uuid primary key default gen_random_uuid(),
  node_id text not null,
  timestamp timestamptz not null default now(),
  direction text not null check (direction in ('outgoing', 'incoming')),
  round integer not null check (round >= 0),
  metadata jsonb not null default '{}'::jsonb,
  status text not null check (status in (
    'pending', 'confirmed', 'failed', 'preparing', 'submitted',
    'received', 'applied', 'synced'
  )),
  created_at timestamptz not null default now(),
  unique (node_id, round, direction)
);

create index if not exists logs_node_round_idx
  on public.logs (node_id, round desc);

create index if not exists logs_status_idx
  on public.logs (status);

create table if not exists public.federated_rounds (
  round_id uuid primary key,
  round integer not null unique check (round >= 0),
  status text not null,
  target_node_ids jsonb not null default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists federated_rounds_status_idx
  on public.federated_rounds (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists federated_rounds_set_updated_at on public.federated_rounds;
create trigger federated_rounds_set_updated_at
before update on public.federated_rounds
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.patient_events enable row level security;
alter table public.logs enable row level security;
alter table public.federated_rounds enable row level security;
