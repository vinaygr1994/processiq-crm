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
