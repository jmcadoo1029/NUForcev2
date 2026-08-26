import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, Modal } from '../../components'
import { useToast } from '../../components'
import { money } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fetchIsApprover } from '../../lib/perms'
import { decideApproval, decideWon, resolveReopen } from '../../lib/approvals'
import { notifyReopenUnlocked } from '../../lib/notify'
import { notifyQuoteApproved } from '../../lib/notify'
import { useApprovalQueue, type ApprovalRow } from './useApprovalQueue'

// "Needs your attention" — the pending-approval queues. This is where approvers
// approve/reject: the decision function lives here (the quote page links to it and
// can also decide). Writes gated by WRITES_ENABLED; the buttons show for approvers.

type Kind = 'quote' | 'won'
interface Target { row: ApprovalRow; kind: Kind; decision: 'approve' | 'reject' }

function Section({ title, rows, tone, isApprover, onDecide, selectedIds, onToggle, onSelectAll }: { title: string; rows: ApprovalRow[]; tone: string; isApprover: boolean; onDecide: (row: ApprovalRow, decision: 'approve' | 'reject') => void; selectedIds?: Set<string>; onToggle?: (id: string) => void; onSelectAll?: () => void }) {
  const actBtn = (bg: string, border: string, color: string): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.02em', padding: '4px 11px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${border}`, background: bg, color, flexShrink: 0 })
  const selectable = isApprover && !!onToggle && !!selectedIds
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedIds!.has(r.id))
  return (
    <div style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <span style={{ minWidth: 26, height: 26, borderRadius: 7, background: rows.length ? tone : '#f0f2f5', color: rows.length ? '#fff' : 'var(--dim)', fontWeight: 800, fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{rows.length}</span>
        <span style={{ fontWeight: 600 }}>{title}</span>
        {selectable && rows.length > 0 && (
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-caption)', color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={onSelectAll} /> Select all
          </label>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)', paddingLeft: 36 }}>All caught up.</div>
      ) : (
        <div>
          {rows.slice(0, 8).map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '8px 0 8px 12px', borderBottom: '1px solid var(--border)' }}>
              {selectable ? (
                <input type="checkbox" checked={selectedIds!.has(r.id)} onChange={() => onToggle!(r.id)} style={{ marginRight: 4, flexShrink: 0 }} />
              ) : <span style={{ width: 24, flexShrink: 0 }} />}
              <Link to={`/quote/${r.id}`} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.opportunity}</span>
                <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}{r.submittedBy ? ` · ${prettifyEmail(r.submittedBy)}` : ''}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(Number(r.total) || 0)}</span>
              </Link>
              {isApprover && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onDecide(r, 'approve')} style={actBtn('var(--pos)', 'var(--pos)', '#fff')}>Approve</button>
                  <button onClick={() => onDecide(r, 'reject')} style={actBtn('#fff', 'var(--accent)', 'var(--accent)')}>Reject</button>
                </div>
              )}
            </div>
          ))}
          {rows.length > 8 && <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)', paddingLeft: 36, marginTop: 6 }}>+{rows.length - 8} more</div>}
        </div>
      )}
    </div>
  )
}

function ReopenSection({ rows, isApprover, busyId, onResolve }: { rows: ApprovalRow[]; isApprover: boolean; busyId: string; onResolve: (row: ApprovalRow, action: 'unlock' | 'dismiss') => void }) {
  if (rows.length === 0) return null
  const actBtn = (bg: string, border: string, color: string): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.02em', padding: '4px 11px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${border}`, background: bg, color, flexShrink: 0 })
  return (
    <div style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <span style={{ minWidth: 26, height: 26, borderRadius: 7, background: 'var(--info)', color: '#fff', fontWeight: 800, fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{rows.length}</span>
        <span style={{ fontWeight: 600 }}>Reopen requests</span>
      </div>
      <div>
        {rows.slice(0, 8).map((r) => {
          const busy = busyId === r.id
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '8px 0 8px 36px', borderBottom: '1px solid var(--border)' }}>
              <Link to={`/quote/${r.id}`} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.opportunity}</span>
                <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}{r.submittedBy ? ` · ${prettifyEmail(r.submittedBy)}` : ''}{r.reason ? ` — “${r.reason}”` : ''}</span>
              </Link>
              {isApprover && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={busy} onClick={() => onResolve(r, 'unlock')} style={{ ...actBtn('var(--pos)', 'var(--pos)', '#fff'), opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>{busy ? '…' : 'Unlock'}</button>
                  <button disabled={busy} onClick={() => onResolve(r, 'dismiss')} style={{ ...actBtn('#fff', 'var(--border-strong)', 'var(--muted)'), opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>Dismiss</button>
                </div>
              )}
            </div>
          )
        })}
        {rows.length > 8 && <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)', paddingLeft: 36, marginTop: 6 }}>+{rows.length - 8} more</div>}
      </div>
    </div>
  )
}

