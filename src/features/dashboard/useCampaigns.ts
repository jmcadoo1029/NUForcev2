import { restFetch } from '../../lib/restFetch'

// Campaigns + their contacts (read-only), ported from Classic.

export interface Campaign {
  id: string
  name: string | null
  description: string | null
  created_at: string | null
}
export interface CampaignContact {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  client_id?: string | null
  client_name?: string | null
}

export interface AccountQuote {
  id: string
  opportunity: string | null
  customer: string | null
  stage: string | null
  total: number | null
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  return restFetch<Campaign[]>('GET', 'campaigns?select=id,name,description,created_at&order=created_at.desc')
}

export async function fetchCampaignContacts(campaignId: string): Promise<CampaignContact[]> {
  const rows =
    (await restFetch<{ contacts: (CampaignContact & { clients?: { name?: string | null } | null }) | null }[]>(
      'GET',
      `campaign_contacts?select=contacts(id,first_name,last_name,email,client_id,clients(name))&campaign_id=eq.${encodeURIComponent(campaignId)}`,
    )) || []
  return rows
    .map((r) => r.contacts)
    .filter((c): c is CampaignContact & { clients?: { name?: string | null } | null } => !!c)
    .map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email, client_id: c.client_id, client_name: c.clients?.name ?? null }))
}

/**
 * Quotes whose customer matches any of the given account names (fuzzy). One query
 * PER account (not a single or=()), so a name with a comma/paren can't break the
 * filter and no single global row cap crowds out an account. Merged + deduped by id.
 */
export async function fetchAccountQuotes(names: string[]): Promise<AccountQuote[]> {
  const uniq = Array.from(new Set(names.map((n) => (n || '').trim()).filter(Boolean)))
  if (!uniq.length) return []
  const perAccount = await Promise.all(
    uniq.map(async (n) => {
      try {
        return (await restFetch<AccountQuote[]>('GET', `quotes?select=id,opportunity,customer,stage,total&customer=ilike.${encodeURIComponent('*' + n + '*')}&order=updated_at.desc&limit=100`)) || []
      } catch {
        return []
      }
    }),
  )
  const byId = new Map<string, AccountQuote>()
  perAccount.flat().forEach((q) => { if (q && q.id != null) byId.set(String(q.id), q) })
  return Array.from(byId.values())
}

// ── Writes (ported from Classic). Callers gate on WRITES_ENABLED. ────────────

/** Create a campaign; returns the new row. */
export async function createCampaign(name: string, description: string): Promise<Campaign | null> {
  const rows = await restFetch<Campaign[]>('POST', 'campaigns?select=id,name,description,created_at', {
    body: { name: name.trim(), description: description.trim() || null },
    returnRepresentation: true,
  })
  return rows?.[0] || null
}

/** Delete a campaign. Memberships cascade; contact records are untouched. */
export async function deleteCampaign(id: string): Promise<void> {
  await restFetch('DELETE', `campaigns?id=eq.${encodeURIComponent(id)}`)
}

/** Search contacts by name or email (for adding to a campaign). */
export async function searchContacts(term: string, limit = 25): Promise<CampaignContact[]> {
  const t = term.trim()
  if (!t) return []
  // Split on whitespace: every word must match some name/email field (AND of ORs).
  // PostgREST form: and=(or(...word1...),or(...word2...))
  const words = t.split(/\s+/).slice(0, 4)
  const groups = words.map((w) => {
    const enc = encodeURIComponent(`*${w}*`)
    return `or(first_name.ilike.${enc},last_name.ilike.${enc},email.ilike.${enc})`
  })
  const q = `and=(${groups.join(',')})`
  try {
    return (await restFetch<CampaignContact[]>('GET', `contacts?select=id,first_name,last_name,email&${q}&limit=${limit}`)) || []
  } catch {
    return []
  }
}

/** Add a contact to a campaign (idempotent via the table's unique membership). */
export async function addContactToCampaign(campaignId: string, contactId: string): Promise<void> {
  await restFetch('POST', 'campaign_contacts', { body: { campaign_id: campaignId, contact_id: contactId } })
}

/** Remove a contact's membership from a campaign (the contact itself stays). */
export async function removeContactFromCampaign(campaignId: string, contactId: string): Promise<void> {
  await restFetch('DELETE', `campaign_contacts?campaign_id=eq.${encodeURIComponent(campaignId)}&contact_id=eq.${encodeURIComponent(contactId)}`)
}
