import { useState } from 'react'
import { Button, Card, Modal } from '../../components'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { WRITES_ENABLED } from '../../lib/config'

// The approval / won-approval workflow bar. Two parallel state machines:
//   approval:    none → pending → approved | rejected
//   wonApproval: none → pending_won → won_approved | won_rejected
// Submit is open to anyone; approve/reject is gated to approvers. The parent
// persists each decision (persistApproval) and mirrors it to the dashboard queue.

export interface ApprovalState {
  status: string
  submittedBy?: string
  submittedById?: string
  submittedAt?: string
  decidedBy?: string
  decidedAt?: string
  comments?: string
  history?: { event: string; by: string; at: string; comments?: string }[]
}

const APPROVAL_BADGE: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending approval', tone: 'var(--warn)' },
  approved: { label: 'Approved', tone: 'var(--pos)' },
  rejected: { label: 'Rejected', tone: 'var(--accent)' },
}
const WON_BADGE: Record<string, { label: string; tone: string }> = {
  pending_won: { label: 'Closed-Won pending', tone: 'var(--warn)' },
  won_approved: { label: 'Won approved', tone: 'var(--pos)' },
  won_rejected: { label: 'Won rejected', tone: 'var(--accent)' },
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#fff', background: tone, padding: '3px 10px', borderRadius: 20 }}>{label}</span>
}

const who = (v?: string) => (v ? prettifyEmail(v) : '')

const EVENT_META: Record<string, { label: string; tone: string }> = {
  submitted: { label: 'Submitted for approval', tone: 'var(--info)' },
  approved: { label: 'Approved', tone: 'var(--pos)' },
  rejected: { label: 'Rejected', tone: 'var(--accent)' },
  submitted_won: { label: 'Submitted Closed-Won', tone: 'var(--info)' },
  won_approved: { label: 'Won approved', tone: 'var(--pos)' },
  won_rejected: { label: 'Won rejected', tone: 'var(--accent)' },
  reopen_requested: { label: 'Reopen requested', tone: 'var(--info)' },
  reopened: { label: 'Reopened for editing', tone: 'var(--warn)' },
  closed_lost: { label: 'Marked Closed Lost', tone: 'var(--accent)' },
}
const stamp = (iso: string) => {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return fmtDate(iso)
  }
}

interface HistEvent { event: string; by: string; at: string; comments?: string }

