import { restFetch } from './restFetch'

// Targeted contact update for a quote. Writes ONLY the contact + email inside
// data.qi — it never touches approval_status, stage, line items, or anything else.
// So changing who a quote is addressed to (e.g. after a bounce, or a typo) does
// NOT reset an approval or require a reopen. Used by the quote page's Contact
// editor and the "Bad contacts" widget. Callers gate on WRITES_ENABLED.

const enc = (v: string) => encodeURIComponent(v)

export async function updateQuoteContact(quoteId: string, contact: string, email: string, by = ''): Promise<void> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?select=data&id=eq.${enc(quoteId)}&limit=1`)
  const data = (rows?.[0]?.data || {}) as Record<string, any>
  const qi = (data.qi || {}) as Record<string, any>
  const oldName = String(qi.contact || '').trim()
  const oldEmail = String(qi.email || '').trim()
  const newName = String(contact || '').trim()
  const newEmail = String(email || '').trim()
  const nextData: Record<string, any> = { ...data, qi: { ...qi, contact, email } }
  // Log the change to chatter so a later follow-up can see who the quote originally
  // went to (e.g. "this was sent to X before"). A no-name side is shown as just the
  // email. Visible in the Feed (not an auto/system-suppressed entry).
  if (oldName !== newName || oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
    const who = (n: string, e: string) => (n ? `${n} <${e || 'no email'}>` : (e || '(none)'))
    const msg = `Contact changed: was ${who(oldName, oldEmail)}, now ${who(newName, newEmail)}`
    const prev: Array<Record<string, unknown>> = Array.isArray(data.chatterEntries) ? data.chatterEntries : []
    nextData.chatterEntries = [...prev, { by: by || 'system', at: new Date().toISOString(), msg }]
  }
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

/** Link a quote to a client/account: targeted write of data.qi.client_id + account
 *  (and the customer column, so search/account views align). Used by the inline
 *  "Link account" at close-won. Never touches approval, line items, or won state. */
export async function linkQuoteAccount(quoteId: string, clientId: string, accountName: string, billTo?: string, billToCity?: string): Promise<void> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?select=data&id=eq.${enc(quoteId)}&limit=1`)
  const data = (rows?.[0]?.data || {}) as Record<string, any>
  const qi = { ...(data.qi || {}), client_id: clientId, account: accountName }
  if (billTo !== undefined) qi.billTo = billTo
  if (billToCity !== undefined) qi.billToCity = billToCity
  await restFetch('PATCH', `quotes?id=eq.${enc(quoteId)}`, {
    body: { data: { ...data, qi }, customer: accountName, updated_at: new Date().toISOString() },
  })
}

/** Manually mark a contact's address invalid (same field the resend-webhook sets
 *  on a hard bounce), for a contact you already KNOW is bad — e.g. you heard they
 *  left the company. Flags every contact row with that address so it lands in the
 *  Bad Contacts widget (and won't be re-emailed). Match is by email, case-folded. */
export async function flagContactInvalid(email: string, reason: string): Promise<void> {
  const e = email.trim()
  if (!e) return
  const body = { email_invalid: true, email_invalid_at: new Date().toISOString(), email_invalid_reason: reason || 'manually flagged' }
  // Case-insensitive match: quote emails are lowercased, but the stored contact may
  // be mixed-case — an exact (eq) match would silently miss and the flag wouldn't stick.
  const patched = await restFetch<Array<{ email: string }>>('PATCH', `contacts?email=ilike.${enc(e)}`, {
    body,
    returnRepresentation: true,
  }).catch(() => [] as Array<{ email: string }>)
  if (Array.isArray(patched) && patched.length > 0) return
  // No contact row for this address — it only ever lived on quotes. Record one so the
  // address shows up in Bad Contacts and is excluded from Re-engage going forward.
  // Best-effort: if the contacts schema won't take a bare row, we leave it (the caller
  // still hides it for this session).
  try {
    await restFetch('POST', 'contacts', { body: { email: e.toLowerCase(), ...body } })
  } catch { /* no-op — flag just won't persist for a non-directory address */ }
}

/** Clear a stale "bad address" flag — the address is reachable after all. Sets
 *  email_invalid back to false (the ONLY thing in the app that does), so a contact
 *  that bounced once (or a transient blip) doesn't stay flagged forever. Called
 *  automatically after a successful send, and by the Bad Contacts "clear" action.
 *  Case-insensitive match; only touches rows currently flagged. Best-effort. */
export async function clearContactInvalid(email: string): Promise<void> {
  const e = email.trim()
  if (!e) return
  await restFetch('PATCH', `contacts?email=ilike.${enc(e)}&email_invalid=eq.true`, {
    body: { email_invalid: false, email_invalid_at: null, email_invalid_reason: null },
  })
}
