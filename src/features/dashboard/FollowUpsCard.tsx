import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, Modal, useToast } from '../../components'
import { fmtDate } from '../../lib/format'
import { restFetch } from '../../lib/restFetch'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { stopFollowUp, snoozeFollowUp } from '../../lib/followups'
import { SendComposer } from '../quote/SendComposer'
import { useFollowUps, type FollowUpRow } from './useFollowUps'

// Follow-ups due. Each row links to its quote and offers two actions: send a
// follow-up email (opens the composer in follow-up mode; on send it reschedules
// the row +90 days, per Classic), or stop following up (marks it done). Writes
// gate on WRITES_ENABLED.

interface ComposerTarget {
  fu: FollowUpRow
  revision: string | null
  contactName: string
  contactEmail: string
  testItem: string
}

export function FollowUpsCard() {
  const { data, err } = useFollowUps()
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [target, setTarget] = useState<ComposerTarget | null>(null)
  const [stopFor, setStopFor] = useState<FollowUpRow | null>(null)
  const [stopBusy, setStopBusy] = useState(false)
  const [delayFor, setDelayFor] = useState<string | null>(null) // row id whose Delay menu is open
  const [delayBusy, setDelayBusy] = useState(false)
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const hide = (id: string) => setHidden((s) => new Set(s).add(id))

  // Delay (snooze) a follow-up 30 / 60 / 90 days — it drops off the list now and
  // returns due on its own at the new date. No follow-up is recorded.
  const doSnooze = async (f: FollowUpRow, days: number) => {
    if (delayBusy) return
    setDelayFor(null)
    setDelayBusy(true)
    try {
      if (WRITES_ENABLED) await snoozeFollowUp(f.id, days)
      showToast(WRITES_ENABLED ? `${f.opportunity} delayed ${days} days` : `Delayed ${days}d (preview — writes off)`, WRITES_ENABLED ? 'info' : 'warn')
      hide(f.id)
    } catch (e) {
      showToast('Couldn’t delay: ' + errMsg(e), 'error', 6000)
    } finally {
      setDelayBusy(false)
    }
  }

  // Load the quote's data for placeholders, then open the composer.
  const openFollowUp = async (fu: FollowUpRow) => {
    if (!fu.quote_id) { showToast('This follow-up has no linked quote.', 'error'); return }
    setLoadingId(fu.id)
    try {
      const rows = await restFetch<Array<{ data?: Record<string, any>; revision?: string | null }>>('GET', `quotes?id=eq.${encodeURIComponent(fu.quote_id)}&select=data,revision&limit=1`)
      const d = rows?.[0]?.data || {}
      const qi = (d.qi || {}) as Record<string, any>
      const ti = (d.ti || {}) as Record<string, any>
      const rc = Array.isArray(qi.relatedContacts) ? qi.relatedContacts[0] : null
      // Follow-up defaults to the primary contact (qi.email/qi.contact), falling
      // back to the first related contact only if there's no primary on record.
      setTarget({
        fu,
        revision: rows?.[0]?.revision ?? null,
        contactName: String(qi.contact || '') || (rc?.name as string) || '',
        contactEmail: String(qi.email || '') || (rc?.email as string) || '',
        testItem: String(ti.item || ''),
      })
    } catch (e) {
      showToast('Couldn’t load the quote: ' + errMsg(e), 'error', 6000)
    } finally {
      setLoadingId(null)
    }
  }

  const doStop = async () => {
    if (!stopFor || stopBusy) return
    setStopBusy(true)
    try {
      if (WRITES_ENABLED) await stopFollowUp(stopFor.id, me)
      showToast(WRITES_ENABLED ? 'Stopped following up' : 'Stopped (preview — writes off)', WRITES_ENABLED ? 'info' : 'warn')
      hide(stopFor.id)
      setStopFor(null)
    } catch (e) {
      showToast('Couldn’t stop: ' + errMsg(e), 'error', 6000)
    } finally {
      setStopBusy(false)
    }
  }

  const rows = (data || []).filter((f) => !hidden.has(f.id))
  const btn = (accent: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${accent ? 'var(--accent)' : 'var(--border-strong)'}`, background: accent ? 'var(--accent)' : '#fff', color: accent ? '#fff' : 'var(--text)', flexShrink: 0 })

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
        <CardLabel>Follow-ups due</CardLabel>
        {rows.length > 0 && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: '#fff', background: 'var(--warn)', borderRadius: 20, padding: '2px 9px' }}>{rows.length}</span>}
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && data && rows.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No follow-ups due.</div>}

      {!err && rows.length > 0 && (
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {rows.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
              <Link to={f.quote_id ? `/quote/${f.quote_id}` : '#'} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{f.opportunity}</span>
                <span style={{ color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.customer}</span>
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>due {isFinite(f.dueAt) ? fmtDate(new Date(f.dueAt).toISOString()) : '—'}</span>
              </Link>
              <button onClick={() => openFollowUp(f)} disabled={loadingId === f.id} style={btn(true)} title="Compose and send a follow-up email">{loadingId === f.id ? '…' : 'Send follow-up'}</button>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setDelayFor((cur) => (cur === f.id ? null : f.id))} disabled={delayBusy} style={btn(false)} title="Delay this reminder — it comes back due later">Delay ▾</button>
                {delayFor === f.id && (
                  <>
                    <div onClick={() => setDelayFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 41, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', minWidth: 130 }}>
                      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '7px 12px 4px' }}>Remind again in</div>
                      {[30, 60, 90].map((d) => (
                        <button key={d} onClick={() => doSnooze(f, d)} style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: '#fff', border: 'none', borderTop: '1px solid var(--border)', padding: '9px 12px', cursor: 'pointer' }}>{d} days</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setStopFor(f)} style={btn(false)} title="Stop following up on this quote">Stop</button>
            </div>
          ))}
        </div>
      )}

      {target && (
        <SendComposer
          mode="follow_up"
          quoteId={target.fu.quote_id || ''}
          opportunity={target.fu.opportunity}
          revision={target.revision}
          contactName={target.contactName}
          contactEmail={target.contactEmail}
          testItem={target.testItem}
          followUpId={target.fu.id}
          onClose={() => setTarget(null)}
          onSent={() => { hide(target.fu.id); setTarget(null) }}
        />
      )}

      {stopFor && (
        <Modal title={`Stop following up on ${stopFor.opportunity}?`} onClose={() => !stopBusy && setStopFor(null)} width={420}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
            This removes {stopFor.opportunity} from the follow-ups list for good. You can still send from the quote page anytime.
            {!WRITES_ENABLED && <span style={{ color: 'var(--warn)', fontStyle: 'italic' }}> Preview — writes are off, so this only clears it from your view.</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <button onClick={() => setStopFor(null)} disabled={stopBusy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: stopBusy ? 'default' : 'pointer' }}>Cancel</button>
            <button onClick={doStop} disabled={stopBusy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: stopBusy ? 'default' : 'pointer' }}>{stopBusy ? 'Working…' : 'Stop following up'}</button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
