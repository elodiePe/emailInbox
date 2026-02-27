create table if not exists public.simulation_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists simulation_state_updated_at on public.simulation_state;
create trigger simulation_state_updated_at
before update on public.simulation_state
for each row execute function public.set_updated_at();

alter table public.simulation_state enable row level security;

drop policy if exists "anon_select_simulation_state" on public.simulation_state;
create policy "anon_select_simulation_state"
on public.simulation_state
for select
to anon
using (true);

drop policy if exists "anon_insert_simulation_state" on public.simulation_state;
create policy "anon_insert_simulation_state"
on public.simulation_state
for insert
to anon
with check (true);

drop policy if exists "anon_update_simulation_state" on public.simulation_state;
create policy "anon_update_simulation_state"
on public.simulation_state
for update
to anon
using (true)
with check (true);
