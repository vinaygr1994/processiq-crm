-- Pipelines for any industry: run once in Supabase → SQL Editor.
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals add column if not exists pipeline text not null default 'default';
alter table public.deals add column if not exists close_date date;
alter table public.deals add column if not exists priority text not null default '';
alter table public.settings add column if not exists pipelines jsonb not null default '[]';
alter table public.settings add column if not exists industry text not null default 'general';
alter table public.settings add column if not exists interests jsonb not null default '[]';
