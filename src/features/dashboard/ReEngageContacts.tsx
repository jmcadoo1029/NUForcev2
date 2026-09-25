import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Card, CardLabel, Button, Modal, useToast } from '../../components'
import { money, moneyShort, fmtDate } from '../../lib/format'
import { WRITES_ENABLED } from '../../lib/config'
import { sendMassEmail, applySenderIdentity } from '../../lib/massEmail'
import { fetchTemplate, DEFAULT_TEMPLATES } from '../../lib/emailTemplates'
import { flagContactInvalid, clearContactInvalid } from '../../lib/quoteContact'
import { getSessionEmail } from '../../lib/auth'
import { fetchSelf, type Self } from '../../lib/me'
import { useDormantContacts, snoozeReengage, unsnoozeReengage, type DormantRow } from './useDormantContacts'

// Re-engage — contacts we quoted in the past who've gone quiet. Pick a dormancy
// window, rank by past value (or how long they've been cold), select who to reach,
// and send a re-engagement email through the existing mass-email path (seeded from
// the editable "Re-engage" template in the Email Templates catalog, with {first name}
// merged per recipient).

const MONTHS = [6, 12, 18, 24]
const CAP = 300 // cap the rendered rows; the summary still counts them all

const pill = (active: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-strong)'), background: active ? 'var(--accent-soft)' : '#fff', color: active ? 'var(--accent)' : 'var(--muted)' })
const seg = (active: boolean, first: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 12px', border: 'none', borderLeft: first ? 'none' : '1px solid var(--border-strong)', background: active ? 'var(--accent)' : '#fff', color: active ? '#fff' : 'var(--muted)', cursor: 'pointer' })
const th: CSSProperties = { textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 10px', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '8px 10px', borderTop: '1px solid var(--border)', fontSize: 'var(--fs-sm)', verticalAlign: 'top' }
const numTd: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const flagBtn: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, lineHeight: 1, color: 'var(--muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }
const menuItem: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: '#fff', border: 'none', borderBottom: '1px solid var(--border)', padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }

const monthsAgo = (ms: number) => Math.max(0, Math.round((Date.now() - ms) / (30 * 864e5)))

function ComposeModal({ recipients, months, onClose, onSent }: { recipients: DormantRow[]; months: number; onClose: () => void; onSent: (sent: DormantRow[]) => void }) {
  const { showToast } = useToast()
  // Seed once from the editable "Re-engage" template AND the signed-in user, then
  // pre-fill the sender's own name, email and signature into the body — using the
  // very same applySenderIdentity() the send applies — so nobody has to type
  // [Your Name] / [your email] by hand. The body stays fully editable afterward.
  const [self, setSelf] = useState<Self | null>(null)
  const [subject, setSubject] = useState(DEFAULT_TEMPLATES.mass_reengage.subject)
  const [body, setBody] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([fetchTemplate('mass_reengage'), fetchSelf()])
      .then(([t, me]) => {
        if (!alive) return
        setSelf(me)
        setSubject(t.subject)
        setBody(applySenderIdentity(t.body, me)) // fill sender name/email + signature up front
        setSeeded(true)
      })
      .catch(() => {
        if (!alive) return
        // Never block composing on the lookup — fall back to the raw template.
        setSubject(DEFAULT_TEMPLATES.mass_reengage.subject)
        setBody(DEFAULT_TEMPLATES.mass_reengage.body)
        setSeeded(true)
      })
    return () => { alive = false }
  }, [])

  const send = async () => {
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setBusy(true)
    try {
      const res = await sendMassEmail({ subject, body, audience: `re-engage (${months}mo dormant)`, recipients: recipients.map((r) => ({ email: r.email, name: r.name })) })
      if (res.ok) { showToast(`Sent to ${res.sent ?? recipients.length} contact(s)`, 'success', 6000); onSent(recipients); onClose() }
      else if (res.notDeployed) showToast('The mass-email function isn’t deployed on this environment.', 'error', 7000)
      else showToast('Send failed: ' + (res.error || 'unknown'), 'error', 7000)
    } finally { setBusy(false) }
  }

  const inputStyle: CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
  return (
    <Modal title={`Re-engage ${recipients.length} contact${recipients.length === 1 ? '' : 's'}`} onClose={() => !busy && onClose()} width={640}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
        Each person gets an individual send (nobody sees another address). <b style={{ color: 'var(--text)' }}>{'{first name}'}</b> is filled per recipient, and your own name, email and signature are filled in for you below{self ? <> — sending as <b style={{ color: 'var(--text)' }}>{self.name}</b></> : ''}. Review and send.
      </div>
      <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>Subject</label>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...inputStyle, margin: '4px 0 12px' }} />
      <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>Body</label>
      {seeded ? (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} style={{ ...inputStyle, margin: '4px 0 0', resize: 'vertical', lineHeight: 1.5 }} />
      ) : (
        <div style={{ ...inputStyle, margin: '4px 0 0', color: 'var(--muted)' }}>Preparing your message…</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
        <Button variant="secondary" small disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="primary" small disabled={busy || !seeded || recipients.length === 0} onClick={send}>{busy ? 'Sending…' : `Send to ${recipients.length}`}</Button>
      </div>
    </Modal>
  )
}

