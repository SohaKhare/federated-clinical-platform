-- The deployed logs_status_check constraint only allowed
-- ('pending', 'confirmed', 'failed'), but 001_initial_schema.sql already
-- specifies the full set the application writes
-- ('preparing', 'submitted', 'received', 'applied', 'synced' as well).
-- That broader list was never applied to the live database. This brings
-- the constraint in line with 001_initial_schema.sql and application code.

alter table public.logs
  drop constraint if exists logs_status_check;

alter table public.logs
  add constraint logs_status_check check (status in (
    'pending', 'confirmed', 'failed', 'preparing', 'submitted',
    'received', 'applied', 'synced'
  ));
