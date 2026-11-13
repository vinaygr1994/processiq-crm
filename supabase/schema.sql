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
  stage text not null default 'new',
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

-- Smart segments (also in migrations/008_segments.sql)
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  match text not null default 'all' check (match in ('all','any')),
  rules jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.segments enable row level security;
drop policy if exists "owner_all" on public.segments;
create policy "owner_all" on public.segments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Forms and landing pages (also in migrations/009_forms.sql)
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft','published')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists forms_owner_idx on public.forms(owner_id);
create index if not exists form_submissions_form_idx on public.form_submissions(form_id, created_at desc);
do $$
declare t text;
begin
  foreach t in array array['forms','form_submissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- Bookings, classes and memberships (also in migrations/010_bookings.sql)
alter table public.settings add column if not exists booking jsonb not null default '{}';
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'appointment' check (kind in ('appointment','class')),
  duration int not null default 60,
  price numeric not null default 0,
  capacity int not null default 1,
  color text not null default '#0b8a8a',
  description text not null default '',
  staff jsonb not null default '[]',
  schedule jsonb not null default '[]',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  staff text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','checked_in','cancelled','no_show')),
  source text not null default 'staff',
  membership_id uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'pack' check (kind in ('unlimited','pack')),
  price numeric not null default 0,
  sessions int not null default 10,
  months int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  credits int,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now()
);
create index if not exists bookings_time_idx on public.bookings(owner_id, starts_at);
create index if not exists memberships_contact_idx on public.memberships(contact_id);
do $$
declare t text;
begin
  foreach t in array array['services','bookings','plans','memberships'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- Pipelines (also in migrations/011_pipelines.sql)
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals add column if not exists pipeline text not null default 'default';
alter table public.deals add column if not exists close_date date;
alter table public.deals add column if not exists priority text not null default '';
alter table public.settings add column if not exists pipelines jsonb not null default '[]';
alter table public.settings add column if not exists industry text not null default 'general';
alter table public.settings add column if not exists interests jsonb not null default '[]';

-- Team, permissions and custom objects (also in migrations/012_team_objects.sql)

-- 1) Team members. The account owner (the person who signed up) has no row and is always the owner.
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'rep' check (role in ('admin','manager','rep','viewer')),
  status text not null default 'invited' check (status in ('invited','active','disabled')),
  own_only boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists org_members_user_idx on public.org_members(user_id);

-- 2) Who am I in the CRM? Used by every security rule below.
create or replace function public.crm_org() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select org_id from public.org_members where user_id = auth.uid() and status <> 'disabled' order by created_at limit 1), auth.uid())
$$;
create or replace function public.crm_role() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.org_members where user_id = auth.uid() and status <> 'disabled' order by created_at limit 1), 'owner')
$$;
create or replace function public.crm_name() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.org_members where user_id = auth.uid() and status <> 'disabled' order by created_at limit 1), '')
$$;
create or replace function public.crm_own_only() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select own_only from public.org_members where user_id = auth.uid() and status <> 'disabled' order by created_at limit 1), false)
$$;
-- Stop a disabled or removed member from falling back to an empty account of their own.
create or replace function public.crm_blocked() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where user_id = auth.uid() and status = 'disabled')
    and not exists (select 1 from public.org_members where user_id = auth.uid() and status <> 'disabled')
$$;

-- An invited person becomes active the first time they sign in.
create or replace function public.crm_accept() returns void language sql security definer set search_path = public as $$
  update public.org_members set status = 'active' where user_id = auth.uid() and status = 'invited'
$$;
grant execute on function public.crm_accept() to authenticated;

alter table public.org_members enable row level security;
drop policy if exists "team_read" on public.org_members;
create policy "team_read" on public.org_members for select to authenticated using (org_id = public.crm_org() or user_id = auth.uid());

-- 3) Record owners on contacts (deals already have "rep").
alter table public.contacts add column if not exists owner text not null default '';

