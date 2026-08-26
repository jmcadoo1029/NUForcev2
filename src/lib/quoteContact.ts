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

/** Resolve the bounce flag the resend-webhook dropped on a quote (flagged_by =
 *  resend_webhook). Used after fixing a bounced contact so the "bounced" flag
 *  clears. Best-effort; targets only the webhook flag, never a manual one. */
export async function resolveBounceFlag(quoteId: string, by: string): Promise<void> {
  await restFetch('PATCH', `quote_flags?quote_id=eq.${enc(quoteId)}&flagged_by=eq.resend_webhook&resolved=eq.false`, {
    body: { resolved: true, resolved_by: by || null, resolved_at: new Date().toISOString() },
  })
}
