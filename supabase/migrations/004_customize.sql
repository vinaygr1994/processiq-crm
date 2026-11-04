-- Customization: renamable pipeline stages and custom fields on contacts and jobs.
alter table public.settings add column if not exists stage_labels jsonb not null default '{}';
alter table public.settings add column if not exists custom_fields jsonb not null default '[]';
alter table public.contacts add column if not exists custom jsonb not null default '{}';
alter table public.deals add column if not exists custom jsonb not null default '{}';