-- 4) Custom objects (e.g. Class booking, Consultation, Treatment) and their records.
create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  plural text not null default '',
  icon text not null default 'note',
  color text not null default '#0b8a8a',
  fields jsonb not null default '[]',
  statuses jsonb not null default '[]',
  link_contact boolean not null default true,
  link_deal boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  object_id uuid not null references public.objects(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  title text not null default '',
  status text not null default '',
  assigned_to text not null default '',
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists records_object_idx on public.records(object_id, created_at desc);
create index if not exists records_contact_idx on public.records(contact_id);
create index if not exists records_deal_idx on public.records(deal_id);

-- 5) Every table: shared by the whole team, read-only people can't change anything,
--    and reps limited to "own records" only see deals and contacts assigned to them (or unassigned).
do $$
declare t text;
begin
  foreach t in array array['contacts','deals','visits','autolog','tasks','activities','templates','campaigns','emails','workflows','workflow_runs',
                           'segments','forms','form_submissions','services','bookings','plans','memberships','objects','records','settings'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I alter column owner_id set default public.crm_org()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('drop policy if exists "crm_select" on public.%I', t);
    execute format('drop policy if exists "crm_insert" on public.%I', t);
    execute format('drop policy if exists "crm_update" on public.%I', t);
    execute format('drop policy if exists "crm_delete" on public.%I', t);
    if t = 'settings' then
      execute 'create policy "crm_select" on public.settings for select to authenticated using (owner_id = public.crm_org() and not public.crm_blocked())';
      execute 'create policy "crm_insert" on public.settings for insert to authenticated with check (owner_id = public.crm_org() and public.crm_role() in (''owner'',''admin''))';
      execute 'create policy "crm_update" on public.settings for update to authenticated using (owner_id = public.crm_org() and public.crm_role() in (''owner'',''admin'')) with check (owner_id = public.crm_org())';
      execute 'create policy "crm_delete" on public.settings for delete to authenticated using (owner_id = public.crm_org() and public.crm_role() = ''owner'')';
    elsif t in ('deals','contacts') then
      execute format($p$create policy "crm_select" on public.%I for select to authenticated using (
        owner_id = public.crm_org() and not public.crm_blocked()
        and (not public.crm_own_only() or %s in ('', public.crm_name())))$p$, t, case when t = 'deals' then 'rep' else 'owner' end);
      execute format('create policy "crm_insert" on public.%I for insert to authenticated with check (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked())', t);
      execute format($p$create policy "crm_update" on public.%I for update to authenticated using (
        owner_id = public.crm_org() and public.crm_role() <> 'viewer' and not public.crm_blocked()
        and (not public.crm_own_only() or %s in ('', public.crm_name()))) with check (owner_id = public.crm_org())$p$, t, case when t = 'deals' then 'rep' else 'owner' end);
      execute format('create policy "crm_delete" on public.%I for delete to authenticated using (owner_id = public.crm_org() and public.crm_role() in (''owner'',''admin'',''manager''))', t);
    else
      execute format('create policy "crm_select" on public.%I for select to authenticated using (owner_id = public.crm_org() and not public.crm_blocked())', t);
      execute format('create policy "crm_insert" on public.%I for insert to authenticated with check (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked())', t);
      execute format('create policy "crm_update" on public.%I for update to authenticated using (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked()) with check (owner_id = public.crm_org())', t);
      execute format('create policy "crm_delete" on public.%I for delete to authenticated using (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked())', t);
    end if;
  end loop;
end $$;


-- ===== 013_messages.sql =====
-- SMS and WhatsApp messages (Mobile Studio). Run once in Supabase → SQL Editor. Safe to run again.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.crm_org() references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('sms','whatsapp')),
  direction text not null check (direction in ('in','out')),
  phone text not null default '',
  body text not null default '',
  template text not null default '',
  status text not null default 'sent',
  error text not null default '',
  provider_id text not null default '',
  read boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists messages_owner_idx on public.messages(owner_id, created_at desc);
create index if not exists messages_contact_idx on public.messages(contact_id, created_at desc);
create index if not exists messages_provider_idx on public.messages(provider_id) where provider_id <> '';
create index if not exists messages_phone_idx on public.messages(phone, created_at desc);

