import { restFetch } from './restFetch'

// Read-only directory lookups against the shared clients + contacts tables (the
// same ones NUWorkspace uses). Powers account linking and contact selection on
// the quote. All fail soft to [] so a lookup never breaks the form.

export interface ClientRow {
  id: string
  name: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

export interface PersonRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  client_id?: string | null
  client_name?: string | null
}

const enc = encodeURIComponent

/** Build an AND-of-ORs ilike filter: every word must match some field. */
function wordFilter(term: string, fields: string[]): string {
  const words = term.trim().split(/\s+/).slice(0, 4)
  const groups = words.map((w) => {
    const p = enc(`*${w}*`)
    return `or(${fields.map((f) => `${f}.ilike.${p}`).join(',')})`
  })
  return `and=(${groups.join(',')})`
}

/** Search clients by name. */
export async function searchClients(term: string, limit = 20): Promise<ClientRow[]> {
  const t = term.trim()
  if (!t) return []
  try {
    return (await restFetch<ClientRow[]>('GET', `clients?select=id,name,address,city,state,zip&name=ilike.${enc('*' + t + '*')}&order=name&limit=${limit}`)) || []
  } catch {
    return []
  }
}

export interface ContactInfoRow { email: string; phone: string; title: string; name: string }

/** Contact detail (phone/title) for a client's people — for the account view. */
export async function fetchClientContactInfo(clientId: string): Promise<ContactInfoRow[]> {
  if (!clientId) return []
  try {
    const rows = await restFetch<Array<{ first_name: string | null; last_name: string | null; email: string | null; phone: string | null; title: string | null }>>(
      'GET',
      `contacts?select=first_name,last_name,email,phone,title&client_id=eq.${enc(clientId)}&order=last_name&limit=1000`,
    )
    return (rows || []).map((r) => ({ email: (r.email || '').trim(), phone: (r.phone || '').trim(), title: (r.title || '').trim(), name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() }))
  } catch {
    return []
  }
}

/** All contacts for a linked client (the account's contact list). */
export async function fetchClientContacts(clientId: string): Promise<PersonRow[]> {
  if (!clientId) return []
  try {
    return (await restFetch<PersonRow[]>('GET', `contacts?select=id,first_name,last_name,email,client_id&client_id=eq.${enc(clientId)}&order=last_name`)) || []
  } catch {
    return []
  }
}

/** Search contacts across all accounts by name or email; includes client name. */
export async function searchPeople(term: string, limit = 20): Promise<PersonRow[]> {
  const t = term.trim()
  if (!t) return []
  try {
    const rows =
      (await restFetch<Array<PersonRow & { clients?: { name?: string | null } | null }>>(
        'GET',
        `contacts?select=id,first_name,last_name,email,client_id,clients(name)&${wordFilter(t, ['first_name', 'last_name', 'email'])}&limit=${limit}`,
      )) || []
    return rows.map((r) => ({ id: r.id, first_name: r.first_name, last_name: r.last_name, email: r.email, client_id: r.client_id, client_name: r.clients?.name ?? null }))
  } catch {
    return []
  }
}

export const personName = (p: PersonRow): string => [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
