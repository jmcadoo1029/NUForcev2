// Supabase Edge Function: mass-email-digest
// Sends a "receipt" digest for each mass / account / re-engage blast once its
// delivery has settled (~1 hour after it went out), so the numbers reflect how it
// actually landed. Poked by Supabase cron every ~15 min (see the migration
// 20260928_mass_email_receipts.sql).
//
// For each due blast (receipt_sent=false, sent between 1h and 48h ago) it:
//   • tallies delivery metrics + the addresses that need attention (from
//     mass_email_recipients),
//   • emails a receipt to everyone opted in (managers by default; per-user override
//     in nuforce_user_settings.notify_receipts), each as an individual message,
//   • marks the blast receipt_sent=true so it's never sent twice.
//
// Deploy:  supabase functions deploy mass-email-digest --no-verify-jwt
// Auth:    reuses SCHEDULE_TICK_SECRET (cron passes it as x-tick-secret). If the
//          secret is unset, the check is skipped (same convention as schedule-tick).
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), and
//          optional APP_BASE_URL (defaults to https://nuforce.nulabs.com).

// deno-lint-ignore-file no-explicit-any
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const TICK_SECRET = Deno.env.get('SCHEDULE_TICK_SECRET') || ''
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || 'https://nuforce.nulabs.com').replace(/\/+$/, '')

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SENDING_DOMAIN = 'mail.nulabs.com'
const SETTLE_MINUTES = 60       // wait this long after a send before receipting it
const LOOKBACK_HOURS = 48       // don't receipt blasts older than this (safety floor)
const MAX_PROBLEMS_IN_EMAIL = 50

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const lc = (v: unknown) => str(v).toLowerCase()

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text().catch(() => '')}`)
  return (await res.json()) as T
}
async function patch(path: string, body: unknown): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) })
}

// Page past PostgREST's 1000-row cap (a big blast has more recipients than that).
async function restAll<T>(basePath: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  const sep = basePath.includes('?') ? '&' : '?'
  for (let off = 0; off <= 200000; off += pageSize) {
    const page = await rest<T[]>(`${basePath}${sep}limit=${pageSize}&offset=${off}`)
    out.push(...(page || []))
    if (!page || page.length < pageSize) break
  }
  return out
}

const localPart = (email: string) => (email.split('@')[0] || 'outreach').trim() || 'outreach'
function escHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

interface Blast { id: string; subject: string; audience: string | null; sent_by: string | null; sent_at: string; recipient_count: number; sent_count: number; failed_count: number }
interface Recip { email: string; name: string | null; status: string | null; error: string | null }

// Who should receive receipts: managers by default, plus/minus per-user overrides.
async function resolveRecipients(): Promise<string[]> {
  const [roles, emps, settings] = await Promise.all([
    rest<any[]>('permission_roles?select=id,capabilities&limit=500').catch(() => []),
    restAll<any>('employees?select=email,personal_email,role_id&order=email'),
    rest<{ email: string; notify_receipts: boolean | null }[]>('nuforce_user_settings?select=email,notify_receipts&limit=5000').catch(() => []),
  ])
  const managerRoleIds = new Set(
    (roles || [])
      .filter((r) => { const c = r?.capabilities || {}; return !!(c.nuforce_approve_quotes || c.nuforce_view_dashboard) })
      .map((r) => String(r.id)),
  )
  const set = new Set<string>()
  for (const e of emps || []) {
    const roleId = e.role_id ? String(e.role_id) : ''
    if (roleId && managerRoleIds.has(roleId)) {
      const email = lc(e.email) || lc(e.personal_email)
      if (email.includes('@')) set.add(email)
    }
  }
  // Per-user overrides: explicit true opts in, explicit false opts out.
  for (const s of settings || []) {
    const email = lc(s.email)
    if (!email.includes('@')) continue
    if (s.notify_receipts === true) set.add(email)
    else if (s.notify_receipts === false) set.delete(email)
  }
  return [...set]
}

function buildReceipt(b: Blast, recips: Recip[]): { subject: string; text: string; html: string } {
  const m = { delivered: 0, opened: 0, bounced: 0, complained: 0, failed: 0, total: recips.length }
  for (const r of recips) {
    const s = r.status || ''
    if (s === 'delivered') m.delivered++
    else if (s === 'opened') m.opened++
    else if (s === 'bounced') m.bounced++
    else if (s === 'complained') m.complained++
    else if (s === 'failed') m.failed++
  }
  const problems = recips.filter((r) => r.status === 'bounced' || r.status === 'complained' || r.status === 'failed')
  const audience = b.audience || 'Mass email'
  const when = new Date(b.sent_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const feedUrl = `${APP_BASE_URL}/feed?tab=outreach`
  const subj = `Mass email receipt: ${audience} — ${m.delivered}/${b.recipient_count} delivered`

  const statusWord = (s: string) => (s === 'bounced' ? 'Bounced' : s === 'complained' ? 'Marked spam' : s === 'failed' ? 'Failed' : s)
  const shown = problems.slice(0, MAX_PROBLEMS_IN_EMAIL)
  const moreN = problems.length - shown.length

  const textLines = [
    `Receipt for your NUForce outreach send.`,
    ``,
    `Audience:   ${audience}`,
    `Subject:    ${b.subject}`,
    `Sent:       ${when}`,
    `Recipients: ${b.recipient_count}`,
    ``,
    `How it landed (about an hour after sending):`,
    `  Delivered: ${m.delivered}`,
    `  Opened:    ${m.opened}`,
    `  Bounced:   ${m.bounced}`,
    `  Spam:      ${m.complained}`,
    ...(m.failed ? [`  Failed:    ${m.failed}`] : []),
  ]
  if (problems.length) {
    textLines.push('', `Needs attention (${problems.length}):`)
    for (const p of shown) textLines.push(`  [${statusWord(p.status || '')}] ${p.email}${p.error ? ` — ${p.error}` : ''}`)
    if (moreN > 0) textLines.push(`  …and ${moreN} more.`)
  } else {
    textLines.push('', `No bounces or spam reports. 🎉`)
  }
  textLines.push('', `See full metrics in the Outreach feed:`, feedUrl)
  const text = textLines.join('\n')

  const row = (label: string, val: number, color: string) => `<span style="margin-right:18px"><b style="color:${color}">${val}</b> <span style="color:#667085">${label}</span></span>`
  const probHtml = problems.length
    ? `<div style="margin-top:16px;border-top:1px solid #e4e7ec;padding-top:12px">
         <div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#98a2b3;margin-bottom:6px">Needs attention (${problems.length})</div>
         ${shown.map((p) => `<div style="padding:3px 0"><b style="color:#b3282d">${statusWord(p.status || '')}</b> &nbsp;<a href="mailto:${escHtml(p.email)}" style="color:#1c2430">${escHtml(p.email)}</a>${p.error ? `<div style="color:#667085;font-size:13px">${escHtml(p.error)}</div>` : ''}</div>`).join('')}
         ${moreN > 0 ? `<div style="color:#98a2b3;font-size:13px">…and ${moreN} more.</div>` : ''}
       </div>`
    : `<div style="margin-top:14px;color:#1e8449">No bounces or spam reports.</div>`
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2430">
      <div style="font-weight:800;font-size:18px">Mass email receipt</div>
      <div style="color:#667085;margin-bottom:12px">${escHtml(audience)} · sent ${escHtml(when)}</div>
      <div><b>Subject:</b> ${escHtml(b.subject)}</div>
      <div><b>Recipients:</b> ${b.recipient_count}</div>
      <div style="margin-top:14px;padding:10px 12px;background:#f7f8fa;border:1px solid #e4e7ec;border-radius:8px">
        ${row('delivered', m.delivered, '#1e8449')}${row('opened', m.opened, '#2e6da4')}${row('bounced', m.bounced, '#b3282d')}${m.complained ? row('spam', m.complained, '#b3282d') : ''}${m.failed ? row('failed', m.failed, '#667085') : ''}
      </div>
      ${probHtml}
      <div style="margin-top:18px"><a href="${feedUrl}" style="color:#2e6da4;font-weight:600">View full metrics in the Outreach feed →</a></div>
    </div>`
  return { subject: subj, text, html }
}

