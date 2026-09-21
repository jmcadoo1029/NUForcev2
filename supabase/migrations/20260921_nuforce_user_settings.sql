-- nuforce_user_settings — per-user NUForce preferences a manager tailors in the
-- Users area (More → Users). This is a NUForce-OWNED table; it never touches the
-- shared employees / permission_roles tables (which NUForce only reads). Keyed by
-- the employee's login email (lowercased). A NULL toggle means "use the default"
-- (defaults are decided in the app from the user's role); an explicit true/false is
-- a manager override.
--
--   notify_delivery   → receive NUForce delivery-problem alerts (bounce / spam /
--                       delayed send). Enforced by the resend-webhook function.
--   notify_approvals  → receive approval-workflow emails (submitted / approved /
--                       reopen / lost). These are sent by the SHARED workspace
--                       send-notification function, so this preference only takes
--                       effect once that function honors it (see the Russ handoff).

create table if not exists public.nuforce_user_settings (
  email            text primary key,
  notify_delivery  boolean,
  notify_approvals boolean,
  updated_by       text,
  updated_at       timestamptz not null default now()
);

alter table public.nuforce_user_settings enable row level security;

drop policy if exists "nuforce_user_settings all" on public.nuforce_user_settings;
create policy "nuforce_user_settings all" on public.nuforce_user_settings
  for all to authenticated using (true) with check (true);
