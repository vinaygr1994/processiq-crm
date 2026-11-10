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
