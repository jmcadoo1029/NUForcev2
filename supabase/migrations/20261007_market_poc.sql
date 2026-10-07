-- Market Research: store the contracting point(s) of contact for solicitations.
-- SAM.gov returns a primary and (often) a secondary POC with name/email/phone;
-- these columns surface them in the Market Research tab and the weekly digest so
-- you can email the right person. Awards (USASpending) carry no personal POC, so
-- these stay null for award rows. Opt-in to nothing — just adds the columns.
-- Run in Supabase -> SQL Editor. Safe to re-run.

alter table public.market_opportunities
  add column if not exists poc_name   text,
  add column if not exists poc_email  text,
  add column if not exists poc_phone  text,
  add column if not exists poc2_name  text,
  add column if not exists poc2_email text,
  add column if not exists poc2_phone text;
