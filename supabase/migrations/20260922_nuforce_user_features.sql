-- Adds per-user page/feature access overrides to nuforce_user_settings. A key in
-- `features` present as true/false is a manager override for that feature; a key
-- absent means "use the role default" (decided in the app). Feature keys used today:
--   manager_dashboard  → the Manager view (dashboard route + Manager tab + tiles)
--   mass_emails        → the Mass Emails tab
--   scheduled          → the Scheduled tab
-- All default to the person's role (manager/view-only can see them; regular users
-- can't) unless a manager flips the override here.

alter table public.nuforce_user_settings
  add column if not exists features jsonb not null default '{}'::jsonb;
