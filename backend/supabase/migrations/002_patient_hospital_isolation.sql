alter table public.patients
  add column if not exists hospital_id uuid references public.users(user_id) on delete cascade;

alter table public.patients
  alter column hospital_id set not null;

drop index if exists public.patients_updated_at_idx;

create index if not exists patients_hospital_id_updated_at_idx
  on public.patients (hospital_id, updated_at desc);