export function ReEngageContacts() {
  const { showToast } = useToast()
  const { data, err, loading } = useDormantContacts()
  const [months, setMonths] = useState(12)
  const [sort, setSort] = useState<'value' | 'dormant'>('value')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [composeOpen, setComposeOpen] = useState(false)
  const [flagged, setFlagged] = useState<DormantRow[]>([]) // flagged bad this session — hidden from the list, shown in the undo strip (newest first)
  const [flagging, setFlagging] = useState<string | null>(null)
  const [unflagging, setUnflagging] = useState<string | null>(null)
  const flaggedSet = useMemo(() => new Set(flagged.map((r) => r.email)), [flagged])
  const [snoozed, setSnoozed] = useState<DormantRow[]>([]) // snoozed this session — hidden here, shown in the undo strip
  const [snoozing, setSnoozing] = useState<string | null>(null)
  const [unsnoozing, setUnsnoozing] = useState<string | null>(null)
  const [snoozeMenu, setSnoozeMenu] = useState<string | null>(null) // email whose 6/12mo menu is open
  const snoozedSet = useMemo(() => new Set(snoozed.map((r) => r.email)), [snoozed])

  const cutoff = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.getTime() }, [months])
  const dormant = useMemo(() => {
    const list = (data || []).filter((r) => r.lastMs < cutoff && !flaggedSet.has(r.email) && !snoozedSet.has(r.email))
    list.sort((a, b) => (sort === 'value' ? b.totalQuoted - a.totalQuoted : a.lastMs - b.lastMs))
    return list
  }, [data, cutoff, sort, flaggedSet, snoozedSet])

  // Flag a contact as bad right from the list: marks the address invalid (same flag
  // Bad contacts uses), drops them here, and pulls their quotes into Bad contacts to
  // reassign. Also parks them in the undo strip so it's one click to reverse.
  const flagBad = async (r: DormantRow) => {
    if (flagging) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setFlagging(r.email)
    try {
      const me = getSessionEmail()
      await flagContactInvalid(r.email, `flagged from re-engage${me ? ' by ' + me : ''}`)
      setFlagged((f) => [r, ...f.filter((x) => x.email !== r.email)])
      setSel((s) => { const n = new Set(s); n.delete(r.email); return n })
      showToast(`${r.name || r.email} flagged as a bad contact — moved to Bad contacts. Undo above.`, 'success', 6000)
    } catch (e) {
      showToast('Couldn’t flag: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setFlagging(null) }
  }

  // Undo a flag from this session: clears the bad-address flag (same as Bad contacts'
  // "Address is fine") and returns the contact to the list.
  const undoFlag = async (r: DormantRow) => {
    if (unflagging) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setUnflagging(r.email)
    try {
      await clearContactInvalid(r.email)
      setFlagged((f) => f.filter((x) => x.email !== r.email))
      showToast(`Restored ${r.name || r.email}.`, 'info', 4000)
    } catch (e) {
      showToast('Couldn’t undo: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setUnflagging(null) }
  }

  // Snooze a contact for 6 or 12 months: they drop off the list until the window
  // passes, then return automatically. Parked in the undo strip for a quick reverse.
  const snooze = async (r: DormantRow, months: number) => {
    if (snoozing) return
    setSnoozeMenu(null)
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setSnoozing(r.email)
    try {
      const me = getSessionEmail()
      await snoozeReengage(r.email, months, me || '')
      setSnoozed((s) => [r, ...s.filter((x) => x.email !== r.email)])
      setSel((s) => { const n = new Set(s); n.delete(r.email); return n })
      showToast(`Snoozed ${r.name || r.email} for ${months} months. Undo above.`, 'success', 6000)
    } catch (e) {
      showToast('Couldn’t snooze: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setSnoozing(null) }
  }

  // After a re-engage send goes out, auto-snooze everyone we just emailed for 6
  // months: they roll off the list (so they aren't re-emailed next pass) and come
  // back automatically. Parked in the undo strip like a manual snooze. Best-effort —
  // the send already succeeded, so a snooze hiccup never surfaces as a send error.
  const snoozeAfterSend = async (sent: DormantRow[]) => {
    if (!sent.length) return
    setSel(new Set())
    setSnoozed((s) => {
      const have = new Set(s.map((x) => x.email))
      return [...sent.filter((r) => !have.has(r.email)), ...s]
    })
    if (!WRITES_ENABLED) return
    const me = getSessionEmail() || ''
    await Promise.all(sent.map((r) => snoozeReengage(r.email, 6, me).catch(() => {})))
    showToast(`Snoozed ${sent.length} contact${sent.length === 1 ? '' : 's'} for 6 months after emailing. Undo above.`, 'info', 6000)
  }

  const undoSnooze = async (r: DormantRow) => {
    if (unsnoozing) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setUnsnoozing(r.email)
    try {
      await unsnoozeReengage(r.email)
      setSnoozed((s) => s.filter((x) => x.email !== r.email))
      showToast(`Restored ${r.name || r.email}.`, 'info', 4000)
    } catch (e) {
      showToast('Couldn’t undo: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setUnsnoozing(null) }
  }

  const totalValue = dormant.reduce((a, r) => a + r.totalQuoted, 0)
  const selected = dormant.filter((r) => sel.has(r.email))
  const shown = dormant.slice(0, CAP)
  const allShownSelected = shown.length > 0 && shown.every((r) => sel.has(r.email))
  const toggle = (email: string) => setSel((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n })
  const toggleAll = () => setSel((s) => { const n = new Set(s); if (allShownSelected) shown.forEach((r) => n.delete(r.email)); else shown.forEach((r) => n.add(r.email)); return n })

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
        <div>
          <CardLabel>Re-engage — dormant contacts</CardLabel>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>
            {loading ? 'Scanning quote history…' : err ? `Couldn’t load: ${err}` : `${dormant.length.toLocaleString()} contact${dormant.length === 1 ? '' : 's'} not quoted in ${months}+ months · ${money(totalValue)} of past work`}
          </div>
        </div>
        <Button variant="primary" small disabled={selected.length === 0} onClick={() => setComposeOpen(true)}>Email selected ({selected.length})</Button>
      </div>

      {flagged.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 'var(--sp-3)' }}>
          <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dim)' }}>Flagged this session</span>
          {flagged.map((r) => (
            <span key={r.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-sm)', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '2px 4px 2px 10px' }}>
              <span style={{ color: 'var(--text)' }}>{r.name || r.email}</span>
              <button onClick={() => undoFlag(r)} disabled={unflagging === r.email} title={`Undo — restore ${r.email}`} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: unflagging === r.email ? 'default' : 'pointer', padding: '2px 6px' }}>{unflagging === r.email ? '…' : 'Undo'}</button>
            </span>
          ))}
        </div>
      )}

      {snoozed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 'var(--sp-3)' }}>
          <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dim)' }}>Snoozed this session</span>
          {snoozed.map((r) => (
            <span key={r.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-sm)', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '2px 4px 2px 10px' }}>
              <span style={{ color: 'var(--text)' }}>{r.name || r.email}</span>
              <button onClick={() => undoSnooze(r)} disabled={unsnoozing === r.email} title={`Undo — bring ${r.email} back`} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: unsnoozing === r.email ? 'default' : 'pointer', padding: '2px 6px' }}>{unsnoozing === r.email ? '…' : 'Undo'}</button>
            </span>
          ))}
        </div>
      )}

      {!loading && !err && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Quiet for</span>
            {MONTHS.map((m) => <button key={m} style={pill(months === m)} onClick={() => setMonths(m)}>{m} mo</button>)}
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
            <button style={seg(sort === 'value', true)} onClick={() => setSort('value')}>By value</button>
            <button style={seg(sort === 'dormant', false)} onClick={() => setSort('dormant')}>Longest quiet</button>
          </div>
        </div>
      )}

      {!loading && !err && dormant.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>No contacts have been quiet that long. Try a shorter window.</div>
      )}

      {!loading && !err && dormant.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 30 }}><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown" /></th>
                <th style={th}>Contact</th>
                <th style={th}>Company</th>
                <th style={th}>Last quoted</th>
                <th style={{ ...th, textAlign: 'right' }}>Quotes</th>
                <th style={{ ...th, textAlign: 'right' }}>Past $</th>
                <th style={{ ...th, textAlign: 'right' }}>Won $</th>
                <th style={{ ...th, textAlign: 'center' }} title="Snooze this contact — hide from Re-engage for 6 or 12 months, then they come back automatically">Snooze</th>
                <th style={{ ...th, textAlign: 'center' }} title="Flag a contact as bad — removes them here and sends their quotes to Bad contacts to reassign">Bad?</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.email} style={{ background: sel.has(r.email) ? 'var(--accent-soft)' : undefined }}>
                  <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={sel.has(r.email)} onChange={() => toggle(r.email)} aria-label={`Select ${r.email}`} /></td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{r.name || '(no name)'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>{r.email}</div>
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{r.company || '—'}</td>
                  <td style={td}>{fmtDate(new Date(r.lastMs).toISOString())}<span style={{ color: 'var(--dim)' }}> · {monthsAgo(r.lastMs)} mo ago</span></td>
                  <td style={numTd}>{r.quoteCount}</td>
                  <td style={numTd}>{moneyShort(r.totalQuoted)}</td>
                  <td style={numTd}>{r.wonValue > 0 ? moneyShort(r.wonValue) : '—'}</td>
                  <td style={{ ...td, textAlign: 'center', position: 'relative' }}>
                    <button onClick={() => setSnoozeMenu((m) => (m === r.email ? null : r.email))} disabled={snoozing === r.email} title={`Snooze ${r.email}`} style={{ ...flagBtn, opacity: snoozing === r.email ? 0.5 : 1, cursor: snoozing === r.email ? 'default' : 'pointer' }}>{snoozing === r.email ? '…' : 'Snooze ▾'}</button>
                    {snoozeMenu === r.email && (
                      <>
                        <div onClick={() => setSnoozeMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', boxShadow: '0 6px 24px rgba(20,30,45,.14)', overflow: 'hidden', minWidth: 140 }}>
                          <button onClick={() => snooze(r, 6)} style={menuItem}>Snooze 6 months</button>
                          <button onClick={() => snooze(r, 12)} style={{ ...menuItem, borderBottom: 'none' }}>Snooze 12 months</button>
                        </div>
                      </>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => flagBad(r)} disabled={flagging === r.email} title={`Flag ${r.email} as a bad contact`} style={{ ...flagBtn, opacity: flagging === r.email ? 0.5 : 1, cursor: flagging === r.email ? 'default' : 'pointer' }}>{flagging === r.email ? '…' : 'Flag'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dormant.length > CAP && (
            <div style={{ padding: '8px 10px', fontSize: 'var(--fs-caption)', color: 'var(--dim)', borderTop: '1px solid var(--border)' }}>Showing the top {CAP} of {dormant.length.toLocaleString()} — narrow the window or sort to find others.</div>
          )}
        </div>
      )}

      {composeOpen && <ComposeModal recipients={selected} months={months} onClose={() => setComposeOpen(false)} onSent={snoozeAfterSend} />}
    </Card>
  )
}
