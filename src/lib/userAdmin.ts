import { restFetch, restFetchAll } from './restFetch'

// Users area (More → Users, managers only) — read the shared employees +
// permission_roles (NUForce never writes them) to show who's who and what their
// role grants, and read/write per-user NUForce preferences in our own
// nuforce_user_settings table. A NULL toggle means "use the role default";
// an explicit boolean is a manager override.

export interface UserRow {
  id: string
  email: string
  name: string
  roleName: string
  caps: Record<string, unknown>
  notifyDelivery: boolean | null // null = default (see defaultDelivery)
  notifyApprovals: boolean | null // null = default (see defaultApprovals)
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function nameFrom(emp: Record<string, unknown>, email: string): string {
  const first = str(emp.first_name) || str(emp.firstname) || str(emp.given_name)
  const last = str(emp.last_name) || str(emp.lastname) || str(emp.family_name)
  const full = str(emp.name) || str(emp.full_name) || str(emp.display_name)
  if (first || last) return [first, last].filter(Boolean).join(' ')
  if (full) return full
  return email
}
function roleNameFrom(role: Record<string, unknown> | undefined, hasRoleId: boolean): string {
  const n = role ? (str(role.name) || str(role.label) || str(role.title)) : ''
  return n || (hasRoleId ? 'Assigned role' : 'No role')
}

// Human-readable list of what a role grants — shown read-only in the detail so the
// baseline is always visible.
export function capsSummary(caps: Record<string, unknown>): string[] {
  if (caps['nuforce_approve_quotes']) return ['Sees the Manager dashboard', 'Can approve / reject quotes', 'Full manager tools (Mass Emails, Scheduled, etc.)']
  if (caps['nuforce_view_dashboard']) return ['Sees the Manager dashboard (view-only)', 'No approve / edit authority']
  return ['Standard user — builds and sends their own quotes', 'No Manager dashboard']
}

// Toggle defaults from role. Delivery-problem alerts default on for everyone who
// sends quotes. Approval-workflow emails default on (managers get the approval
// queue notes; senders get the "approved & ready" note).
export function defaultDelivery(_caps: Record<string, unknown>): boolean { return true }
export function defaultApprovals(_caps: Record<string, unknown>): boolean { return true }

/** Effective on/off for a toggle: the override if set, else the role default. */
export const effective = (override: boolean | null, def: boolean): boolean => (override === null || override === undefined ? def : override)

export async function fetchUsers(): Promise<UserRow[]> {
  const [emps, roles, settings] = await Promise.all([
    restFetchAll<Record<string, unknown>>('employees?select=*&order=email,id').catch(() => [] as Record<string, unknown>[]),
    restFetch<Record<string, unknown>[]>('GET', 'permission_roles?select=*&limit=200').catch(() => [] as Record<string, unknown>[]),
    restFetch<{ email: string; notify_delivery: boolean | null; notify_approvals: boolean | null }[]>('GET', 'nuforce_user_settings?select=email,notify_delivery,notify_approvals&limit=5000').catch(() => []),
  ])
  const roleById = new Map((roles || []).map((r) => [String(r.id), r]))
  const setByEmail = new Map((settings || []).map((s) => [(s.email || '').toLowerCase(), s]))
  const rows: UserRow[] = []
  for (const e of emps || []) {
    const email = str(e.email) || str(e.personal_email)
    if (!email) continue
    const roleId = e.role_id ? String(e.role_id) : ''
    const role = roleId ? roleById.get(roleId) : undefined
    const st = setByEmail.get(email.toLowerCase())
    rows.push({
      id: String(e.id ?? email),
      email,
      name: nameFrom(e, email),
      roleName: roleNameFrom(role, !!roleId),
      caps: (role?.capabilities as Record<string, unknown>) || {},
      notifyDelivery: st ? st.notify_delivery : null,
      notifyApprovals: st ? st.notify_approvals : null,
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

export async function saveUserSettings(
  email: string,
  patch: { notify_delivery?: boolean | null; notify_approvals?: boolean | null },
  by: string,
): Promise<void> {
  const e = (email || '').trim().toLowerCase()
  if (!e) return
  await restFetch('POST', 'nuforce_user_settings?on_conflict=email', {
    body: { email: e, ...patch, updated_by: by || null, updated_at: new Date().toISOString() },
    upsert: true,
  })
}
