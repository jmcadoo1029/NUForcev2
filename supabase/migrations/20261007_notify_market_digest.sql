-- Add the per-user "Market research digest" toggle to nuforce_user_settings.
-- Opt-in only: NULL/false = off. Managed in-app under Users → notification toggles.
-- Run in Supabase → SQL Editor. Safe to re-run.

alter table public.nuforce_user_settings
  add column if not exists notify_market_digest boolean;
