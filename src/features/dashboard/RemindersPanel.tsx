import { useEffect, useState, type CSSProperties } from 'react'
import { Card, CardLabel, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { Autocomplete } from '../quote/form/Autocomplete'
import { searchPeople, personName, type PersonRow } from '../../lib/directory'
import {
  createReminder, fetchActiveReminders, pingReminder, snoozeReminder, stopReminder, type ContactReminder,
} from '../../lib/reminders'

// Customer Contact → Reminders. Set a recurring "ping this contact every few weeks"
// reminder for any contact (search across accounts). Due ones also surface in the
// dashboard "Needs your attention" area. Team-visible: everyone sees/acts on the list.

const input: CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }
const label: CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4, marginTop: 'var(--sp-3)' }
const WEEK_OPTS = [2, 3, 4, 6, 8, 12]
const plusDaysStr = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
const weeksText = (days: number) => (days % 7 === 0 ? `${days / 7} week${days / 7 === 1 ? '' : 's'}` : `${days} days`)

export function RemindersPanel() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  // Creator state
  const [picked, setPicked] = useState<PersonRow | null>(null)
  const [search, setSearch] = useState('')
  const [weeksSel, setWeeksSel] = useState(3)
  const [firstDue, setFirstDue] = useState(plusDaysStr(21))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // List state
  const [list, setList] = useState<ContactReminder[] | null>(null)
  const [actBusy, setActBusy] = useState('')

  const load = () => fetchActiveReminders().then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])

  const pickWeeks = (w: number) => { setWeeksSel(w); setFirstDue(plusDaysStr(w * 7)) }

  const create = async () => {
    if (!picked && !search.trim()) { showToast('Pick a contact first.', 'warn'); return }
    const contactEmail = picked?.email || ''
    const contactName = picked ? personName(picked) : search.trim()
    if (!contactEmail && !contactName) { showToast('Pick a contact first.', 'warn'); return }
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setBusy(true)
    try {
      await createReminder({ contactEmail, contactName, account: picked?.client_name || '', note, intervalDays: weeksSel * 7, firstDue }, me)
      showToast(`Reminder set — ping ${contactName || contactEmail} every ${weeksText(weeksSel * 7)}`, 'success')
      setPicked(null); setSearch(''); setNote(''); setWeeksSel(3); setFirstDue(plusDaysStr(21))
      load()
    } catch (e) { showToast('Couldn’t save: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const act = async (r: ContactReminder, fn: () => Promise<void>, msg: string) => {
    if (actBusy) return
    setActBusy(r.id)
    try {
      if (!WRITES_ENABLED) showToast(`${msg} (preview)`, 'info')
      else { await fn(); showToast(msg, 'success') }
      load()
    } catch (e) { showToast('Couldn’t update: ' + errMsg(e), 'error', 6000) } finally { setActBusy('') }
  }

  const pill = (active: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-strong)'), background: active ? 'var(--accent-soft)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--muted)' })
  const smallBtn = (border: string, color: string): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${border}`, background: 'none', color })

  const chosen = picked ? `${personName(picked)}${picked.email ? ` · ${picked.email}` : ''}${picked.client_name ? ` · ${picked.client_name}` : ''}` : ''

  return (
    <Card>
      <CardLabel>Follow-up reminders</CardLabel>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2, marginBottom: 'var(--sp-4)' }}>
        Set a recurring reminder to check back in with a contact. When it comes due it appears in <b>Needs your attention</b> on the dashboard; mark it <b>Pinged</b> and it reschedules for the next interval. Everyone on the team sees and can act on these.
      </div>

      {/* Creator */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        <label style={{ ...label, marginTop: 0 }}>Contact</label>
        {picked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{chosen}</span>
            <button onClick={() => { setPicked(null); setSearch('') }} style={smallBtn('var(--border-strong)', 'var(--muted)')}>Change</button>
          </div>
        ) : (
          <Autocomplete<PersonRow>
            value={search}
            onValueChange={setSearch}
            search={(t) => searchPeople(t)}
            itemKey={(p) => p.id}
            itemPrimary={(p) => personName(p) || p.email || '(unnamed)'}
            itemSecondary={(p) => [p.email, p.client_name].filter(Boolean).join(' · ')}
            onPick={(p) => { setPicked(p); setSearch(personName(p) || p.email || '') }}
            placeholder="Search a contact by name or email…"
            minChars={2}
          />
        )}

        <label style={label}>Ping every</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {WEEK_OPTS.map((w) => <button key={w} onClick={() => pickWeeks(w)} style={pill(weeksSel === w)}>{w} weeks</button>)}
        </div>

        <label style={label}>First reminder on</label>
        <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} style={{ ...input, width: 'auto' }} />

        <label style={label}>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. He asked me to check back every few weeks on the Q2 program." style={{ ...input, resize: 'vertical' }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
          <Button variant="primary" small disabled={busy} onClick={create}>{busy ? 'Saving…' : 'Set reminder'}</Button>
        </div>
        {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)', textAlign: 'right' }}>Preview — writes are off, nothing saves.</div>}
      </div>

      {/* Active list */}
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 'var(--sp-2)' }}>Active reminders</div>
      {!list && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {list && list.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', fontStyle: 'italic' }}>No active reminders.</div>}
      {list && list.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          {list.map((r) => {
            const who = (r.contact_name || r.contact_email || 'contact').trim()
            const busyR = actBusy === r.id
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '9px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', opacity: busyR ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{who}{r.account ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {r.account}</span> : null}</div>
                  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 2 }}>Next {fmtDate(r.due_at)} · every {weeksText(r.interval_days)}{r.created_by ? ` · set by ${prettifyEmail(r.created_by)}` : ''}</div>
                  {r.note && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', marginTop: 3 }}>{r.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button disabled={busyR} onClick={() => act(r, () => pingReminder(r), `Pinged ${who} — next in ${weeksText(r.interval_days)}`)} style={smallBtn('var(--pos)', 'var(--pos)')}>Pinged</button>
                  <button disabled={busyR} onClick={() => act(r, () => snoozeReminder(r.id, 7), `Snoozed ${who} 1 week`)} style={smallBtn('var(--border-strong)', 'var(--muted)')}>Snooze 1wk</button>
                  <button disabled={busyR} onClick={() => act(r, () => stopReminder(r.id), `Stopped reminder for ${who}`)} style={smallBtn('var(--border-strong)', 'var(--muted)')}>Done</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
