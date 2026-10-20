-- contact_reminders — team follow-up reminders to ping a contact on a cadence.
-- Set from Customer Contact → Reminders; due ones surface in the dashboard
-- "Needs your attention" area. Recurring: "Pinged" reschedules by interval_days,
-- "Snooze" pushes due_at out, "Done" closes it. Team-visible (any authenticated
-- user reads/acts); created_by is kept for attribution. Run in Supabase SQL Editor.
create table if not exists public.contact_reminders (
  id             uuid primary key default gen_random_uuid(),
  contact_email  text,
  contact_name   text,
  account        text,
  note           text,
  interval_days  integer not null default 21,         -- recurring cadence (days)
  due_at         date    not null default (now()::date),
  status         text    not null default 'active',    -- 'active' | 'done'
  created_by     text,
  created_at     timestamptz not null default now(),
  last_pinged_at timestamptz,
  updated_at     timestamptz not null default now()
);

-- Same access model as reengage_snooze / quote_flags: the app talks to PostgREST as
-- the logged-in (authenticated) user. Enable RLS; allow authenticated read + manage.
alter table public.contact_reminders enable row level security;
drop policy if exists "contact_reminders select" on public.contact_reminders;
drop policy if exists "contact_reminders insert" on public.contact_reminders;
drop policy if exists "contact_reminders update" on public.contact_reminders;
drop policy if exists "contact_reminders delete" on public.contact_reminders;
create policy "contact_reminders select" on public.contact_reminders for select to authenticated using (true);
create policy "contact_reminders insert" on public.contact_reminders for insert to authenticated with check (true);
create policy "contact_reminders update" on public.contact_reminders for update to authenticated using (true) with check (true);
create policy "contact_reminders delete" on public.contact_reminders for delete to authenticated using (true);

create index if not exists contact_reminders_due_idx on public.contact_reminders (status, due_at);
