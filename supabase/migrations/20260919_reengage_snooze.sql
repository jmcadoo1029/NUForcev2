-- reengage_snooze — temporarily hide a dormant contact from the Re-engage list.
-- Keyed by email (lowercased by the app), independent of the contacts table, because
-- a dormant contact may only exist inside quotes (never added to the contact list).
-- The Re-engage panel excludes any email whose snooze_until is still in the future;
-- once it passes, the contact reappears automatically. There is no permanent dismiss.

create table if not exists public.reengage_snooze (
  email        text primary key,
  snooze_until timestamptz not null,
  snoozed_by   text,
  snoozed_at   timestamptz not null default now()
);

-- The app talks to PostgREST as the logged-in (authenticated) user, the same way it
-- reads/writes quote_flags and contacts. Enable RLS and allow authenticated users to
-- read and manage snoozes. (Re-run safe: policies are dropped first.)
alter table public.reengage_snooze enable row level security;

drop policy if exists "reengage_snooze select" on public.reengage_snooze;
drop policy if exists "reengage_snooze insert" on public.reengage_snooze;
drop policy if exists "reengage_snooze update" on public.reengage_snooze;
drop policy if exists "reengage_snooze delete" on public.reengage_snooze;

create policy "reengage_snooze select" on public.reengage_snooze for select to authenticated using (true);
create policy "reengage_snooze insert" on public.reengage_snooze for insert to authenticated with check (true);
create policy "reengage_snooze update" on public.reengage_snooze for update to authenticated using (true) with check (true);
create policy "reengage_snooze delete" on public.reengage_snooze for delete to authenticated using (true);

-- Quick lookup for the "still snoozed" filter.
create index if not exists reengage_snooze_until_idx on public.reengage_snooze (snooze_until);
