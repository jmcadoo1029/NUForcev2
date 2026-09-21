import { restFetch, restFetchAll } from './restFetch'

// Users area (More → Users, managers only). Lists only ACTUAL NUForce users — people
// with a NUForce role, or who've submitted/approved a quote — not the whole shared
// workspace. Reads the shared employees + permission_roles (never writes them) and
// reads/writes per-user NUForce prefs in our own nuforce_user_settings table.
//
// Toggle defaults reflect "who gets them today":
//   deliveryDefault  = true only for active senders (people who submit quotes) — the
//                      folks a delivery alert can actually reach right now.
//   approvalsDefault = true for managers and active users (roughly who's in the
//                      approval loop today).
// A NULL setting means "use that default"; an explicit boolean is a manager override.

export interface UserRow {
  id: string
  email: string
  name: string
  roleName: string
  caps: Record<string, unknown>
  deliveryDefault: boolean
  approvalsDefault: boolean
  notifyDelivery: boolean | null // null = use deliveryDefault
  notifyApprovals: boolean | null // null = use approvalsDefault
  managerDefault: boolean // role default for page access (manager/view-only can see)
  features: Record<string, boolean> // per-user page-access overrides; key absent = use managerDefault
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const lc = (v: unknown) => str(v).toLowerCase()

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
const isNuforceRole = (caps: Record<string, unknown>) => Object.keys(caps || {}).some((k) => k.startsWith('nuforce_') && (caps as Record<string, unknown>)[k])

// Human-readable list of what a role grants — shown read-only so the baseline is clear.
export function capsSummary(caps: Record<string, unknown>): string[] {
  if (caps['nuforce_approve_quotes']) return ['Sees the Manager dashboard', 'Can approve / reject quotes', 'Full manager tools (Mass Emails, Scheduled, etc.)']
  if (caps['nuforce_view_dashboard']) return ['Sees the Manager dashboard (view-only)', 'No approve / edit authority']
  return ['Standard user — builds and sends their own quotes', 'No Manager dashboard']
}

/** Effective on/off: the override if set, else the default. */
export const effective = (override: boolean | null, def: boolean): boolean => (override === null || override === undefined ? def : override)

export async function fetchUsers(): Promise<UserRow[]> {
  const [emps, roles, settings, quotes] = await Promise.all([
    restFetchAll<Record<string, unknown>>('employees?select=*&order=email,id').catch(() => [] as Record<string, unknown>[]),
    restFetch<Record<string, unknown>[]>('GET', 'permission_roles?select=*&limit=200').catch(() => [] as Record<string, unknown>[]),
    restFetch<{ email: string; notify_delivery: boolean | null; notify_approvals: boolean | null; features: Record<string, unknown> | null }[]>('GET', 'nuforce_user_settings?select=email,notify_delivery,notify_approvals,features&limit=5000').catch(() => []),
    restFetchAll<{ submitted_by: string | null; approved_by: string | null }>('quotes?select=submitted_by,approved_by&order=id').catch(() => [] as { submitted_by: string | null; approved_by: string | null }[]),
  ])

  // Active NUForce participants, from real quote activity.
  const submitters = new Set<string>() // people who submit quotes ≈ who sends them (gets delivery alerts today)
  const active = new Set<string>() // anyone who has submitted OR approved a quote
  for (const q of quotes || []) {
    const sb = lc(q.submitted_by); if (sb.includes('@')) { submitters.add(sb); active.add(sb) }
    const ab = lc(q.approved_by); if (ab.includes('@')) active.add(ab)
  }
  const roleById = new Map((roles || []).map((r) => [String(r.id), r]))
  const nuforceRoleIds = new Set((roles || []).filter((r) => isNuforceRole((r.capabilities as Record<string, unknown>) || {})).map((r) => String(r.id)))
  const setByEmail = new Map((settings || []).map((s) => [(s.email || '').toLowerCase(), s]))

  const rows: UserRow[] = []
  for (const e of emps || []) {
    const email = str(e.email) || str(e.personal_email)
    if (!email) continue
    const emailLc = email.toLowerCase()
    const personalLc = lc(e.personal_email)
    const roleId = e.role_id ? String(e.role_id) : ''
    const isManager = !!roleId && nuforceRoleIds.has(roleId)
    const isSender = submitters.has(emailLc) || (!!personalLc && submitters.has(personalLc))
    const isActive = active.has(emailLc) || (!!personalLc && active.has(personalLc))
    // NUForce users only — everyone else in the shared workspace is dropped.
    if (!isManager && !isActive) continue

    const role = roleId ? roleById.get(roleId) : undefined
    const st = setByEmail.get(emailLc)
    const caps = (role?.capabilities as Record<string, unknown>) || {}
    // Page-access default follows the role: managers (approve) and view-only roles can
    // see the manager pages; everyone else can't — unless a per-user override says so.
    const managerDefault = !!(caps['nuforce_approve_quotes'] || caps['nuforce_view_dashboard'])
    const rawFeat = (st && st.features && typeof st.features === 'object') ? (st.features as Record<string, unknown>) : {}
    const features: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(rawFeat)) if (typeof v === 'boolean') features[k] = v
    rows.push({
      id: String(e.id ?? email),
      email,
      name: nameFrom(e, email),
      roleName: roleNameFrom(role, !!roleId),
      caps,
      deliveryDefault: isSender, // on for active senders — who gets delivery alerts today
      approvalsDefault: isManager || isActive,
      notifyDelivery: st ? st.notify_delivery : null,
      notifyApprovals: st ? st.notify_approvals : null,
      managerDefault,
      features,
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

/** Set (or clear) a single page-access override for a user, preserving the rest of the
 *  features map. value=null removes the key so the feature falls back to the role default.
 *  Read-merge-write because the whole `features` jsonb is stored as one column. */
export async function saveUserFeature(
  email: string,
  name: string,
  value: boolean | null,
  by: string,
): Promise<void> {
  const e = (email || '').trim().toLowerCase()
  if (!e || !name) return
  const rows = await restFetch<{ features: Record<string, unknown> | null }[]>('GET', `nuforce_user_settings?select=features&email=eq.${encodeURIComponent(e)}&limit=1`).catch(() => [])
  const cur = (rows?.[0]?.features && typeof rows[0].features === 'object') ? { ...(rows[0].features as Record<string, unknown>) } : {}
  if (value === null) delete cur[name]
  else cur[name] = value
  await restFetch('POST', 'nuforce_user_settings?on_conflict=email', {
    body: { email: e, features: cur, updated_by: by || null, updated_at: new Date().toISOString() },
    upsert: true,
  })
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
