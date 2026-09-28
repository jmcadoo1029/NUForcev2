-- Mass-email receipt digests.
--
-- After a mass / account / re-engage blast has had time to settle (~1 hour, so
-- delivered/opened/bounced events have arrived from Resend), a digest email goes to
-- the people who opted in: how it landed, which addresses need attention, and a link
-- to the Outreach feed. The mass-email-digest edge function does the sending; a cron
-- job pokes it every 15 minutes (see the block at the bottom).
--
-- This migration adds:
--   nuforce_user_settings.notify_receipts  → per-user opt-in (NULL = role default;
--                                             the app defaults it ON for managers).
--   mass_emails.receipt_sent / _at         → so each blast's digest is sent exactly once.

-- 1) Per-user opt-in toggle (managed in More → Users). NULL means "use the role
--    default" (managers default on), matching notify_delivery / notify_approvals.
alter table public.nuforce_user_settings
  add column if not exists notify_receipts boolean;

-- 2) Track which blasts have had their receipt sent.
alter table public.mass_emails
  add column if not exists receipt_sent    boolean not null default false;
alter table public.mass_emails
  add column if not exists receipt_sent_at timestamptz;

-- 3) Backfill: mark every EXISTING blast as already-receipted so the first digest run
--    doesn't email a receipt for historical sends. Only blasts created after this
--    migration will generate a receipt.
update public.mass_emails set receipt_sent = true where receipt_sent = false;

-- Helps the digest job find due blasts quickly.
create index if not exists mass_emails_receipt_idx on public.mass_emails (receipt_sent, sent_at);

-- ── Digest cron via Supabase cron ────────────────────────────────────────────
-- Requires pg_cron + pg_net (already enabled for the schedule-tick job). Replace
-- <PROJECT_REF> and reuse the SAME secret the schedule-tick job uses, then run this.
-- The function only reads blasts + sends receipts to opted-in staff, so it's low-risk.
--
--   select cron.schedule(
--     'mass-email-digest',
--     '*/15 * * * *',            -- every 15 min; a blast is receipted ~1h after it went out
--     $$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/mass-email-digest',
--       headers := jsonb_build_object('Content-Type','application/json','x-tick-secret','<SCHEDULE_TICK_SECRET>')
--     );
--     $$
--   );
--
-- The function reuses the existing SCHEDULE_TICK_SECRET. Deploy it with:
--   supabase functions deploy mass-email-digest --no-verify-jwt
--
-- Optional: set APP_BASE_URL so the receipt's "view in Outreach" link points at the
-- live app (defaults to https://nuforce.nulabs.com):
--   supabase secrets set APP_BASE_URL=https://nuforce.nulabs.com
