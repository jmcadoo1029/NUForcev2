import { restFetch, restFetchAll } from './restFetch'
import {
  fetchAllContacts, fetchContactsByProductCode, fetchContactsByCampaign, fetchContactsByAccount,
  sendMassEmail, type Recipient, type MassSendResult,
} from './massEmail'
import { fetchTemplate, type TemplateKey } from './emailTemplates'
import { fillProductToken } from './productName'

// Email scheduler — client side. Schedules live in email_schedules; the daily tick
// (schedule-tick edge function via Supabase cron) creates a pending scheduled_runs
// row when one is due. This module does the CRUD, resolves a run's recipients at
// review time (reusing the mass-email audience queries — no logic duplicated in
// the edge function), and on approval sends through the mass-email path, logs a
// cooldown entry per rule recipient, and marks the run sent. Callers gate on
// WRITES_ENABLED / manager permission.

export type ScheduleKind = 'calendar' | 'rule'
export type Cadence = 'once' | 'monthly' | 'annually'
export type Audience = 'all' | 'code' | 'campaign' | 'account'
export type RuleType = 'quoted_code_ago' | 'not_quoted'

export interface ScheduleConfig {
  audience?: Audience
  code?: string
  campaignId?: string
  campaignName?: string
  clientId?: string
  accountName?: string
  rule?: RuleType
  ruleMonths?: number
}

export interface Schedule {
  id: string
  name: string
  kind: ScheduleKind
  enabled: boolean
  template_key: TemplateKey | null
  template_id: string | null
  config: ScheduleConfig
  cadence: Cadence
  run_on: string | null
  day_of_month: number | null
  cooldown_months: number
  next_fire_at: string | null
  last_fired_at: string | null
  created_at?: string
}

export interface ScheduledRun {
  id: string
  schedule_id: string
  name: string | null
  kind: string | null
  status: string
  created_at: string
  sent_count: number | null
}

export interface NewSchedule {
  name: string
  kind: ScheduleKind
  enabled: boolean
  template_key: TemplateKey | null
  template_id: string | null
  config: ScheduleConfig
  cadence: Cadence
  run_on: string | null
  day_of_month: number | null
  cooldown_months: number
  created_by?: string
}

const enc = (v: string) => encodeURIComponent(v)
const monthsAgoMs = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.getTime() }
const monthsAgoDate = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10) }

