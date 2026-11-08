-- Bookings, classes and memberships (Mindbody-style): run once in Supabase → SQL Editor.
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
