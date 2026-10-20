import { useEffect, useState, type CSSProperties } from 'react'
import { Card, CardLabel, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { fetchDueReminders, pingReminder, snoozeReminder, stopReminder, type ContactReminder } from '../../lib/reminders'

// "Follow-up reminders" — the contact pings that have come due, shown in the
// dashboard "Needs your attention" area. Team-visible. Renders nothing when none
// are due so it only appears when there's something to act on.
const weeks = (days: number) => (days % 7 === 0 ? `${days / 7} week${days / 7 === 1 ? '' : 's'}` : `${days} days`)

export function RemindersCard() {
  const { showToast } = useToast()
  const [list, setList] = useState<ContactReminder[] | null>(null)
  const [busyId, setBusyId] = useState('')
  const [done, setDone] = useState<Set<string>>(new Set())

  useEffect(() => { let alive = true; fetchDueReminders().then((d) => alive && setList(d)).catch(() => alive && setList([])); return () => { alive = false } }, [])

  const rows = (list || []).filter((r) => !done.has(r.id))
  if (!list || rows.length === 0) return null

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const act = async (r: ContactReminder, fn: () => Promise<void>, msg: string) => {
    if (busyId) return
    setBusyId(r.id)
    try {
      if (!WRITES_ENABLED) showToast(`${msg} (preview)`, 'info')
      else { await fn(); showToast(msg, 'success') }
      setDone((s) => new Set(s).add(r.id))
    } catch (e) { showToast('Couldn’t update: ' + errMsg(e), 'error', 6000) } finally { setBusyId('') }
  }

  const btn = (bg: string, border: string, color: string): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${border}`, background: bg, color, flexShrink: 0 })

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <span style={{ minWidth: 26, height: 26, borderRadius: 7, background: 'var(--info)', color: '#fff', fontWeight: 800, fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{rows.length}</span>
        <CardLabel>Follow-up reminders</CardLabel>
      </div>
      <div>
        {rows.map((r) => {
          const who = (r.contact_name || r.contact_email || 'contact').trim()
          const busy = busyId === r.id
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '9px 0 9px 36px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700 }}>{who}</span>
                  {r.account && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{r.account}</span>}
                  {r.contact_email && <a href={`mailto:${r.contact_email}`} style={{ fontSize: 'var(--fs-caption)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>{r.contact_email}</a>}
                </div>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 2 }}>
                  Due {fmtDate(r.due_at)} · every {weeks(r.interval_days)}{r.created_by ? ` · set by ${prettifyEmail(r.created_by)}` : ''}
                </div>
                {r.note && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', marginTop: 3 }}>{r.note}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button disabled={busy} onClick={() => act(r, () => pingReminder(r), `Pinged ${who} — next in ${weeks(r.interval_days)}`)} style={{ ...btn('var(--pos)', 'var(--pos)', '#fff'), opacity: busy ? 0.6 : 1 }} title="Mark pinged — reschedules to the next interval">Pinged</button>
                <select
                  disabled={busy}
                  defaultValue=""
                  onChange={(e) => { const d = Number(e.target.value); if (d) act(r, () => snoozeReminder(r.id, d), `Snoozed ${who}`) }}
                  style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, border: '1px solid var(--border-strong)', borderRadius: 20, padding: '4px 8px', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  <option value="">Snooze…</option>
                  <option value="7">1 week</option>
                  <option value="14">2 weeks</option>
                  <option value="30">1 month</option>
                </select>
                <button disabled={busy} onClick={() => act(r, () => stopReminder(r.id), `Stopped reminder for ${who}`)} style={{ ...btn('var(--surface)', 'var(--border-strong)', 'var(--muted)'), opacity: busy ? 0.6 : 1 }} title="Stop this reminder for good">Done</button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
