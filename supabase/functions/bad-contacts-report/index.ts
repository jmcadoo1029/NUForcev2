// Supabase Edge Function: bad-contacts-report
// Weekly digest of contacts flagged invalid (bad address / manually flagged), sent to
// the staff who opted in (More → Users → "Bad contacts report"). For each bad contact
// it also lists the Workspace job #s from that person's won quotes, so the database
// maintainers can check the jobs those people are attached to.
//
// Deploy:  supabase functions deploy bad-contacts-report --no-verify-jwt
// Auth:    reuses SCHEDULE_TICK_SECRET (cron passes it as x-tick-secret). If unset, the
//          check is skipped (same convention as the other scheduled functions).
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), optional
//          APP_BASE_URL (defaults to https://nuforce.nulabs.com).

// deno-lint-ignore-file no-explicit-any
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const TICK_SECRET = Deno.env.get('SCHEDULE_TICK_SECRET') || ''
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || 'https://nuforce.nulabs.com').replace(/\/+$/, '')

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SENDING_DOMAIN = 'mail.nulabs.com'

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const enc = encodeURIComponent
function escHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text().catch(() => '')}`)
  return (await res.json()) as T
}
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
function contactName(row: any, email: string): string {
  const first = str(row.first_name) || str(row.firstname) || str(row.given_name)
  const last = str(row.last_name) || str(row.lastname) || str(row.family_name)
  const full = str(row.name) || str(row.full_name) || str(row.display_name)
  if (first || last) return [first, last].filter(Boolean).join(' ')
  return full || email
}

interface Job { job: string; opportunity: string; customer: string }

// Won quotes for one contact email → their Workspace job #s (job_number column or
// data.wonInfo.jobNum). Case-insensitive exact email match on the quote's contact.
async function jobsForEmail(email: string): Promise<Job[]> {
  const rows = await rest<any[]>(
    `quotes?select=opportunity,customer,job_number,wonjob:data->wonInfo->>jobNum&data->qi->>email=ilike.${enc(email)}&order=opportunity.desc&limit=300`,
  ).catch(() => [])
  const out: Job[] = []
  const seen = new Set<string>()
  for (const r of rows || []) {
    const job = str(r.job_number) || str(r.wonjob)
    if (!job || seen.has(job)) continue
    seen.add(job)
    out.push({ job, opportunity: str(r.opportunity), customer: str(r.customer) })
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (TICK_SECRET) {
    const got = req.headers.get('x-tick-secret') || ''
    if (got !== TICK_SECRET) return new Response('forbidden', { status: 403 })
  }
  if (!RESEND_API_KEY) return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY not set' }), { status: 500 })

  try {
    // Recipients: opt-in only.
    const settings = await rest<{ email: string; notify_bad_contacts: boolean | null }[]>(
      'nuforce_user_settings?select=email,notify_bad_contacts&notify_bad_contacts=eq.true',
    ).catch(() => [])
    const recipients = [...new Set((settings || []).map((s) => str(s.email).toLowerCase()).filter((e) => e.includes('@')))]
    if (recipients.length === 0) return new Response(JSON.stringify({ ok: true, recipients: 0, contacts: 0, note: 'no one opted in' }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    // Bad contacts (currently flagged invalid).
    const bad = await restAll<any>('contacts?select=*&email_invalid=eq.true&order=email_invalid_at.desc')
    const list = (bad || []).filter((c) => str(c.email).includes('@'))
    if (list.length === 0) return new Response(JSON.stringify({ ok: true, recipients: recipients.length, contacts: 0, note: 'no bad contacts' }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    // Enrich each with their won-quote job #s.
    const items: { email: string; name: string; reason: string; at: string; jobs: Job[] }[] = []
    for (const c of list) {
      const email = str(c.email)
      const jobs = await jobsForEmail(email)
      items.push({ email, name: contactName(c, email), reason: str(c.email_invalid_reason) || 'flagged', at: str(c.email_invalid_at), jobs })
    }

    const totalJobs = items.reduce((n, it) => n + it.jobs.length, 0)
    const badUrl = `${APP_BASE_URL}/customer-contact`

    // Build the email.
    const textLines = [
      `NUForce — Bad Contacts report`,
      `${items.length} contact${items.length === 1 ? '' : 's'} currently flagged invalid; ${totalJobs} linked Workspace job${totalJobs === 1 ? '' : 's'} to review.`,
      ``,
      `These addresses have bounced or been flagged bad. Remove or correct them in the client database. Any Workspace job #s listed have this person attached — check those too.`,
      ``,
    ]
    for (const it of items) {
      const when = it.at ? new Date(it.at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : ''
      textLines.push(`• ${it.name} <${it.email}>`)
      textLines.push(`    reason: ${it.reason}${when ? ` (flagged ${when})` : ''}`)
      if (it.jobs.length) textLines.push(`    jobs: ${it.jobs.map((j) => `#${j.job}${j.customer ? ` (${j.customer})` : ''}`).join(', ')}`)
      else textLines.push(`    jobs: none on record`)
      textLines.push('')
    }
    textLines.push(`Open in NUForce: ${badUrl}`)
    const text = textLines.join('\n')

    const rowsHtml = items.map((it) => {
      const when = it.at ? new Date(it.at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : ''
      const jobsHtml = it.jobs.length
        ? it.jobs.map((j) => `<span style="display:inline-block;background:#eef2f6;border:1px solid #d7dee6;border-radius:6px;padding:1px 7px;margin:2px 4px 0 0;font-size:13px">#${escHtml(j.job)}${j.customer ? ` <span style="color:#667085">${escHtml(j.customer)}</span>` : ''}</span>`).join('')
        : `<span style="color:#98a2b3;font-size:13px">no jobs on record</span>`
      return `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e4e7ec;vertical-align:top">
          <div style="font-weight:700;color:#1c2430">${escHtml(it.name)}</div>
          <div style="color:#667085;font-size:13px">${escHtml(it.email)}</div>
        </td>
        <td style="padding:8px 10px;border-top:1px solid #e4e7ec;vertical-align:top;color:#b3282d;font-size:13px">${escHtml(it.reason)}${when ? `<div style="color:#98a2b3">flagged ${escHtml(when)}</div>` : ''}</td>
        <td style="padding:8px 10px;border-top:1px solid #e4e7ec;vertical-align:top">${jobsHtml}</td>
      </tr>`
    }).join('')
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2430">
        <div style="font-weight:800;font-size:18px">Bad Contacts report</div>
        <div style="color:#667085;margin-bottom:12px">${items.length} contact${items.length === 1 ? '' : 's'} flagged invalid · ${totalJobs} linked job${totalJobs === 1 ? '' : 's'} to review</div>
        <div style="margin-bottom:12px">These addresses have bounced or been flagged bad — remove or correct them in the client database. Job #s listed have this person attached in Workspace, so check those too.</div>
        <table style="border-collapse:collapse;width:100%">
          <thead><tr>
            <th style="text-align:left;padding:6px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#98a2b3">Contact</th>
            <th style="text-align:left;padding:6px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#98a2b3">Reason</th>
            <th style="text-align:left;padding:6px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#98a2b3">Workspace jobs</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="margin-top:18px"><a href="${badUrl}" style="color:#2e6da4;font-weight:600">Open Customer Contact → Bad contacts →</a></div>
      </div>`

    const subject = `NUForce Bad Contacts report — ${items.length} to review`
    const fromEmail = `NUForce <notifications@${SENDING_DOMAIN}>`
    let notified = 0
    for (const to of recipients) {
      try {
        await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fromEmail, to: [to], subject, text, html }),
        })
        notified++
      } catch (e) {
        console.error('bad-contacts-report: send failed', to, e)
      }
    }
    return new Response(JSON.stringify({ ok: true, recipients: recipients.length, contacts: items.length, jobs: totalJobs, notified }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
