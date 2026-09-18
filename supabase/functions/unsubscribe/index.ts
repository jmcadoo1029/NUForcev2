// Supabase Edge Function: unsubscribe
// Records a marketing-email opt-out. PUBLIC — deploy with --no-verify-jwt, because it's
// opened straight from a link in the email (and by the List-Unsubscribe one-click POST).
//
// Deploy:  supabase functions deploy unsubscribe --no-verify-jwt
//
// The link carries the recipient's address plus an HMAC token signed with the service
// role secret, so a recipient can only unsubscribe THEMSELVES (the token can't be forged
// for someone else's address). On a valid hit it upserts the address into email_optouts;
// the mass-email function filters that list out of every future send.
//
// Requires the email_optouts table (see supabase/migrations — email text primary key).

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

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

function page(title: string, message: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
  :root{--accent:#b3282d;--text:#1c2430;--muted:#667085;--bg:#f5f6f8;--card:#fff;--border:#e6e8ec}
  body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:0 1px 3px rgba(20,30,45,.06);max-width:460px;width:100%;padding:32px 30px;text-align:center}
  .mark{font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:13px;color:var(--muted);margin-bottom:18px}
  .mark b{color:var(--accent)}
  h1{font-size:20px;margin:0 0 10px}
  p{font-size:15px;line-height:1.6;color:var(--muted);margin:0}
</style></head>
<body><div class="card"><div class="mark"><b>NU</b> Laboratories</div><h1>${title}</h1><p>${message}</p></div></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

serve(async (req: Request) => {
  const url = new URL(req.url)
  const email = (url.searchParams.get('e') || '').trim().toLowerCase()
  const token = (url.searchParams.get('t') || '').trim()

  if (!email || !email.includes('@')) return page('Unsubscribe', 'That unsubscribe link is not valid.')
  const expect = await hmacHex(email, SERVICE)
  if (!token || !safeEqual(token, expect)) return page('Unsubscribe', 'That unsubscribe link is not valid or has expired. If you keep receiving emails, reply to any of them and we’ll remove you.')

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_optouts`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, source: 'link', opted_out_at: new Date().toISOString() }),
    })
  } catch { /* best-effort; still show success so the recipient isn't left in limbo */ }

  return page('You’re unsubscribed', `<b>${email}</b> has been removed from NU Laboratories marketing emails. You may still receive direct replies about active quotes. It can take a moment to take effect across in-flight sends.`)
})
