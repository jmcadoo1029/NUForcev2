import { restFetch } from './restFetch'
import { getSessionEmail } from './auth'
import { prettifyEmail } from './text'

// The signed-in employee, resolved from the shared session email against the
// employees table (email is the join key — no auth_user_id, per the shared-auth
// design). Used to fill the sender's name in email templates and as fromName on
// a send. Fails soft: if the row can't be resolved we fall back to a prettified
// email so a send is never blocked on this lookup.

export interface Self {
  email: string
  firstName: string
  lastName: string
  name: string // best display name available
}

let _cache: Self | null = null

// The employees schema isn't fully known (Classic only ever read id/role_id), so
// we select the whole row and read whichever name-ish fields are present, in
// preference order, rather than naming columns that might not exist.
type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function nameFrom(emp: Row | undefined, email: string): { firstName: string; lastName: string; name: string } {
  const first = str(emp?.first_name) || str(emp?.firstname) || str(emp?.given_name)
  const last = str(emp?.last_name) || str(emp?.lastname) || str(emp?.family_name)
  const full = str(emp?.name) || str(emp?.full_name) || str(emp?.display_name)
  if (first || last) return { firstName: first, lastName: last, name: [first, last].filter(Boolean).join(' ') }
  if (full) {
    const parts = full.split(/\s+/)
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), name: full }
  }
  const pretty = prettifyEmail(email)
  const parts = pretty.split(/\s+/)
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), name: pretty }
}

/** Resolve the current employee (cached). Never throws. */
export async function fetchSelf(): Promise<Self> {
  if (_cache) return _cache
  const email = getSessionEmail() || ''
  const safe = encodeURIComponent(email)
  let emp: Row | undefined
  try {
    const rows = await restFetch<Row[]>('GET', `employees?select=*&or=(email.eq.${safe},personal_email.eq.${safe})&limit=1`)
    emp = rows?.[0]
  } catch {
    emp = undefined
  }
  const n = nameFrom(emp, email)
  _cache = { email, ...n }
  return _cache
}
