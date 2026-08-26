-- ============================================================================
-- NUForce Mass Emails — schema
-- Run once in the Supabase SQL editor. Three tables:
--   email_templates       reusable subject/body templates managers save & reuse
--   mass_emails           one blast (campaign header) + rollup counts
--   mass_email_recipients per-recipient row + delivery status (metrics)
--
-- After creating, grant the authenticated role access (RLS). NUForce reads/writes
-- these with the caller's JWT via PostgREST, and the mass-email edge function
-- writes with the service role. Adjust policies to your security model.
-- ============================================================================

create table if not exists email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null default '',
  body        text not null default '',
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists mass_emails (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  body            text not null,
  audience        text,               -- human label, e.g. 'All contacts' or 'Quoted code 11'
  sent_by         text,
  sent_at         timestamptz not null default now(),
  recipient_count int not null default 0,
  sent_count      int not null default 0,
  failed_count    int not null default 0
);

create table if not exists mass_email_recipients (
  id            uuid primary key default gen_random_uuid(),
  mass_email_id uuid references mass_emails(id) on delete cascade,
  email         text not null,
  name          text,
  resend_id     text,                 -- Resend message id; matches the webhook's email_id
  status        text not null default 'queued', -- queued|sent|delivered|bounced|complained|opened|failed
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists mass_email_recipients_resend_idx on mass_email_recipients (resend_id);
create index if not exists mass_email_recipients_mass_idx   on mass_email_recipients (mass_email_id);

-- RLS (example — tighten to your model). Authenticated users can read history and
-- manage templates; the edge function uses the service role, which bypasses RLS.
alter table email_templates        enable row level security;
alter table mass_emails            enable row level security;
alter table mass_email_recipients  enable row level security;

create policy email_templates_rw       on email_templates       for all to authenticated using (true) with check (true);
create policy mass_emails_read         on mass_emails           for select to authenticated using (true);
create policy mass_email_recipients_rd on mass_email_recipients for select to authenticated using (true);
