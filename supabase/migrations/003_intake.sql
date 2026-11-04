-- Lead intake: every account gets a private key used by the lead form link and the /api/leads webhook.
create extension if not exists pgcrypto;
alter table public.settings add column if not exists intake_key text not null default encode(gen_random_bytes(16), 'hex');
create unique index if not exists settings_intake_key_idx on public.settings(intake_key);
