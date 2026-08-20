-- Sent-files log: one row per file that went out with a send (the generated
-- Quote PDF, the Terms & Conditions, any spec/attachment). The bytes live in the
-- 'quote-documents' Storage bucket under sent/<quoteId>/…; this row keeps the
-- metadata + object path so the exact file can be re-downloaded via a signed URL.
-- SentFiles.tsx reads this (by revision family); sendQuote.logSentFiles writes it.
--
-- Idempotent, no destructive drops.

create table if not exists public.sent_documents (
  id            uuid primary key default gen_random_uuid(),
  quote_id      text not null,
  follow_up_id  text,               -- the send event this file belonged to (a follow_ups row id)
  revision      text,               -- quote revision at send time
  sent_at       timestamptz not null default now(),
  sent_by       text,
  kind          text not null default 'attachment',  -- 'quote_pdf' | 'budget_pdf' | 'attachment'
  file_name     text not null,
  mime          text,
  byte_size     bigint,
  storage_bucket text,
  storage_path  text
);

create index if not exists sent_documents_quote_id_idx on public.sent_documents (quote_id);
create index if not exists sent_documents_follow_up_idx on public.sent_documents (follow_up_id);

alter table public.sent_documents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sent_documents' and policyname='sent_documents_auth_all') then
    create policy sent_documents_auth_all on public.sent_documents
      for all to authenticated using (true) with check (true);
  end if;
end $$;
