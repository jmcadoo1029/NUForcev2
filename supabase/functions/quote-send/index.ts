// Supabase Edge Function: quote-send
// Sends NUForce quote + follow-up emails through Resend and writes a compliance
// audit row. See docs/quote-send-function-handoff.md for the full contract.
//
// Secrets/env (all injected by Supabase except RESEND_API_KEY, which is an
// existing project secret):
//   RESEND_API_KEY            — Resend API key (project secret; DO NOT hardcode)
//   SUPABASE_URL              — auto
//   SUPABASE_ANON_KEY         — auto (used to verify the caller's JWT)
//   SUPABASE_SERVICE_ROLE_KEY — auto (used for the server-side audit insert)
//
// Deploy:  supabase functions deploy quote-send --no-verify-jwt
// Verify JWT MUST be OFF (it's called from the browser; the CORS preflight has no
// auth header, so the platform gate would 401 it → "Failed to fetch"). This
// function handles OPTIONS first and verifies the JWT itself below, so nothing is
// left unauthenticated.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

// Send is open to all authenticated NUForce users for now (Jordan's rollout
// decision). Flip to true to require the nuforce_send_quotes capability.
const ENFORCE_SEND_CAPABILITY = false

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SENDING_DOMAIN = 'mail.nulabs.com' // verified Resend send-only subdomain

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

interface SendReq {
  kind: 'quote' | 'follow_up'
  quoteId: string
  opportunity?: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  fromName?: string
  attachments?: Array<{ filename: string; contentBase64: string; mime?: string }>
}

const env = (k: string) => Deno.env.get(k) || ''
const localPart = (email: string) => (email.split('@')[0] || 'quotes').trim() || 'quotes'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const SUPABASE_URL = env('SUPABASE_URL')
  const ANON = env('SUPABASE_ANON_KEY')
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = env('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json(500, { ok: false, error: 'RESEND_API_KEY is not configured on this project.' })

  // 1) Verify the caller's JWT and resolve their email.
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { ok: false, error: 'Missing bearer token.' })
  let userEmail = ''
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })
    if (!ures.ok) return json(401, { ok: false, error: 'Invalid or expired session.' })
    const user = await ures.json()
    userEmail = str(user?.email)
  } catch {
    return json(401, { ok: false, error: 'Could not verify session.' })
  }
  if (!userEmail) return json(401, { ok: false, error: 'No email on the session user.' })

  // 2) Parse + validate the request.
  let payload: SendReq
  try {
    payload = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' })
  }
  const to = (payload.to || []).map(str).filter(Boolean)
  const cc = (payload.cc || []).map(str).filter(Boolean)
  if (!to.length) return json(400, { ok: false, error: 'At least one recipient is required.' })
  if (!str(payload.subject)) return json(400, { ok: false, error: 'Subject is required.' })
  if (!str(payload.quoteId)) return json(400, { ok: false, error: 'quoteId is required.' })

  // 3) Resolve the employee (service role) for from/reply-to + optional capability.
  const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
  let emp: any = null
  try {
    const enc = encodeURIComponent(userEmail)
    const eres = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=*&or=(email.eq.${enc},personal_email.eq.${enc})&limit=1`, { headers: svcHeaders })
    if (eres.ok) emp = (await eres.json())?.[0] || null
  } catch {
    emp = null
  }
  if (!emp) return json(403, { ok: false, error: 'No employee record for this user.' })

  // Optional server-side capability enforcement (off during rollout).
  if (ENFORCE_SEND_CAPABILITY) {
    let allowed = false
    try {
      if (emp.role_id) {
        const rres = await fetch(`${SUPABASE_URL}/rest/v1/permission_roles?select=capabilities&id=eq.${encodeURIComponent(emp.role_id)}&limit=1`, { headers: svcHeaders })
        if (rres.ok) allowed = !!(await rres.json())?.[0]?.capabilities?.nuforce_send_quotes
      }
    } catch {
      allowed = false
    }
    if (!allowed) return json(403, { ok: false, error: 'You do not have permission to send quotes.' })
  }

  // 4) Build the from / reply-to per the NU convention.
  const realEmail = str(emp.email) || userEmail // prefer the @nulabs.com address
  const empName = str(emp.name) || [str(emp.first_name), str(emp.last_name)].filter(Boolean).join(' ')
  const fromName = str(payload.fromName) || empName || 'NU Laboratories'
  const fromEmail = `${localPart(realEmail)}@${SENDING_DOMAIN}`
  const replyTo = realEmail

  // 5) Send via Resend.
  const attachments = (payload.attachments || [])
    .filter((a) => a && a.filename && a.contentBase64)
    .map((a) => ({ filename: a.filename, content: a.contentBase64 }))
  const nowIso = new Date().toISOString()

  let resendId = ''
  let status: 'sent' | 'failed' = 'failed'
  let sendError = ''
  try {
    const rres = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to,
        ...(cc.length ? { cc } : {}),
        reply_to: replyTo,
        subject: payload.subject,
        text: payload.body || '',
        ...(attachments.length ? { attachments } : {}),
      }),
    })
    const rbody = await rres.json().catch(() => ({}))
    if (rres.ok && rbody?.id) {
      resendId = rbody.id
      status = 'sent'
    } else {
      sendError = rbody?.message || rbody?.error || `Resend returned ${rres.status}`
    }
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e)
  }

  // 6) Audit — always written (success or failure), service role, best-effort.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/quote_sends`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        quote_id: payload.quoteId,
        opportunity: str(payload.opportunity),
        send_kind: payload.kind === 'follow_up' ? 'follow_up' : 'quote',
        to_emails: to,
        cc_emails: cc,
        subject: payload.subject,
        body: payload.body || '',
        sent_by: userEmail,
        sent_by_name: fromName,
        sent_by_email: replyTo,
        from_email: fromEmail,
        attachment_count: attachments.length,
        resend_id: resendId || null,
        status,
        error: sendError || null,
        sent_at: nowIso,
      }),
    })
  } catch {
    // never fail the request on an audit hiccup
  }

  if (status !== 'sent') return json(200, { ok: false, status: 'failed', error: sendError || 'Send failed.' })
  return json(200, { ok: true, resendId, status: 'sent', sentAt: nowIso })
})