function ApprovalHistory({ events, onClose }: { events: HistEvent[]; onClose: () => void }) {
  return (
    <Modal title="Approval history" onClose={onClose} width={560}>
      {events.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No approval activity yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((e, i) => {
            const m = EVENT_META[e.event] || { label: e.event, tone: 'var(--muted)' }
            return (
              <div key={i} style={{ display: 'flex', gap: 'var(--sp-3)', padding: '10px 0', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.tone, marginTop: 5, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{who(e.by)}{e.at ? ` · ${stamp(e.at)}` : ''}</div>
                  {e.comments && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', marginTop: 3, fontStyle: 'italic' }}>“{e.comments}”</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export function ApprovalBar({
  approval,
  wonApproval,
  isApprover,
  isSalesforce,
  needsReapproval,
  locked,
  stage,
  reopenRequested,
  onSubmit,
  onApprove,
  onReject,
  onUnlock,
  onRequestReopen,
  onMarkLost,
  onSubmitWon,
  onWonApprove,
  onWonReject,
}: {
  approval: ApprovalState
  wonApproval: ApprovalState
  isApprover: boolean
  isSalesforce: boolean
  // Approved, but the approval was inherited from an earlier revision — this one
  // needs its own approval before it counts as approved (or can be sent).
  needsReapproval?: boolean
  locked: boolean
  stage: string
  // A reopen request is already pending an approver's decision for this quote.
  reopenRequested?: boolean
  onSubmit: () => void
  onApprove: (comments: string) => void
  onReject: (comments: string) => void
  onUnlock: () => void
  onRequestReopen?: (reason: string) => void
  // Mark the quote Closed Lost (any user, even when locked). Requires a note.
  // Absent while the quote is being edited (use the stage field there instead).
  onMarkLost?: (note: string) => void
  onSubmitWon: () => void
  onWonApprove: (comments: string) => void
  onWonReject: (comments: string) => void
}) {
  const [comments, setComments] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [lostOpen, setLostOpen] = useState(false)
  const [lostNote, setLostNote] = useState('')

  const allHistory = [...(approval.history || []), ...(wonApproval.history || [])].sort((a, b) => String(a.at).localeCompare(String(b.at)))

  const aStatus = approval.status || 'none'
  const wStatus = wonApproval.status || 'none'
  // An inherited approval reads as "approved" but isn't really — badge it amber so
  // it's obvious this revision still owes an approval (and why it's not in Ready to Send).
  const aBadge = needsReapproval ? { label: 'Needs re-approval', tone: 'var(--warn)' } : APPROVAL_BADGE[aStatus]
  const wBadge = WON_BADGE[wStatus]

  const canSubmit = aStatus === 'none' || aStatus === 'rejected' || (aStatus === 'approved' && !locked) || !!needsReapproval
  // A teammate can ask to reopen any locked quote that isn't mid-approval — covers
  // both approved-locked and won-locked quotes.
  const canRequestReopen = !isApprover && locked && aStatus !== 'pending' && !needsReapproval && !reopenRequested && !!onRequestReopen
  const pendingApprovalMine = aStatus === 'pending'
  const pendingWon = wStatus === 'pending_won'
  const canSubmitWon = stage === 'Closed Won' && wStatus === 'none'
  // Recording a loss is an outcome, not a re-price — any user can do it directly,
  // even on a locked/approved quote, without a reopen. Not offered on a quote
  // that's already closed, or one mid-approval decision.
  const canMarkLost = !!onMarkLost && stage !== 'Closed Lost' && stage !== 'Closed Won' && aStatus !== 'pending' && wStatus !== 'pending_won'

  const textarea: React.CSSProperties = { width: '100%', minHeight: 56, fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.5, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 'var(--sp-2)' }

  const nothingToShow = aStatus === 'none' && wStatus === 'none' && !canSubmitWon && !isSalesforce
  if (nothingToShow && !canSubmit && !canRequestReopen && !(isApprover && locked) && !canMarkLost) return null

  return (
    <Card style={{ padding: 'var(--sp-4) var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>Approval</span>
        {aBadge && <Badge label={aBadge.label} tone={aBadge.tone} />}
        {wBadge && <Badge label={wBadge.label} tone={wBadge.tone} />}
        {locked && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>· Locked{isSalesforce ? ' · imported from Salesforce' : ''}</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {allHistory.length > 0 && <Button variant="ghost" small onClick={() => setHistoryOpen(true)}>History</Button>}
          {canSubmit && <Button small onClick={onSubmit}>{aStatus === 'approved' && !needsReapproval ? 'Re-submit for approval' : 'Submit for approval'}</Button>}
          {canSubmitWon && <Button small onClick={onSubmitWon}>Submit Closed-Won</Button>}
          {canRequestReopen && <Button variant="secondary" small onClick={() => { setReopenReason(''); setReopenOpen(true) }}>Request reopen</Button>}
          {canMarkLost && <Button variant="secondary" small onClick={() => { setLostNote(''); setLostOpen(true) }}>Mark Closed Lost</Button>}
          {isApprover && locked && aStatus !== 'pending' && <Button variant="secondary" small onClick={onUnlock}>Reopen to edit</Button>}
        </div>
      </div>

      {/* New-revision cue: approved, but the approval was inherited. */}
      {needsReapproval && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginTop: 'var(--sp-2)' }}>
          This revision inherited its approval from an earlier revision. It needs its own approval before it's ready to send.
        </div>
      )}

      {/* Submitted / decided detail — hidden when the approval was inherited, since
          it describes the prior revision's decision, not this one's. */}
      {!needsReapproval && (approval.submittedBy || approval.decidedBy) && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          {approval.submittedBy && <span>Submitted by {who(approval.submittedBy)}{approval.submittedAt ? ` · ${fmtDate(approval.submittedAt)}` : ''}</span>}
          {approval.decidedBy && <span>{approval.submittedBy ? ' · ' : ''}{aStatus === 'approved' ? 'Approved' : aStatus === 'rejected' ? 'Rejected' : 'Decided'} by {who(approval.decidedBy)}{approval.decidedAt ? ` · ${fmtDate(approval.decidedAt)}` : ''}</span>}
        </div>
      )}
      {approval.comments && (aStatus === 'approved' || aStatus === 'rejected') && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', marginTop: 4, fontStyle: 'italic' }}>“{approval.comments}”</div>
      )}

      {/* Approved-and-locked note (imports land here too). Approvers instead see
          the Reopen button above, so only show this to non-approvers. */}
      {locked && !isApprover && aStatus !== 'pending' && !needsReapproval && (
        <div style={{ fontSize: 'var(--fs-sm)', color: reopenRequested ? 'var(--info)' : 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          {reopenRequested
            ? 'Reopen requested — an approver will review it and unlock the quote.'
            : `${aStatus === 'approved' ? 'Approved and locked' : 'Locked'}${isSalesforce ? ' (imported from Salesforce)' : ''}. Use “Request reopen” to ask an approver to unlock it for editing.`}
        </div>
      )}

      {/* Approver decision panel — regular quote */}
      {pendingApprovalMine && isApprover && (
        <div style={{ marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-2)' }}>Decision comments (optional)</div>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add a note for the submitter…" style={textarea} />
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <Button small onClick={() => { onApprove(comments); setComments('') }}>Approve</Button>
            <Button variant="secondary" small onClick={() => { onReject(comments); setComments('') }}>Reject</Button>
          </div>
        </div>
      )}
      {pendingApprovalMine && !isApprover && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>Awaiting an approver. The quote is locked until it's decided.</div>}

      {/* Approver decision panel — won */}
      {pendingWon && isApprover && (
        <div style={{ marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-2)' }}>Closed-Won decision comments (optional)</div>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add a note…" style={textarea} />
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <Button small onClick={() => { onWonApprove(comments); setComments('') }}>Approve Won</Button>
            <Button variant="secondary" small onClick={() => { onWonReject(comments); setComments('') }}>Reject Won</Button>
          </div>
        </div>
      )}
      {pendingWon && !isApprover && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>Closed-Won is awaiting an approver.</div>}

      {wonApproval.comments && (wStatus === 'won_approved' || wStatus === 'won_rejected') && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', marginTop: 4, fontStyle: 'italic' }}>Won: “{wonApproval.comments}” — {who(wonApproval.decidedBy)}</div>
      )}

      {!WRITES_ENABLED && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginTop: 'var(--sp-3)', fontStyle: 'italic' }}>Preview — writes are off, so approval actions won’t persist yet.</div>}

      {historyOpen && <ApprovalHistory events={allHistory} onClose={() => setHistoryOpen(false)} />}

      {reopenOpen && (
        <Modal title="Request reopen" onClose={() => setReopenOpen(false)} width={460}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-2)' }}>This asks an approver to unlock the quote so it can be edited. Add a reason (optional) — they'll see it on their dashboard.</div>
          <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} placeholder="Why does this need to reopen?" style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.5, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 'var(--sp-3)' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <Button variant="ghost" small onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button small onClick={() => { onRequestReopen?.(reopenReason.trim()); setReopenOpen(false) }}>Send request</Button>
          </div>
        </Modal>
      )}

      {lostOpen && (
        <Modal title="Mark Closed Lost" onClose={() => setLostOpen(false)} width={480}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 'var(--sp-3)' }}>
            Record why this quote was lost. Your note is added to the quote's chatter and the approvers are notified — no reopen needed. If the customer comes back, the quote can still be reopened. Imported quotes don't need to be converted first.
          </div>
          <textarea value={lostNote} onChange={(e) => setLostNote(e.target.value)} rows={3} placeholder="Why was it lost? (required — e.g. went with a competitor, project cancelled, budget)" style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.5, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 'var(--sp-3)' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <Button variant="ghost" small onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button small disabled={!lostNote.trim()} onClick={() => { onMarkLost?.(lostNote.trim()); setLostOpen(false) }}>Mark Closed Lost</Button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
