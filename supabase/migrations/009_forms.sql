-- Forms and landing pages: run once in Supabase → SQL Editor.
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
