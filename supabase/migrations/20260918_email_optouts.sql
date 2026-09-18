-- email_optouts — the marketing-email suppression list (CAN-SPAM opt-out).
-- The mass-email function filters every send against this table; the unsubscribe
-- function upserts a row when someone clicks the unsubscribe link. Keyed by email
-- so opting out twice is a no-op (merge-duplicates upsert).

create table if not exists public.email_optouts (
  email        text primary key,
  opted_out_at timestamptz not null default now(),
  source       text
);

-- Only the service role (used by the edge functions) touches this table. Enable RLS
-- with no policies so anon/authenticated clients can't read or write the opt-out list;
-- the service key bypasses RLS.
alter table public.email_optouts enable row level security;

-- (Optional) let managers view the list in the app later via a policy; add when needed.
