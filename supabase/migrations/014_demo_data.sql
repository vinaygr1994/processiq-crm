-- Remembers which sample records were loaded, so "Remove demo data" deletes exactly those. Safe to run again.
alter table public.settings add column if not exists demo_ids jsonb;
