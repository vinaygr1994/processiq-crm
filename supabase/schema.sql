-- Process IQ CRM: database schema.
-- Run this once in Supabase: SQL Editor → New query → paste → Run.
-- Already set up earlier? Run only the files in supabase/migrations/ that you have not run yet.
-- Every row belongs to one user (owner_id) and row-level security makes sure people only ever see their own data.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  email text not null default '',
  phone text not null default '',
  company text not null default '',
  tags text[] not null default '{}',
  source text not null default '',
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  value numeric not null default 0,
  stage text not null default 'new' check (stage in ('new','contacted','visit_booked','visit_done','quoted','won','completed','lost')),
  contact_id uuid references public.contacts(id) on delete set null,
  source text not null default '',
  project text not null default '',
  budget text not null default '',
  address text not null default '',
  rep text not null default '',
  lost_reason text not null default '',
  stage_at timestamptz not null default now(),
  quote_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  rep text not null default '',
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','done','no_show','cancelled')),
  priority text not null default '' check (priority in ('','hot','warm','cold')),
  result text not null default '',
  created_at timestamptz not null default now()
);

-- Autopilot log. "key" makes every automated step run once (e.g. 'speed:<deal id>').
create table if not exists public.autolog (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  kind text not null default 'Auto',
  message text not null default '',
  tone text not null default 'info' check (tone in ('info','warn','won','skip')),
  key text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists autolog_key_idx on public.autolog(owner_id, key) where key <> '';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','call','meeting')),
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body text not null default '',
  audience text not null default 'all',
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','canceled')),
  sent_count int not null default 0,
  failed_count int not null default 0,
  sent_at timestamptz,
  scheduled_at timestamptz,
  spec jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  to_email text not null,
  subject text not null default '',
  body text not null default '',
  status text not null default 'sent' check (status in ('sent','failed','demo')),
  error text not null default '',
  campaign_id uuid references public.campaigns(id) on delete set null,
  opened_at timestamptz,
  clicked_at timestamptz,
  run_id uuid,
  step_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  business_name text not null default '',
  sender_name text not null default '',
  reply_to text not null default '',
  address text not null default '',
  signature text not null default '',
  reps text[] not null default '{}',
  owner_email text not null default '',
  review_link text not null default '',
  booking_link text not null default '',
  automations_off text[] not null default '{}',
  rr_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists contacts_owner_idx on public.contacts(owner_id, created_at desc);
create index if not exists deals_owner_idx on public.deals(owner_id, stage);
create index if not exists visits_deal_idx on public.visits(deal_id, starts_at);
create index if not exists autolog_deal_idx on public.autolog(deal_id, created_at desc);
create index if not exists tasks_owner_idx on public.tasks(owner_id, done, due_date);
create index if not exists activities_contact_idx on public.activities(contact_id, created_at desc);
create index if not exists emails_owner_idx on public.emails(owner_id, created_at desc);

-- Row-level security: each person can only touch their own rows.
do $$
declare t text;
begin
  foreach t in array array['contacts','deals','visits','autolog','tasks','activities','templates','campaigns','emails','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- ===== Workflows (migration 002) =====
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

-- ===== Lead intake (migration 003) =====
alter table public.settings add column if not exists intake_key text not null default encode(gen_random_bytes(16), 'hex');
create unique index if not exists settings_intake_key_idx on public.settings(intake_key);

-- ===== Customization (migration 004) =====
alter table public.settings add column if not exists stage_labels jsonb not null default '{}';
alter table public.settings add column if not exists custom_fields jsonb not null default '[]';
alter table public.contacts add column if not exists custom jsonb not null default '{}';
alter table public.deals add column if not exists custom jsonb not null default '{}';
