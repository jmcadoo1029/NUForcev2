import { useEffect, useState } from 'react'
import { Card, CardLabel, Modal, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fetchIsApprover } from '../../lib/perms'
import {
  fetchPendingRuns, fetchScheduleById, resolveRecipients, resolveTemplate, audienceLabel,
  approveRun, dismissRun, type ScheduledRun, type Schedule,
} from '../../lib/scheduler'
import type { Recipient } from '../../lib/massEmail'

// "Scheduled sends to review" — sits with the manager's Needs-Your-Attention cards.
// When the daily tick queues a schedule, it shows here; the manager reviews the
// resolved recipient list + email, then Sends (through the mass-email path) or
// Dismisses. Nothing goes out without this step. Renders nothing when the queue is
// empty or the viewer isn't an approver.

const relTime = (iso: string): string => {
  const t = new Date(iso).getTime(); if (isNaN(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 60) return `${Math.max(0, m)}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ReviewModal({ run, me, onClose, onDone }: { run: ScheduledRun; me: string; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [recipients, setRecipients] = useState<Recipient[] | null>(null)
  const [tpl, setTpl] = useState<{ subject: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await fetchScheduleById(run.schedule_id)
        if (!s) { if (alive) setErr('That schedule no longer exists (it may have been deleted). Dismiss this item.'); return }
        if (alive) setSchedule(s)
        const [recips, t] = await Promise.all([resolveRecipients(s), resolveTemplate(s)])
        if (alive) { setRecipients(recips); setTpl(t) }
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : String(e)) }
    })()
    return () => { alive = false }
  }, [run.schedule_id])

  const approve = async () => {
    if (!schedule || !recipients || !tpl || busy) return
    if (recipients.length === 0) { showToast('No one matches right now — dismiss it instead.', 'warn'); return }
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setBusy(true)
    try {
      const res = await approveRun(run, schedule, recipients, tpl.subject, tpl.body, me)
      if (res.notDeployed) { showToast('The mass-email function isn’t deployed.', 'error', 7000); return }
      if (!res.ok) { showToast('Send failed: ' + (res.error || 'unknown'), 'error', 7000); return }
      showToast(`Sent to ${res.sent ?? recipients.length}.`, 'success', 6000)
      onDone()
    } catch (e) {
      showToast('Send failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 7000)
    } finally { setBusy(false) }
  }

  const dismiss = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (WRITES_ENABLED) await dismissRun(run, me)
      showToast('Dismissed — nothing sent.', 'info')
      onDone()
    } catch (e) {
      showToast('Couldn’t dismiss: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setBusy(false) }
  }

  const loading = !err && (!schedule || !recipients || !tpl)
  const label: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4, marginTop: 'var(--sp-3)' }

  return (
    <Modal title={run.name || 'Review scheduled send'} onClose={() => !busy && onClose()} width={640}>
      {err ? (
        <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>{err}</div>
      ) : loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>Resolving recipients…</div>
      ) : (
        <>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
            {schedule && audienceLabel(schedule)} · <b>{recipients!.length}</b> recipient{recipients!.length !== 1 ? 's' : ''}
            {schedule?.kind === 'rule' && <span style={{ color: 'var(--dim)' }}> · cooldown {schedule.cooldown_months} mo</span>}
          </div>
          <label style={label}>Subject</label>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{tpl!.subject}</div>
          <label style={label}>Body <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--dim)' }}>· {'{first name}'} merges per recipient; your name/signature fill in on send</span></label>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', margin: 0, maxHeight: 200, overflowY: 'auto' }}>{tpl!.body}</pre>
          <label style={label}>Recipients</label>
          {recipients!.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', fontStyle: 'italic' }}>No one matches right now — you can dismiss this.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 180, overflowY: 'auto' }}>
              {recipients!.slice(0, 300).map((r) => (
                <div key={r.email} style={{ display: 'flex', gap: 'var(--sp-3)', padding: '5px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--fs-sm)' }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name || '(no name)'}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</span>
                </div>
              ))}
              {recipients!.length > 300 && <div style={{ padding: '6px 10px', fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>…and {recipients!.length - 300} more</div>}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            <Button variant="secondary" small disabled={busy} onClick={dismiss}>Dismiss</Button>
            <Button variant="primary" small disabled={busy || recipients!.length === 0} onClick={approve}>{busy ? 'Sending…' : `Send to ${recipients!.length}`}</Button>
          </div>
          {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)', textAlign: 'right' }}>Preview — writes are off, nothing sends.</div>}
        </>
      )}
    </Modal>
  )
}

export function ScheduledRunsCard() {
  const [isApprover, setIsApprover] = useState(false)
  const [runs, setRuns] = useState<ScheduledRun[] | null>(null)
  const [nonce, setNonce] = useState(0)
  const [open, setOpen] = useState<ScheduledRun | null>(null)
  const me = getSessionEmail() || ''

  useEffect(() => { let alive = true; fetchIsApprover().then((v) => alive && setIsApprover(v)).catch(() => {}); return () => { alive = false } }, [])
  useEffect(() => { let alive = true; fetchPendingRuns().then((r) => alive && setRuns(r)).catch(() => alive && setRuns([])); return () => { alive = false } }, [nonce])

  if (!isApprover || !runs || runs.length === 0) return null

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <CardLabel>Scheduled sends to review</CardLabel>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 20, padding: '2px 9px' }}>{runs.length}</span>
      </div>
      <div>
        {runs.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600 }}>{r.name || 'Scheduled send'}</span>
            <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{r.kind === 'rule' ? 'Rule drip' : 'Scheduled'} · queued {relTime(r.created_at)}</span>
            <button onClick={() => setOpen(r)} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '6px 14px', cursor: 'pointer' }}>Review &amp; send</button>
          </div>
        ))}
      </div>
      {open && <ReviewModal run={open} me={me} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setNonce((n) => n + 1) }} />}
    </Card>
  )
}
