-- Bad Contacts weekly report.
--
-- A weekly digest to chosen staff listing every contact currently flagged invalid
-- (email bounced as a bad address, or manually flagged), so whoever maintains the
-- client database has a standing worklist of who to fix/remove. For each bad contact
-- it also lists the Workspace job #s from that person's won quotes, so they can check
-- the jobs those people are attached to. The bad-contacts-report edge function builds
-- and sends it; a weekly cron pokes it.
--
-- Recipients are opt-in only (no role default): a manager turns on the per-user
-- "Bad contacts report" toggle in More → Users for the specific people who should get it.

-- Per-user opt-in for the weekly Bad Contacts report (NULL/false = don't send).
alter table public.nuforce_user_settings
  add column if not exists notify_bad_contacts boolean;

-- ── Weekly cron via Supabase cron ────────────────────────────────────────────
-- Requires pg_cron + pg_net (already enabled). Reuses the SAME SCHEDULE_TICK_SECRET.
-- Deploy the function first:  supabase functions deploy bad-contacts-report --no-verify-jwt
-- (or create it in the dashboard and turn Verify JWT OFF), then:
--
--   select cron.schedule(
--     'bad-contacts-report',
--     '0 13,14 * * 1',           -- Mondays 13:00 AND 14:00 UTC; the function runs only at
--     $$                          -- 9am America/New_York (DST-safe), the other hour no-ops
--     select net.http_post(
--       url     := 'https://swuuxzmgmldvvomsgmjf.supabase.co/functions/v1/bad-contacts-report',
--       headers := jsonb_build_object('Content-Type','application/json','x-tick-secret','<SCHEDULE_TICK_SECRET>')
--     );
--     $$
--   );
--
-- Optional APP_BASE_URL secret (defaults to https://nuforce.nulabs.com) is reused for
-- the "open Bad Contacts" link in the email.