Deno.serve(async (req: Request) => {
  if (TICK_SECRET) {
    const got = req.headers.get('x-tick-secret') || ''
    if (got !== TICK_SECRET) return new Response('forbidden', { status: 403 })
  }
  if (!RESEND_API_KEY) return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY not set' }), { status: 500 })

  const now = Date.now()
  const cutoff = new Date(now - SETTLE_MINUTES * 60_000).toISOString()
  const floor = new Date(now - LOOKBACK_HOURS * 3600_000).toISOString()

  let processed = 0
  let notified = 0
  try {
    const due = await rest<Blast[]>(
      `mass_emails?select=id,subject,audience,sent_by,sent_at,recipient_count,sent_count,failed_count&receipt_sent=eq.false&sent_at=lte.${encodeURIComponent(cutoff)}&sent_at=gte.${encodeURIComponent(floor)}&order=sent_at`,
    )
    if (!due || due.length === 0) return new Response(JSON.stringify({ ok: true, processed: 0, notified: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    const recipients = await resolveRecipients()

    for (const b of due) {
      const recips = await restAll<Recip>(`mass_email_recipients?select=email,name,status,error&mass_email_id=eq.${encodeURIComponent(b.id)}&order=status`)
      // Always mark receipted first so a Resend hiccup can't cause repeated sends.
      await patch(`mass_emails?id=eq.${encodeURIComponent(b.id)}`, { receipt_sent: true, receipt_sent_at: new Date().toISOString() })
      processed++
      if (recipients.length === 0) continue

      const { subject, text, html } = buildReceipt(b, recips)
      const replyTo = str(b.sent_by).includes('@') ? str(b.sent_by) : undefined
      const fromEmail = `NUForce Outreach <notifications@${SENDING_DOMAIN}>`
      // Individual message per internal recipient.
      for (const to of recipients) {
        try {
          await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromEmail, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, text, html }),
          })
          notified++
        } catch (e) {
          console.error('mass-email-digest: send failed', to, e)
        }
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: true, processed, notified }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
