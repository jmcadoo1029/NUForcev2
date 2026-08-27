import { restFetch } from './restFetch'
import { FN_BASE, REST_APIKEY } from './config'
import { getAccessToken } from './auth'

// Mass Emails: recipients (all contacts, or "everyone we quoted product code X"),
// reusable templates, sending (via the mass-email edge function), and history +
// delivery metrics. Managers-only feature. Bounces here never flag Bad Contacts.

export interface Recipient { email: string; name: string }
export interface EmailTemplate { id: string; name: string; subject: string; body: string }
export interface MassEmailRow { id: string; subject: string; audience: string | null; sent_by: string | null; sent_at: string | null; recipient_count: number; sent_count: number; failed_count: number }
export interface MassEmailMetrics { delivered: number; bounced: number; complained: number; opened: number; sent: number; failed: number; total: number }

const dedupe = (rows: Recipient[]): Recipient[] => {
  const seen = new Set<string>()
  const out: Recipient[] = []
  for (const r of rows) {
    const email = (r.email || '').trim().toLowerCase()
    if (!email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push({ email: r.email.trim(), name: (r.name || '').trim() })
  }
  return out
}

/** Every contact in the shared directory with a usable email. */
export async function fetchAllContacts(): Promise<Recipient[]> {
  const rows = await restFetch<Array<{ first_name: string | null; last_name: string | null; email: string | null }>>(
    'GET',
    `contacts?select=first_name,last_name,email&email=not.is.null&order=last_name&limit=5000`,
  )
  return dedupe((rows || []).map((r) => ({ email: r.email || '', name: [r.first_name, r.last_name].filter(Boolean).join(' ') })))
}

/**
 * Everyone we've ever quoted a given product code to (from quote line items),
 * optionally narrowed to quotes created within a date window. `from`/`to` are
 * ISO strings (YYYY-MM-DD or a full timestamp) compared against quotes.created_at
 * — the DB-stamped date the quote was first written.
 */
export async function fetchContactsByProductCode(code: string, range?: { from?: string; to?: string }): Promise<Recipient[]> {
  const c = code.trim()
  if (!c) return []
  const filter = encodeURIComponent(JSON.stringify([{ code: c }]))
  let path = `quotes?select=em:data->qi->>email,nm:data->qi->>contact&line_items=cs.${filter}`
  if (range?.from) path += `&created_at=gte.${encodeURIComponent(range.from)}`
  if (range?.to) path += `&created_at=lte.${encodeURIComponent(range.to)}`
  path += `&limit=5000`
  const rows = await restFetch<Array<{ em: string | null; nm: string | null }>>('GET', path)
  return dedupe((rows || []).map((r) => ({ email: r.em || '', name: r.nm || '' })))
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
export interface CampaignOption { id: string; name: string }

/** Campaigns list for the audience dropdown (id + name only). */
export async function fetchCampaignOptions(): Promise<CampaignOption[]> {
  const rows = await restFetch<Array<{ id: string; name: string | null }>>('GET', `campaigns?select=id,name&order=name&limit=500`)
  return (rows || []).map((r) => ({ id: r.id, name: (r.name || '').trim() || '(unnamed campaign)' }))
}

/** Every contact belonging to an account (client), as recipients (deduped). */
export async function fetchContactsByAccount(clientId: string): Promise<Recipient[]> {
  if (!clientId) return []
  const rows = await restFetch<Array<{ first_name: string | null; last_name: string | null; email: string | null }>>(
    'GET',
    `contacts?select=first_name,last_name,email&client_id=eq.${encodeURIComponent(clientId)}&order=last_name&limit=5000`,
  )
  return dedupe((rows || []).map((r) => ({ email: r.email || '', name: [r.first_name, r.last_name].filter(Boolean).join(' ') })))
}

/** The contacts belonging to a campaign, as email recipients (deduped). */
export async function fetchContactsByCampaign(campaignId: string): Promise<Recipient[]> {
  if (!campaignId) return []
  const rows = await restFetch<Array<{ contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }>>(
    'GET',
    `campaign_contacts?select=contacts(first_name,last_name,email)&campaign_id=eq.${encodeURIComponent(campaignId)}&limit=5000`,
  )
  return dedupe(
    (rows || [])
      .map((r) => r.contacts)
      .filter((c): c is { first_name: string | null; last_name: string | null; email: string | null } => !!c)
      .map((c) => ({ email: c.email || '', name: [c.first_name, c.last_name].filter(Boolean).join(' ') })),
  )
}

// ── Templates ────────────────────────────────────────────────────────────────
export async function fetchTemplates(): Promise<EmailTemplate[]> {
  return (await restFetch<EmailTemplate[]>('GET', `email_templates?select=id,name,subject,body&order=name&limit=200`)) || []
}
export async function saveTemplate(name: string, subject: string, body: string, by: string): Promise<void> {
  await restFetch('POST', 'email_templates', { body: { name, subject, body, created_by: by }, returnRepresentation: false })
}
export async function deleteTemplate(id: string): Promise<void> {
  await restFetch('DELETE', `email_templates?id=eq.${encodeURIComponent(id)}`)
}

// ── Send ─────────────────────────────────────────────────────────────────────
export interface MassSendResult { ok: boolean; massId?: string; total?: number; sent?: number; failed?: number; error?: string; notDeployed?: boolean }

export async function sendMassEmail(input: { subject: string; body: string; audience: string; recipients: Recipient[] }): Promise<MassSendResult> {
  const token = getAccessToken()
  if (!token) return { ok: false, error: 'No active session.' }
  let res: Response
  try {
    res = await fetch(`${FN_BASE}/mass-email`, {
      method: 'POST',
      headers: { apikey: REST_APIKEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (res.status === 404) return { ok: false, notDeployed: true, error: 'mass-email function not deployed' }
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `Send failed (${res.status})` }
  return { ok: true, massId: body.massId, total: body.total, sent: body.sent, failed: body.failed }
}

// ── History + metrics ────────────────────────────────────────────────────────
export async function fetchMassEmails(): Promise<MassEmailRow[]> {
  return (await restFetch<MassEmailRow[]>('GET', `mass_emails?select=id,subject,audience,sent_by,sent_at,recipient_count,sent_count,failed_count&order=sent_at.desc&limit=100`)) || []
}

/** Delivery metrics for one blast, tallied from its recipient rows. */
export async function fetchMassEmailMetrics(massId: string): Promise<MassEmailMetrics> {
  const rows = await restFetch<Array<{ status: string | null }>>('GET', `mass_email_recipients?select=status&mass_email_id=eq.${encodeURIComponent(massId)}&limit=10000`)
  const m: MassEmailMetrics = { delivered: 0, bounced: 0, complained: 0, opened: 0, sent: 0, failed: 0, total: 0 }
  for (const r of rows || []) {
    m.total++
    const s = r.status || ''
    if (s === 'delivered') m.delivered++
    else if (s === 'bounced') m.bounced++
    else if (s === 'complained') m.complained++
    else if (s === 'opened') m.opened++
    else if (s === 'failed') m.failed++
    else m.sent++
  }
  return m
}
