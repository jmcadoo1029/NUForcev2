-- Audit log for quote/follow-up email sends (CMMC / NIST 800-171). Written by
-- the quote-send edge function via the service role, on every attempt — success
-- or failure. Self-contained so it doesn't depend on the shared sent_emails
-- schema; the workspace side can mirror from here if a unified view is wanted.
--
-- Idempotent, no destructive drops.

create table if not exists public.quote_sends (
  id               uuid primary key default gen_random_uuid(),
  quote_id         text not null,
  opportunity      text,
  send_kind        text not null default 'quote',   -- 'quote' | 'follow_up'
  to_emails        text[] not null default '{}',
  cc_emails        text[] not null default '{}',
  subject          text,
  body             text,
  sent_by          text,        -- session email of the sender
  sent_by_name     text,
  sent_by_email    text,        -- reply-to (real @nulabs.com)
  from_email       text,        -- the @mail.nulabs.com send address used
  attachment_count integer not null default 0,
  resend_id        text,
  status           text not null default 'failed',  -- 'sent' | 'failed'
  error            text,
  sent_at          timestamptz not null default now()
);

create index if not exists quote_sends_quote_id_idx on public.quote_sends (quote_id);
create index if not exists quote_sends_sent_at_idx on public.quote_sends (sent_at desc);

alter table public.quote_sends enable row level security;

-- Authenticated users may READ the audit (e.g. a send history view). Inserts are
-- done by the edge function with the service role, which bypasses RLS — so no
-- insert policy is granted to authenticated, keeping the audit tamper-resistant
-- from the client.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quote_sends' and policyname='quote_sends_auth_read') then
    create policy quote_sends_auth_read on public.quote_sends
      for select to authenticated using (true);
  end if;
end $$;
