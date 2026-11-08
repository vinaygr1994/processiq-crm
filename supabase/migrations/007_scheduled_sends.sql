-- Scheduled sends: run once in Supabase → SQL Editor.
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check check (status in ('draft','scheduled','sending','sent','canceled'));
alter table public.campaigns add column if not exists scheduled_at timestamptz;
alter table public.campaigns add column if not exists spec jsonb;
create index if not exists campaigns_due_idx on public.campaigns(status, scheduled_at);
