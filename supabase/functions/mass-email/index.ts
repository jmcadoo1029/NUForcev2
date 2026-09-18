// Supabase Edge Function: mass-email
// Sends a NUForce mass email (marketing/announcement) to many recipients through
// Resend's batch API, records the blast + per-recipient rows for history & metrics.
//
// Deploy:  supabase functions deploy mass-email --no-verify-jwt
// Verify JWT MUST be OFF (called from the browser; the CORS preflight has no auth
// header). This handles OPTIONS first and verifies the JWT itself below.
//
// Secrets (all auto-injected except RESEND_API_KEY, an existing project secret):
//   RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Bounces from these sends do NOT flag contacts as bad: the resend-webhook checks
// mass_email_recipients first and, on a match, updates metrics only — it never
// touches the contacts table for a mass-email message.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const RESEND_BATCH = 'https://api.resend.com/emails/batch'
const SENDING_DOMAIN = 'mail.nulabs.com'
const BATCH_SIZE = 100

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const env = (k: string) => Deno.env.get(k) || ''
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const localPart = (email: string) => (email.split('@')[0] || 'sales').trim() || 'sales'
const firstNameOf = (name: string) => (name || '').trim().split(/\s+/)[0] || ''

// HMAC-SHA256 hex, keyed by a server-only secret — signs unsubscribe links so a
// recipient can only opt THEMSELVES out (the token can't be forged for other addresses).
async function hmacHex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
// The CAN-SPAM footer appended to every marketing send, with the recipient's one-click
// unsubscribe link.
function escHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}
// HTML version of the body so "unsubscribe here" is a real link (nicer than a bare URL).
function htmlBody(textBody: string, url: string): string {
  const safe = escHtml(textBody).replace(/\n/g, '<br>')
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2430">`
    + safe
    + `<br><br><span style="color:#98a2b3;font-size:12px">You're receiving this because you've done business with NU Laboratories, Inc. (312 Old Allerton Rd., Annandale, NJ 08801). If you'd prefer not to receive these emails, <a href="${url}" style="color:#98a2b3">unsubscribe here</a>.</span></div>`
}
function unsubFooter(url: string): string {
  return `\n\n--\nYou're receiving this because you've done business with NU Laboratories, Inc. (312 Old Allerton Rd., Annandale, NJ 08801). If you'd prefer not to receive these emails, unsubscribe here:\n${url}`
}

interface Recipient { email: string; name?: string }
interface Req { subject: string; body: string; audience?: string; recipients: Recipient[] }

