import { restFetch } from './restFetch'

// Account lookup + account history, ported from Classic.

/** Distinct customer names matching a search term (case-insensitive). */
export async function searchAccounts(term: string): Promise<string[]> {
  const t = term.trim()
  if (!t) return []
  const rows =
    (await restFetch<{ customer: string | null }[]>('GET', `quotes?select=customer&customer=ilike.${encodeURIComponent('*' + t + '*')}&limit=200`)) || []
  const set = new Set<string>()
  rows.forEach((r) => {
    if (r.customer) set.add(r.customer)
  })
  return Array.from(set).sort().slice(0, 30)
}

export interface AccountRow {
  id: string
  opportunity: string | null
  revision: string | null
  stage: string | null
  total: number | null
  contact?: string | null
  email?: string | null
  line_items?: Array<{ code?: string | null; label?: string | null }> | null
}

/** Every quote for one exact account name (paginated). */
export async function fetchAccountQuotes(name: string): Promise<AccountRow[]> {
  let all: AccountRow[] = []
  let from = 0
  const batch = 500
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows =
      (await restFetch<AccountRow[]>(
        'GET',
        `quotes?select=id,opportunity,revision,stage,total,contact:data->qi->>contact,email:data->qi->>email,line_items&customer=eq.${encodeURIComponent(name)}&order=opportunity.desc&limit=${batch}&offset=${from}`,
      )) || []
    all = all.concat(rows)
    if (rows.length < batch) break
    from += batch
  }
  return all
}

// Re-exported from lib/opp (kept here so existing importers don't churn).
export { yearOfOpp } from './opp'

export interface ClientInfo {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

/** Client address for an account name, or null if there's no matching client. */
export async function fetchClient(name: string): Promise<ClientInfo | null> {
  const rows =
    (await restFetch<ClientInfo[]>('GET', `clients?select=address,city,state,zip&name=eq.${encodeURIComponent(name)}&limit=1`)) || []
  return rows[0] || null
}

/** "123 Main St, Trenton, NJ 08611" from a client record (skips missing parts). */
export function formatClientAddress(c: ClientInfo | null): string {
  if (!c) return ''
  const cityState = [c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [c.address, cityState].filter(Boolean).join(', ')
}