export function ApprovalsCard() {
  const { data, err } = useApprovalQueue()
  const { showToast } = useToast()
  const [isApprover, setIsApprover] = useState(false)
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<Target | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [reopenBusyId, setReopenBusyId] = useState('')
  const [selQuote, setSelQuote] = useState<Set<string>>(new Set())
  const [massOpen, setMassOpen] = useState(false)
  const [massComment, setMassComment] = useState('')
  const me = getSessionEmail() || ''

  useEffect(() => { let alive = true; fetchIsApprover().then((v) => alive && setIsApprover(v)); return () => { alive = false } }, [])

  const quoteRows = (data?.quote || []).filter((r) => !decidedIds.has(r.id))
  const wonRows = (data?.won || []).filter((r) => !decidedIds.has(r.id))
  const reopenRows = (data?.reopen || []).filter((r) => !decidedIds.has(r.id))
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const resolveReopenNow = async (row: ApprovalRow, action: 'unlock' | 'dismiss') => {
    if (reopenBusyId) return
    setReopenBusyId(row.id)
    try {
      if (!WRITES_ENABLED) {
        showToast(`${row.opportunity} ${action === 'unlock' ? 'unlocked' : 'request dismissed'} (preview)`, 'info')
      } else {
        await resolveReopen(row.id, action, me)
        showToast(`${row.opportunity} ${action === 'unlock' ? 'reopened for editing' : 'reopen request dismissed'}`, 'success')
        // Let the requester know their quote is unlocked (best-effort).
        if (action === 'unlock') notifyReopenUnlocked({ requestedBy: row.submittedBy || '', opportunity: row.opportunity || '', unlockedByName: prettifyEmail(me) })
      }
      setDecidedIds((s) => new Set(s).add(row.id))
    } catch (e) {
      showToast('Reopen action failed: ' + errMsg(e), 'error', 6000)
    } finally {
      setReopenBusyId('')
    }
  }

  const toggleSel = (id: string) => setSelQuote((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAllQuotes = () => setSelQuote((s) => (quoteRows.length > 0 && quoteRows.every((r) => s.has(r.id)) ? new Set() : new Set(quoteRows.map((r) => r.id))))
  const selectedCount = quoteRows.filter((r) => selQuote.has(r.id)).length

  // Mass-approve every selected quote (best-effort per row; a failure skips just that one).
  const confirmMass = async () => {
    if (busy) return
    const targets = quoteRows.filter((r) => selQuote.has(r.id))
    if (targets.length === 0) return
    setBusy(true)
    let ok = 0
    try {
      for (const row of targets) {
        if (!WRITES_ENABLED) { ok++; continue }
        try {
          await decideApproval(row.id, 'approved', massComment.trim(), me)
          notifyQuoteApproved({ opportunity: row.opportunity || '', customer: row.customer || '', total: money(Number(row.total) || 0), approverName: prettifyEmail(me), submitterName: prettifyEmail(row.submittedBy || '') })
          ok++
        } catch { /* skip individual failures, keep going */ }
      }
      setDecidedIds((s) => { const n = new Set(s); targets.forEach((r) => n.add(r.id)); return n })
      showToast(WRITES_ENABLED ? `${ok} quote${ok !== 1 ? 's' : ''} approved` : `${targets.length} approved (preview)`, WRITES_ENABLED ? 'success' : 'info')
      setSelQuote(new Set()); setMassOpen(false); setMassComment('')
    } finally {
      setBusy(false)
    }
  }

  const confirmDecision = async () => {
    if (!target || busy) return
    const { row, kind, decision } = target
    setBusy(true)
    try {
      if (!WRITES_ENABLED) {
        showToast(`${row.opportunity} ${decision === 'approve' ? 'approved' : 'rejected'} (preview)`, 'info')
      } else if (kind === 'quote') {
        await decideApproval(row.id, decision === 'approve' ? 'approved' : 'rejected', comment.trim(), me)
        showToast(`${row.opportunity} ${decision === 'approve' ? 'approved' : 'rejected'}`, 'success')
        // Event 2: notify the send-group it's ready to send (best-effort; on approve only).
        if (decision === 'approve') {
          notifyQuoteApproved({
            opportunity: row.opportunity || '',
            customer: row.customer || '',
            total: money(Number(row.total) || 0),
            approverName: prettifyEmail(me),
            submitterName: prettifyEmail(row.submittedBy || ''),
          })
        }
      } else {
        await decideWon(row.id, decision === 'approve' ? 'won_approved' : 'won_rejected', comment.trim(), me)
        showToast(`${row.opportunity} Closed-Won ${decision === 'approve' ? 'approved' : 'rejected'}`, 'success')
      }
      setDecidedIds((s) => new Set(s).add(row.id))
      setTarget(null); setComment('')
    } catch (e) {
      showToast('Decision failed: ' + errMsg(e), 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  if (!err && data && quoteRows.length + wonRows.length + reopenRows.length === 0) {
    return (
      <Card style={{ marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 10, padding: '13px var(--sp-5)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pos)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>No action items pending — you&rsquo;re all caught up.</span>
      </Card>
    )
  }

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Needs your attention</CardLabel>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load approvals: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && data && (
        <>
          {isApprover && selectedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', background: 'var(--pos-soft)', border: '1px solid var(--pos-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 'var(--sp-3)' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)' }}>{selectedCount} selected</span>
              <button onClick={() => setSelQuote(new Set())} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
              <button onClick={() => { setMassComment(''); setMassOpen(true) }} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--pos)', border: 'none', borderRadius: 20, padding: '6px 16px', cursor: 'pointer' }}>Approve {selectedCount} selected</button>
            </div>
          )}
          <Section title="Quote approvals pending" rows={quoteRows} tone="var(--accent)" isApprover={isApprover} onDecide={(row, decision) => { setComment(''); setTarget({ row, kind: 'quote', decision }) }} selectedIds={selQuote} onToggle={toggleSel} onSelectAll={toggleAllQuotes} />
          <Section title="Won approvals pending" rows={wonRows} tone="var(--info)" isApprover={isApprover} onDecide={(row, decision) => { setComment(''); setTarget({ row, kind: 'won', decision }) }} />
          <ReopenSection rows={reopenRows} isApprover={isApprover} busyId={reopenBusyId} onResolve={resolveReopenNow} />
        </>
      )}

      {massOpen && (
        <Modal title={`Approve ${selectedCount} quote${selectedCount !== 1 ? 's' : ''}?`} onClose={() => !busy && setMassOpen(false)} width={460}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-2)' }}>Approves all {selectedCount} selected quote{selectedCount !== 1 ? 's' : ''} at once. Decision comment (optional) — applied to each.</div>
          <textarea value={massComment} onChange={(e) => setMassComment(e.target.value)} rows={3} placeholder="Add a note…" style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.5, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 'var(--sp-3)' }} />
          {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>Preview — writes are off, so this only clears them from your view.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <button onClick={() => setMassOpen(false)} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
            <button onClick={confirmMass} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--pos)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Approving…' : `Approve ${selectedCount}`}</button>
          </div>
        </Modal>
      )}

      {target && (
        <Modal title={`${target.decision === 'approve' ? 'Approve' : 'Reject'} ${target.kind === 'won' ? 'Closed-Won' : 'quote'} ${target.row.opportunity}?`} onClose={() => !busy && setTarget(null)} width={460}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-2)' }}>Decision comments (optional) — visible to the submitter.</div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Add a note…" style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.5, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 'var(--sp-3)' }} />
          {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>Preview — writes are off, so this only clears it from your view.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <button onClick={() => setTarget(null)} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
            <button onClick={confirmDecision} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: target.decision === 'approve' ? 'var(--pos)' : 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Saving…' : target.decision === 'approve' ? 'Approve' : 'Reject'}</button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
