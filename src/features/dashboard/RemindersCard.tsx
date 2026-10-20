import { useEffect, useState, type CSSProperties } from 'react'
import { Card, CardLabel, Button, Modal, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { fetchSelf, type Self } from '../../lib/me'
import { sendMassEmail } from '../../lib/massEmail'
import { generateFollowupDraft } from '../../lib/aiEmail'
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
  const [self, setSelf] = useState<Self | null>(null)
  // Composer state (null = closed).
  const [compose, setCompose] = useState<ContactReminder | null>(null)
  const [instr, setInstr] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)

  useEffect(() => { let alive = true; fetchDueReminders().then((d) => alive && setList(d)).catch(() => alive && setList([])); return () => { alive = false } }, [])
  useEffect(() => { let alive = true; fetchSelf().then((s) => alive && setSelf(s)).catch(() => {}); return () => { alive = false } }, [])

  const openCompose = (r: ContactReminder) => { setCompose(r); setInstr(''); setSubject(''); setBodyText('') }
  const closeCompose = () => { if (!genBusy && !sendBusy) setCompose(null) }
  const errMsgC = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const generate = async () => {
    if (!compose || genBusy) return
    if (!instr.trim()) { showToast('Say what the email should be about.', 'warn'); return }
    setGenBusy(true)
    try {
      const d = await generateFollowupDraft({ prompt: instr.trim(), contactName: compose.contact_name || '', account: compose.account || '', senderName: self?.name || '' })
      setSubject(d.subject); setBodyText(d.body)
      showToast(d.quote ? `Draft ready (used quote ${d.quote})` : 'Draft ready — review and edit', 'success')
    } catch (e) { showToast('Generate failed: ' + errMsgC(e), 'error', 6000) } finally { setGenBusy(false) }
  }

  const sendCompose = async () => {
    if (!compose || sendBusy) return
    const to = (compose.contact_email || '').trim()
    if (!to) { showToast('This reminder has no email address — add one on the contact first.', 'warn'); return }
    if (!subject.trim() || !bodyText.trim()) { showToast('Add a subject and body (or Generate one).', 'warn'); return }
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setSendBusy(true)
    try {
      const res = await sendMassEmail({ subject: subject.trim(), body: bodyText, audience: `Follow-up: ${compose.contact_name || to}`, recipients: [{ email: to, name: compose.contact_name || '' }] })
      if (!res.ok) { showToast(res.notDeployed ? 'The email function isn’t deployed on this environment.' : 'Send failed: ' + (res.error || 'unknown'), 'error', 7000); return }
      // Sending IS the ping — reschedule the reminder to its next interval.
      try { await pingReminder(compose) } catch { /* reminder reschedule best-effort */ }
      setDone((s) => new Set(s).add(compose.id))
      showToast(`Sent to ${to} — reminder rescheduled`, 'success')
      setCompose(null)
    } catch (e) { showToast('Send failed: ' + errMsgC(e), 'error', 6000) } finally { setSendBusy(false) }
  }

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
                {r.contact_email && <button disabled={busy} onClick={() => openCompose(r)} style={btn('var(--accent-soft)', 'var(--accent)', 'var(--accent)')} title="Write & send a follow-up email">Compose</button>}
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

      {compose && (
        <Modal title={`Follow up with ${(compose.contact_name || compose.contact_email || 'contact').trim()}`} onClose={closeCompose} width={580}>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginBottom: 'var(--sp-3)' }}>
            To: {compose.contact_email}{compose.account ? ` · ${compose.account}` : ''}
          </div>
          <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4 }}>What should it say?</label>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start' }}>
            <input
              value={instr}
              onChange={(e) => setInstr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') generate() }}
              placeholder='e.g. "general follow-up" or "follow up on quote #26-123"'
              style={{ flex: 1, fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
            />
            <Button variant="secondary" small disabled={genBusy} onClick={generate}>{genBusy ? 'Generating…' : 'Generate'}</Button>
          </div>

          <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', margin: 'var(--sp-3) 0 4px' }}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />

          <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', margin: 'var(--sp-3) 0 4px' }}>Message</label>
          <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={9} placeholder="Generate a draft above, or write your own…" style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.55, padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>Sends individually via your normal email, and reschedules this reminder.</span>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <Button variant="ghost" small disabled={genBusy || sendBusy} onClick={closeCompose}>Cancel</Button>
              <Button variant="primary" small disabled={genBusy || sendBusy} onClick={sendCompose}>{sendBusy ? 'Sending…' : 'Send'}</Button>
            </div>
          </div>
          {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)', textAlign: 'right' }}>Preview — writes are off, nothing sends.</div>}
        </Modal>
      )}
    </Card>
  )
}