// Next time a schedule should fire, from its cadence. Calendar 'once' fires on its
// date; 'monthly' on its day-of-month (clamped to 28 so it exists every month);
// 'annually' on its run_on month/day. Sends are staged at 09:00 local-ish (UTC).
export function computeNextFire(cadence: Cadence, runOn: string | null, dayOfMonth: number | null, from = new Date()): string | null {
  if (cadence === 'once') return runOn ? new Date(runOn + 'T09:00:00Z').toISOString() : null
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

// ── CRUD ─────────────────────────────────────────────────────────────────────
export async function fetchSchedules(): Promise<Schedule[]> {
  return (await restFetch<Schedule[]>('GET', 'email_schedules?select=*&order=created_at.desc&limit=200')) || []
}

export async function createSchedule(s: NewSchedule): Promise<void> {
  const next_fire_at = computeNextFire(s.cadence, s.run_on, s.day_of_month)
  await restFetch('POST', 'email_schedules', { body: { ...s, next_fire_at } })
}

export async function updateSchedule(id: string, s: NewSchedule): Promise<void> {
  const next_fire_at = computeNextFire(s.cadence, s.run_on, s.day_of_month)
  await restFetch('PATCH', `email_schedules?id=eq.${enc(id)}`, { body: { ...s, next_fire_at } })
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<void> {
  await restFetch('PATCH', `email_schedules?id=eq.${enc(id)}`, { body: { enabled } })
}

export async function deleteSchedule(id: string): Promise<void> {
  await restFetch('DELETE', `email_schedules?id=eq.${enc(id)}`)
}

// ── Review queue ─────────────────────────────────────────────────────────────
export async function fetchPendingRuns(): Promise<ScheduledRun[]> {
  return (await restFetch<ScheduledRun[]>('GET', 'scheduled_runs?select=id,schedule_id,name,kind,status,created_at,sent_count&status=eq.pending&order=created_at.desc&limit=100')) || []
}

export async function fetchScheduleById(id: string): Promise<Schedule | null> {
  const rows = await restFetch<Schedule[]>('GET', `email_schedules?select=*&id=eq.${enc(id)}&limit=1`)
  return rows?.[0] || null
}

// ── Recipient resolution ─────────────────────────────────────────────────────
async function fetchNotQuotedSince(months: number): Promise<Recipient[]> {
  const cutoff = monthsAgoMs(months)
  const invalid = new Set(
    ((await restFetchAll<{ email: string | null }>('contacts?select=email&email_invalid=eq.true&order=email')) || [])
      .map((r) => (r.email || '').trim().toLowerCase()).filter(Boolean),
  )
  const rows = (await restFetchAll<{ em: string | null; nm: string | null; created_at: string | null }>(
    'quotes?select=em:data->qi->>email,nm:data->qi->>contact,created_at&order=id',
  )) || []
  const latest = new Map<string, { name: string; ms: number }>()
  for (const r of rows) {
    const email = (r.em || '').trim().toLowerCase()
    if (!email.includes('@') || invalid.has(email)) continue
    const ms = r.created_at ? new Date(r.created_at).getTime() : 0
    const cur = latest.get(email)
    if (!cur) latest.set(email, { name: r.nm || '', ms })
    else { if (ms > cur.ms) cur.ms = ms; if (!cur.name && r.nm) cur.name = r.nm }
  }
  const out: Recipient[] = []
  latest.forEach((v, email) => { if (v.ms && v.ms < cutoff) out.push({ email, name: v.name }) })
  return out
}

// Drop anyone this schedule already emailed inside its cooldown window.
async function filterCooldown(scheduleId: string, months: number, list: Recipient[]): Promise<Recipient[]> {
  if (!list.length) return list
  const cutoff = new Date(monthsAgoMs(months)).toISOString()
  const rows = (await restFetchAll<{ email: string | null }>(
    `scheduled_send_log?select=email&schedule_id=eq.${enc(scheduleId)}&sent_at=gte.${enc(cutoff)}&order=email`,
  )) || []
  const recent = new Set(rows.map((r) => (r.email || '').trim().toLowerCase()).filter(Boolean))
  return list.filter((r) => !recent.has(r.email.trim().toLowerCase()))
}

/** Resolve who a run would email, right now (recipients change over time, so this
 *  runs at review time, not when the run was created). */
export async function resolveRecipients(s: Schedule): Promise<Recipient[]> {
  const cfg = s.config || {}
  let list: Recipient[] = []
  if (s.kind === 'calendar') {
    const aud = cfg.audience || 'all'
    if (aud === 'all') list = (await fetchAllContacts()).recipients
    else if (aud === 'code') list = await fetchContactsByProductCode(cfg.code || '')
    else if (aud === 'campaign') list = await fetchContactsByCampaign(cfg.campaignId || '')
    else if (aud === 'account') list = await fetchContactsByAccount(cfg.clientId || '')
  } else {
    if (cfg.rule === 'quoted_code_ago') list = await fetchContactsByProductCode(cfg.code || '', { to: monthsAgoDate(cfg.ruleMonths || 12) })
    else if (cfg.rule === 'not_quoted') list = await fetchNotQuotedSince(cfg.ruleMonths || 12)
    list = await filterCooldown(s.id, s.cooldown_months, list)
  }
  return list
}

/** The template subject/body for a schedule, with {product} already filled. */
export async function resolveTemplate(s: Schedule): Promise<{ subject: string; body: string }> {
  let subject = ''
  let body = ''
  if (s.template_id) {
    const rows = await restFetch<Array<{ subject: string; body: string }>>('GET', `email_templates?select=subject,body&id=eq.${enc(s.template_id)}&limit=1`)
    const r = rows?.[0]; if (r) { subject = r.subject; body = r.body }
  } else if (s.template_key) {
    const t = await fetchTemplate(s.template_key); subject = t.subject; body = t.body
  }
  const code = s.config?.code || ''
  return { subject: fillProductToken(subject, code), body: fillProductToken(body, code) }
}

export function audienceLabel(s: Schedule): string {
  const cfg = s.config || {}
  if (s.kind === 'rule') {
    if (cfg.rule === 'quoted_code_ago') return `Quoted ${cfg.code || '—'} over ${cfg.ruleMonths || 12} mo ago`
    return `Not quoted in over ${cfg.ruleMonths || 12} mo`
  }
  const aud = cfg.audience || 'all'
  if (aud === 'all') return 'All contacts'
  if (aud === 'code') return `Quoted code ${cfg.code || '—'}`
  if (aud === 'campaign') return `Campaign: ${cfg.campaignName || '—'}`
  return `Account: ${cfg.accountName || '—'}`
}

// ── Approve / dismiss a pending run ──────────────────────────────────────────
export async function approveRun(run: ScheduledRun, s: Schedule, recipients: Recipient[], subject: string, body: string, by: string): Promise<MassSendResult> {
  const res = await sendMassEmail({ subject, body, audience: `Scheduled: ${s.name}`, recipients })
  if (!res.ok) return res
  await restFetch('PATCH', `scheduled_runs?id=eq.${enc(run.id)}`, {
    body: { status: 'sent', decided_by: by || null, decided_at: new Date().toISOString(), sent_count: res.sent ?? recipients.length },
  }).catch(() => {})
  // Cooldown ledger — only rule drips dedupe across runs.
  if (s.kind === 'rule' && recipients.length) {
    const now = new Date().toISOString()
    const rows = recipients.map((r) => ({ schedule_id: s.id, email: r.email.trim().toLowerCase(), sent_at: now }))
    await restFetch('POST', 'scheduled_send_log', { body: rows }).catch(() => {})
  }
  return res
}

export async function dismissRun(run: ScheduledRun, by: string): Promise<void> {
  await restFetch('PATCH', `scheduled_runs?id=eq.${enc(run.id)}`, {
    body: { status: 'dismissed', decided_by: by || null, decided_at: new Date().toISOString() },
  })
}
