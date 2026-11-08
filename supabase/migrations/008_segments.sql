-- Smart segments: run once in Supabase → SQL Editor.
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  match text not null default 'all' check (match in ('all','any')),
  rules jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists segments_owner_idx on public.segments(owner_id);
alter table public.segments enable row level security;
drop policy if exists "owner_all" on public.segments;
create policy "owner_all" on public.segments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
