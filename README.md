# Email Inbox Simulation (Vue + Vite)

This project provides:
- An **Inbox** interface for incoming simulation emails
- A **Send Email** interface for participants to send emails
- A scenario scheduler with:
	- 1 **Introduction** wave
	- 3 groups of 3 emails each
	- next group unlock only after all previous group tasks are completed

## Run

```bash
npm install
npm run dev
```

## Shared database (Supabase)

This project supports shared state across devices using Supabase.

1. Create a Supabase project.
2. Run this SQL in Supabase SQL Editor:

```sql
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
```

3. For quick testing, allow anon access on this table (or configure proper RLS policies).
4. Create `.env` from `.env.example` and fill:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
	- optional `VITE_SIMULATION_ROOM`

When Supabase env vars are present, state is synced between devices.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In GitHub repo settings:
	- `Settings > Pages > Source` = `GitHub Actions`
3. Add repository secrets:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
	- optional `VITE_SIMULATION_ROOM`
4. Push to `main` branch.

Workflow file: [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)

The app uses hash routing, so routes work on GitHub Pages:
- inbox: `/#/`
- email detail: `/#/inbox/:id`
- admin: `/#/admin`

## Scenario file (all emails + send timing)

Edit [src/data/emailSchedule.json](src/data/emailSchedule.json).

Each email includes:
- `from`, `subject`, `body`
- `delaySeconds` (when to send after the wave starts)
- `taskId`, `taskLabel` (required task for progression)

Groups are released in order when every task in the previous group is checked as completed in the UI.
