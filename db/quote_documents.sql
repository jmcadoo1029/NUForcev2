-- NUForce document library: stored, selectable documents attached to quotes.
-- Backs three things Jordan asked for:
--   • generated Test Specification PDFs are saved into NUForce (kind='spec') so
--     they persist and can be re-selected on later sends
--   • the Terms & Conditions PDF is stored once as a GLOBAL doc (quote_id NULL,
--     kind='terms') and selected per-send (default on, uncheckable)
--   • ad-hoc uploaded attachments (kind='attachment')
-- The generated Quote PDF is NOT stored here — it's rebuilt fresh at send time.
--
-- Safe to run more than once: table create is IF NOT EXISTS, and every policy is
-- created only if absent (no DROP, so no "destructive operations" warning).

-- 1) Table -------------------------------------------------------------------
create table if not exists public.quote_documents (
  id            uuid primary key default gen_random_uuid(),
  quote_id      text,                      -- NULL = global (e.g. Terms & Conditions). text, no FK: the shared quotes table is schema-loose.
  kind          text not null default 'attachment',  -- 'terms' | 'spec' | 'attachment'
  label         text not null,
  file_name     text not null,
  mime          text,
  byte_size     bigint,
  storage_bucket text not null default 'quote-documents',
  storage_path  text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text
);

create index if not exists quote_documents_quote_id_idx on public.quote_documents (quote_id);
create index if not exists quote_documents_kind_idx on public.quote_documents (kind);

alter table public.quote_documents enable row level security;

-- Authenticated users manage document rows (the app always runs with a user JWT).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quote_documents' and policyname='quote_documents_auth_all') then
    create policy quote_documents_auth_all on public.quote_documents
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 2) Storage bucket ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('quote-documents', 'quote-documents', false)
on conflict (id) do nothing;

-- Authenticated read/write/update/delete within this one bucket only.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qd_read') then
    create policy qd_read on storage.objects for select to authenticated using (bucket_id = 'quote-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qd_insert') then
    create policy qd_insert on storage.objects for insert to authenticated with check (bucket_id = 'quote-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qd_update') then
    create policy qd_update on storage.objects for update to authenticated using (bucket_id = 'quote-documents') with check (bucket_id = 'quote-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qd_delete') then
    create policy qd_delete on storage.objects for delete to authenticated using (bucket_id = 'quote-documents');
  end if;
end $$;
