-- Email scheduler — recurring/scheduled mass sends and rule-based drips.
--
-- Model:
--   email_schedules     one row per saved schedule (calendar send OR rule drip).
--   scheduled_runs      a pending review item created by the daily tick when a
--                       schedule comes due. A manager reviews it in "Needs your
--                       attention" and approves (sends) or dismisses. Nothing is
--                       ever emailed without that approval (review-first).
--   scheduled_send_log  per-schedule ledger of who was emailed, so a rule drip
--                       (e.g. "not quoted in 12 months") doesn't re-hit the same
--                       contact inside the cooldown window.
--
-- The daily tick (schedule-tick edge function, fired by Supabase cron) only DECIDES
-- what's due and creates review items + advances next_fire_at. Recipients are
-- resolved in the app at review time (reusing the mass-email audience queries), and
-- the actual send goes through the existing mass-email function on approval.

create extension if not exists pgcrypto;

create table if not exists public.email_schedules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           text not null,                 -- 'calendar' | 'rule'
  enabled        boolean not null default true,
  template_key   text,                          -- built-in key (mass_all, mass_code, …) …
  template_id    uuid,                           -- …or a custom email_templates id (one of the two)
  config         jsonb not null default '{}'::jsonb, -- {audience, code, campaignId, clientId, rule, ruleMonths}
  cadence        text not null default 'once',   -- 'once' | 'monthly' | 'annually'
  run_on         date,                           -- 'once' exact date; 'annually' uses its MM-DD
  day_of_month   int,                            -- 'monthly'
  cooldown_months int not null default 12,       -- rule dedupe window
  next_fire_at   timestamptz,
  last_fired_at  timestamptz,
  created_by     text,
  created_at     timestamptz not null default now()
);

create table if not exists public.scheduled_runs (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references public.email_schedules(id) on delete cascade,
  name         text,                              -- snapshot of the schedule name at fire time
  kind         text,
  status       text not null default 'pending',   -- 'pending' | 'sent' | 'dismissed'
  created_at   timestamptz not null default now(),
  decided_by   text,
  decided_at   timestamptz,
  sent_count   int
);
create index if not exists scheduled_runs_status_idx on public.scheduled_runs (status, created_at desc);

create table if not exists public.scheduled_send_log (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references public.email_schedules(id) on delete cascade,
  email        text not null,
  sent_at      timestamptz not null default now()
);
create index if not exists scheduled_send_log_lookup_idx on public.scheduled_send_log (schedule_id, email, sent_at);

-- The app talks to PostgREST as the authenticated user (same as quote_flags etc.);
-- the tick function uses the service role and bypasses RLS. Allow authenticated
-- users to read and manage these tables.
alter table public.email_schedules   enable row level security;
alter table public.scheduled_runs     enable row level security;
alter table public.scheduled_send_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['email_schedules','scheduled_runs','scheduled_send_log'] loop
    execute format('drop policy if exists "%1$s all" on public.%1$s', t);
    execute format('create policy "%1$s all" on public.%1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── Daily tick via Supabase cron ─────────────────────────────────────────────
-- Requires the pg_cron + pg_net extensions (enable in Dashboard → Database →
-- Extensions). Replace <PROJECT_REF> and the secret, then run this block. The tick
-- only creates review items, so this is low-risk, but the secret keeps it private.
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule(
--     'email-schedule-tick',
--     '0 13 * * *',              -- 13:00 UTC daily (~8–9am ET); adjust to taste
--     $$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/schedule-tick',
--       headers := jsonb_build_object('Content-Type','application/json','x-tick-secret','<SET_SCHEDULE_TICK_SECRET>')
--     );
--     $$
--   );
--
-- And set the matching secret the function checks:
--   supabase secrets set SCHEDULE_TICK_SECRET=<SET_SCHEDULE_TICK_SECRET>
--   supabase functions deploy schedule-tick --no-verify-jwt
