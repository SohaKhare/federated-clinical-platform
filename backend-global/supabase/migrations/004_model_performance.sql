-- Held-out evaluation set the global node scores every broadcast global
-- model against, so accuracy/loss reflect the aggregated model rather than
-- any single hospital's local numbers. Shape mirrors the /predict request
-- body (see federated/src/federated/service.py::_predict) plus a
-- ground-truth label to score predictions against.
create table if not exists public.test_patients (
  test_patient_id uuid primary key default gen_random_uuid(),
  name text,
  age integer not null check (age >= 0),
  sex text not null,
  symptoms text[] not null default '{}',
  health_conditions jsonb not null default '{}'::jsonb,
  -- Ground truth: true = condition actually present for this synthetic/held-out patient.
  actual_diagnosis boolean not null,
  created_at timestamptz not null default now()
);

-- One row per round the global model was evaluated for.
create table if not exists public.model_performance (
  performance_id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.federated_rounds(round_id) on delete cascade,
  round integer not null,
  accuracy double precision not null check (accuracy >= 0 and accuracy <= 1),
  loss double precision not null check (loss >= 0),
  sample_count integer not null check (sample_count >= 0),
  evaluated_at timestamptz not null default now(),
  unique (round_id)
);

create index if not exists model_performance_round_idx
  on public.model_performance (round desc);

alter table public.test_patients enable row level security;
alter table public.model_performance enable row level security;
