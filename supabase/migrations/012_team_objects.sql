-- Team members, roles and permissions, record owners, and custom objects.
-- Run once in Supabase → SQL Editor. Safe to run again.

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
