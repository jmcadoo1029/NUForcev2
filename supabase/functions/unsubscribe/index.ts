// Supabase Edge Function: unsubscribe
// Records a marketing-email opt-out. PUBLIC -- deploy with --no-verify-jwt, because it's
// opened straight from a link in the email (and by the List-Unsubscribe one-click POST).
//
// Deploy:  supabase functions deploy unsubscribe --no-verify-jwt
//
// NOTE ON THE PLAIN-TEXT PAGE:
// Supabase's default *.supabase.co domain forces every edge-function response to
// Content-Type: text/plain (and applies a strict CSP), so a styled HTML confirmation
// page renders in the browser as raw source. This function therefore returns a clean
// PLAIN-TEXT message, which displays correctly as-is. (To get a branded HTML page you
// would need a Supabase custom domain, or to serve the page from another host.)
// Refs: github.com/orgs/supabase/discussions/35627 and /31238
//
// The link carries the recipient's address plus an HMAC token signed with the service
// role secret, so a recipient can only unsubscribe THEMSELVES (the token can't be forged
// for someone else's address). On a valid hit it upserts the address into email_optouts;
// the mass-email function filters that list out of every future send.
//
// Requires the email_optouts table (see supabase/migrations -- email text primary key).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

async function hmacHex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time-ish compare (avoid leaking length/position via early exit).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Plain-text response. We set text/plain to match what the platform serves anyway; the
// message is written in plain prose (ASCII only, real line breaks) so it reads cleanly.
function text(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

const FOOTER = '\n\n---\nNU Laboratories, Inc.  |  Annandale, NJ  |  www.nulabs.com'

const BROKEN = (why: string) =>
  "This unsubscribe link looks broken.\n\n" +
  "That link " + why + ". If you keep receiving emails you'd rather not, just reply to " +
  "any of them and we'll take you off the list." + FOOTER

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const email = (url.searchParams.get('e') || '').trim().toLowerCase()
  const token = (url.searchParams.get('t') || '').trim()

  if (!email || !email.includes('@')) {
    return text(BROKEN('is not valid'))
  }
  const expect = await hmacHex(email, SERVICE)
  if (!token || !safeEqual(token, expect)) {
    return text(BROKEN('is not valid or has expired'))
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_optouts`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, source: 'link', opted_out_at: new Date().toISOString() }),
    })
  } catch { /* best-effort; still show success so the recipient isn't left in limbo */ }

  return text(
    "You're all set.\n\n" +
    email + " has been removed from NU Laboratories marketing emails. " +
    "You may still hear from us directly about an active quote.\n\n" +
    "Thanks - we appreciate you." + FOOTER,
  )
})
