// Supabase Edge Function: schedule-tick
// Fired once a day by Supabase cron (pg_cron + pg_net). It does NOT send anything —
// it finds schedules that are due, creates a PENDING scheduled_runs row for each
// (which a manager reviews + approves in the app), and advances next_fire_at so the
// schedule doesn't re-fire until its next occurrence. All sending is review-first.
//
// Deploy:  supabase functions deploy schedule-tick --no-verify-jwt
// Secret:  supabase secrets set SCHEDULE_TICK_SECRET=<value>   (cron passes it as
//          the x-tick-secret header; if the secret is unset, the check is skipped.)
//
// See supabase/migrations/20260920_email_scheduler.sql for the cron.schedule() call.

// deno-lint-ignore-file no-explicit-any
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const TICK_SECRET = Deno.env.get('SCHEDULE_TICK_SECRET') || ''

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function rest(method: string, path: string, body?: unknown, prefer?: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: prefer ? { ...H, Prefer: prefer } : H,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`)
  const text = await res.text()
  return text ? JSON.parse(text) : undefined
}

// Same cadence math as the client (src/lib/scheduler.ts).
function computeNextFire(cadence: string, runOn: string | null, dayOfMonth: number | null, from = new Date()): string | null {
  if (cadence === 'once') return null // one-shot: disabled after firing
  if (cadence === 'monthly') {
    const dom = Math.min(Math.max(dayOfMonth || 1, 1), 28)
    const d = new Date(from); d.setUTCHours(9, 0, 0, 0); d.setUTCDate(dom)
    if (d.getTime() <= from.getTime()) d.setUTCMonth(d.getUTCMonth() + 1)
    return d.toISOString()
  }
  if (cadence === 'annually' && runOn) {
    const base = new Date(runOn + 'T09:00:00Z')
    const d = new Date(from); d.setUTCHours(9, 0, 0, 0); d.setUTCMonth(base.getUTCMonth(), base.getUTCDate())
    if (d.getTime() <= from.getTime()) d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d.toISOString()
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (TICK_SECRET) {
    const got = req.headers.get('x-tick-secret') || ''
    if (got !== TICK_SECRET) return new Response('forbidden', { status: 403 })
  }

  const nowIso = new Date().toISOString()
  let created = 0
  try {
    const due: any[] = await rest('GET', `email_schedules?select=*&enabled=eq.true&next_fire_at=not.is.null&next_fire_at=lte.${encodeURIComponent(nowIso)}&order=next_fire_at`)
    for (const s of due || []) {
      // Skip if this schedule already has an unreviewed run waiting.
      const open: any[] = await rest('GET', `scheduled_runs?select=id&schedule_id=eq.${s.id}&status=eq.pending&limit=1`)
      if (!open || open.length === 0) {
        await rest('POST', 'scheduled_runs', { schedule_id: s.id, name: s.name, kind: s.kind, status: 'pending' })
        created++
      }
      // Advance the schedule so it won't re-fire until its next occurrence.
      const next = computeNextFire(s.cadence, s.run_on, s.day_of_month)
      const patch: any = { last_fired_at: nowIso, next_fire_at: next }
      if (s.cadence === 'once') patch.enabled = false
      await rest('PATCH', `email_schedules?id=eq.${s.id}`, patch)
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: true, created }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