/** Fill {first name} / {firstName} (case-insensitive) with the recipient's first name. */
function fill(body: string, name: string): string {
  const fn = firstNameOf(name)
  return body.replace(/\{\s*first[\s_]?name\s*\}/gi, fn)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const SUPABASE_URL = env('SUPABASE_URL')
  const ANON = env('SUPABASE_ANON_KEY')
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = env('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json(500, { ok: false, error: 'RESEND_API_KEY is not configured.' })

  // 1) Verify the caller's JWT + resolve their email.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { ok: false, error: 'Missing bearer token.' })
  let userEmail = ''
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })
    if (!ures.ok) return json(401, { ok: false, error: 'Invalid or expired session.' })
    userEmail = str((await ures.json())?.email)
  } catch { return json(401, { ok: false, error: 'Could not verify session.' }) }
  if (!userEmail) return json(401, { ok: false, error: 'No email on the session user.' })

  // 2) Parse + validate.
  let payload: Req
  try { payload = await req.json() } catch { return json(400, { ok: false, error: 'Invalid JSON body.' }) }
  const subject = str(payload.subject)
  const body = String(payload.body || '')
  if (!subject) return json(400, { ok: false, error: 'Subject is required.' })
  if (!body) return json(400, { ok: false, error: 'Body is required.' })
  const recipients = (payload.recipients || [])
    .map((r) => ({ email: str(r.email).toLowerCase(), name: str(r.name) }))
    .filter((r) => r.email.includes('@'))
  // De-dupe by email.
  const seen = new Set<string>()
  const list = recipients.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)))
  if (!list.length) return json(400, { ok: false, error: 'No valid recipients.' })

  const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

  // Compliance: drop anyone on the unsubscribe list. If the check itself fails we
  // ABORT rather than risk emailing someone who opted out.
  let optedOut = new Set<string>()
  try {
    const ores = await fetch(`${SUPABASE_URL}/rest/v1/email_optouts?select=email`, { headers: svcHeaders })
    if (!ores.ok) throw new Error('optout query failed')
    const orows = await ores.json()
    if (Array.isArray(orows)) optedOut = new Set(orows.map((r: any) => str(r.email).toLowerCase()))
  } catch {
    return json(500, { ok: false, error: 'Could not check the unsubscribe list — send aborted.' })
  }
  const sendable = list.filter((r) => !optedOut.has(r.email))
  if (!sendable.length) return json(400, { ok: false, error: 'Every recipient has unsubscribed — nothing to send.' })

  // 3) Resolve the sender (from/reply-to) from the employee record.
  let emp: any = null
  try {
    const enc = encodeURIComponent(userEmail)
    const eres = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=*&or=(email.eq.${enc},personal_email.eq.${enc})&limit=1`, { headers: svcHeaders })
    if (eres.ok) emp = (await eres.json())?.[0] || null
  } catch { emp = null }
  const realEmail = str(emp?.email) || userEmail
  const fromName = str(emp?.name) || [str(emp?.first_name), str(emp?.last_name)].filter(Boolean).join(' ') || 'NU Laboratories'
  const fromEmail = `${localPart(realEmail)}@${SENDING_DOMAIN}`

  // 4) Create the blast header.
  let massId = ''
  try {
    const cres = await fetch(`${SUPABASE_URL}/rest/v1/mass_emails`, {
      method: 'POST', headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ subject, body, audience: str(payload.audience) || null, sent_by: userEmail, recipient_count: sendable.length }),
    })
    massId = (await cres.json())?.[0]?.id || ''
  } catch { /* ignore */ }

  // 5) Send in batches; record each recipient.
  let sent = 0, failed = 0
  for (let i = 0; i < sendable.length; i += BATCH_SIZE) {
    const chunk = sendable.slice(i, i + BATCH_SIZE)
    const unsubs = await Promise.all(chunk.map(async (r) => {
      const tok = await hmacHex(r.email, SERVICE)
      return `${SUPABASE_URL}/functions/v1/unsubscribe?e=${encodeURIComponent(r.email)}&t=${tok}`
    }))
    const emails = chunk.map((r, k) => ({
      from: `${fromName} <${fromEmail}>`,
      to: [r.email],
      reply_to: realEmail,
      subject,
      text: fill(body, r.name || '') + unsubFooter(unsubs[k]),
      html: htmlBody(fill(body, r.name || ''), unsubs[k]),
      headers: {
        'List-Unsubscribe': `<mailto:${realEmail}?subject=unsubscribe>, <${unsubs[k]}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }))
    let ids: (string | null)[] = chunk.map(() => null)
    try {
      const rres = await fetch(RESEND_BATCH, { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(emails) })
      const rbody = await rres.json().catch(() => ({}))
      if (rres.ok && Array.isArray(rbody?.data)) ids = rbody.data.map((d: any) => d?.id || null)
    } catch { /* whole chunk fails → ids stay null */ }
    const rows = chunk.map((r, j) => {
      const ok = !!ids[j]
      if (ok) sent++; else failed++
      return { mass_email_id: massId || null, email: r.email, name: r.name || null, resend_id: ids[j], status: ok ? 'sent' : 'failed' }
    })
    try { await fetch(`${SUPABASE_URL}/rest/v1/mass_email_recipients`, { method: 'POST', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(rows) }) } catch { /* best-effort */ }
  }

  // 6) Roll up counts.
  if (massId) {
    try { await fetch(`${SUPABASE_URL}/rest/v1/mass_emails?id=eq.${massId}`, { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ sent_count: sent, failed_count: failed }) }) } catch { /* ignore */ }
  }

  return json(200, { ok: true, massId, total: sendable.length, sent, failed })
})
