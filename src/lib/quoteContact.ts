import { restFetch } from './restFetch'

// Targeted contact update for a quote. Writes ONLY the contact + email inside
// data.qi — it never touches approval_status, stage, line items, or anything else.
// So changing who a quote is addressed to (e.g. after a bounce, or a typo) does
// NOT reset an approval or require a reopen. Used by the quote page's Contact
// editor and the "Bad contacts" widget. Callers gate on WRITES_ENABLED.

const enc = (v: string) => encodeURIComponent(v)

export async function updateQuoteContact(quoteId: string, contact: string, email: string): Promise<void> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?select=data&id=eq.${enc(quoteId)}&limit=1`)
  const data = (rows?.[0]?.data || {}) as Record<string, any>
  const nextData = { ...data, qi: { ...(data.qi || {}), contact, email } }
  await restFetch('PATCH', `quotes?id=eq.${enc(quoteId)}`, {
    body: { data: nextData, updated_at: new Date().toISOString() },
  })
}
