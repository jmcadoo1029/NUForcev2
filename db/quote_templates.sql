-- Editable email templates for NUForce sends. One row per key ('quote',
-- 'follow_up'). The app ships sensible defaults in code (emailTemplates.ts) and
-- reads this table to override them; managers/senders can edit wording in-app
-- without a redeploy. Placeholders like {First Name of contact}, {Quote #},
-- {Test Item}, {Sender} are filled client-side before send.
--
-- Idempotent, no destructive drops.

create table if not exists public.quote_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,      -- 'quote' | 'follow_up'
  subject    text not null default '',
  body       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.quote_templates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quote_templates' and policyname='quote_templates_auth_all') then
    create policy quote_templates_auth_all on public.quote_templates
      for all to authenticated using (true) with check (true);
  end if;
end $$;
