-- Journeys and email tracking: run once in Supabase → SQL Editor.
-- Adds open/click tracking to every email and links journey emails to the person's journey run,
-- so engagement splits ("did they open the last email?") and per-email stats work.
alter table public.emails add column if not exists opened_at timestamptz;
alter table public.emails add column if not exists clicked_at timestamptz;
alter table public.emails add column if not exists run_id uuid references public.workflow_runs(id) on delete set null;
alter table public.emails add column if not exists step_id text;
create index if not exists emails_run_idx on public.emails(run_id, step_id);
