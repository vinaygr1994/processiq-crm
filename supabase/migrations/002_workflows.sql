-- Workflows: editable automations, plus the runs that track each lead through them.
alter table public.settings add column if not exists timezone text not null default 'UTC';
alter table public.settings add column if not exists starters_installed boolean not null default false;

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  trigger jsonb not null default '{"type":"lead_created"}',
  steps jsonb not null default '[]',
  exit jsonb not null default '[]',
  active boolean not null default true,
  activated_at timestamptz not null default now(),
  template_id text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete cascade,
  trigger_key text not null,
  pos jsonb not null default '[0]',
  status text not null default 'active' check (status in ('active','done','stopped')),
  next_run_at timestamptz not null default now(),
  locked_until timestamptz,
  note text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists workflow_runs_key_idx on public.workflow_runs(owner_id, workflow_id, trigger_key);
create index if not exists workflow_runs_due_idx on public.workflow_runs(status, next_run_at);
create index if not exists workflows_owner_idx on public.workflows(owner_id, active);

do $$
declare t text;
begin
  foreach t in array array['workflows','workflow_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