-- People who replied STOP must not be texted again.
alter table public.contacts add column if not exists sms_opt_out boolean not null default false;

alter table public.messages enable row level security;
drop policy if exists "crm_select" on public.messages;
drop policy if exists "crm_insert" on public.messages;
drop policy if exists "crm_update" on public.messages;
drop policy if exists "crm_delete" on public.messages;
create policy "crm_select" on public.messages for select to authenticated using (owner_id = public.crm_org() and not public.crm_blocked());
create policy "crm_insert" on public.messages for insert to authenticated with check (owner_id = public.crm_org() and public.crm_role() <> 'viewer' and not public.crm_blocked());
create policy "crm_update" on public.messages for update to authenticated using (owner_id = public.crm_org() and public.crm_role() <> 'viewer' and not public.crm_blocked()) with check (owner_id = public.crm_org());
create policy "crm_delete" on public.messages for delete to authenticated using (owner_id = public.crm_org() and public.crm_role() in ('owner','admin','manager'));


-- ===== 014_demo_data.sql =====
-- Remembers which sample records were loaded, so "Remove demo data" deletes exactly those. Safe to run again.
alter table public.settings add column if not exists demo_ids jsonb;


-- ===== 015_data_extensions.sql =====
-- Data extensions (custom marketing data tables) and their records. Run once in Supabase → SQL Editor. Safe to run again.
create table if not exists public.data_extensions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.crm_org() references auth.users(id) on delete cascade,
  name text not null,
  external_key text not null default '',
  description text not null default '',
  folder text not null default '',
  fields jsonb not null default '[]',
  sendable boolean not null default false,
  link jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.de_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.crm_org() references auth.users(id) on delete cascade,
  de_id uuid not null references public.data_extensions(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists de_rows_de_idx on public.de_rows(de_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['data_extensions','de_rows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "crm_select" on public.%I', t);
    execute format('drop policy if exists "crm_insert" on public.%I', t);
    execute format('drop policy if exists "crm_update" on public.%I', t);
    execute format('drop policy if exists "crm_delete" on public.%I', t);
    execute format('create policy "crm_select" on public.%I for select to authenticated using (owner_id = public.crm_org() and not public.crm_blocked())', t);
    execute format('create policy "crm_insert" on public.%I for insert to authenticated with check (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked())', t);
    execute format('create policy "crm_update" on public.%I for update to authenticated using (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked()) with check (owner_id = public.crm_org())', t);
    execute format('create policy "crm_delete" on public.%I for delete to authenticated using (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked())', t);
  end loop;
end $$;

-- ===== 016_subscribers.sql =====
-- Subscriber status (why an address is suppressed) and a suppression list for addresses that must never be emailed.
alter table public.contacts add column if not exists email_status text not null default '';
alter table public.contacts add column if not exists unsub_reason text not null default '';
alter table public.contacts add column if not exists unsub_at timestamptz;
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.crm_org() references auth.users(id) on delete cascade,
  email text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists suppressions_email_idx on public.suppressions(owner_id, lower(email));

do $$
begin
  execute 'alter table public.suppressions enable row level security';
  execute 'drop policy if exists "crm_select" on public.suppressions';
  execute 'drop policy if exists "crm_insert" on public.suppressions';
  execute 'drop policy if exists "crm_update" on public.suppressions';
  execute 'drop policy if exists "crm_delete" on public.suppressions';
  execute 'create policy "crm_select" on public.suppressions for select to authenticated using (owner_id = public.crm_org() and not public.crm_blocked())';
  execute 'create policy "crm_insert" on public.suppressions for insert to authenticated with check (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked())';
  execute 'create policy "crm_update" on public.suppressions for update to authenticated using (owner_id = public.crm_org() and public.crm_role() <> ''viewer'' and not public.crm_blocked()) with check (owner_id = public.crm_org())';
  execute 'create policy "crm_delete" on public.suppressions for delete to authenticated using (owner_id = public.crm_org() and public.crm_role() in (''owner'',''admin'',''manager''))';
end $$;
