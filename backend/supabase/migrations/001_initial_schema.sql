create extension if not exists pgcrypto;

create table if not exists public.users (
  user_id uuid primary key default gen_random_uuid(),
  google_id text not null unique,
  email text not null unique,
  hospitalName text,
  picture text,
  role text not null check (role in ('local', 'global')),
  node_id text,
  pincode text,
  geolocation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_role_node_check check (
    (role = 'local' and node_id is not null)
    or (role = 'global')
  )
);

create index if not exists users_node_id_idx on public.users (node_id);

create table if not exists public.patients (
  patient_id uuid primary key default gen_random_uuid(),
  name text not null,
  age integer not null check (age >= 0),
  sex text not null,
  symptoms text[] not null default '{}',
  diagnosed_diseases text[] not null default '{}',
  health_conditions jsonb not null default '{}'::jsonb,
  contributed_to_round integer check (contributed_to_round >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists patients_updated_at_idx
  on public.patients (updated_at desc);

create table if not exists public.logs (
  log_id uuid primary key default gen_random_uuid(),
  node_id text not null,
  timestamp timestamptz not null default now(),
  direction text not null check (direction in ('outgoing', 'incoming')),
  round integer not null check (round >= 0),
  metadata jsonb not null default '{}'::jsonb,
  status text not null check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  unique (node_id, round, direction)
);

create index if not exists logs_node_round_idx
  on public.logs (node_id, round desc);

create index if not exists logs_status_idx
  on public.logs (status);

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

alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.logs enable row level security;