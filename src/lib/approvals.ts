import { restFetch } from './restFetch'
import type { ApprovalBlock } from './quoteGuards'

// Persist an approval decision directly (submit / approve / reject, and the won
// variants). Updates both the status column the dashboards/queues read AND the
// data blob the quote page reads, merging the new approval over the current blob
// so nothing else in the blob is disturbed. Callers gate on WRITES_ENABLED.

const patch = (id: string, body: Record<string, unknown>) =>
  restFetch('PATCH', `quotes?id=eq.${encodeURIComponent(id)}`, { body: { ...body, updated_at: new Date().toISOString() } })

/** Write the quote-approval decision (status column + submitted_by/approved_by + data.approval). */
export async function persistApproval(quoteId: string, approval: ApprovalBlock, data: Record<string, unknown>): Promise<void> {
  await patch(quoteId, {
    approval_status: approval.status || 'none',
    submitted_by: approval.submittedBy || null,
    approved_by: approval.decidedBy || null,
    data: { ...(data || {}), approval },
  })
}

/** Write the won-approval decision (won_approval_status column + data.wonApproval). */
export async function persistWonApproval(quoteId: string, wonApproval: ApprovalBlock, data: Record<string, unknown>): Promise<void> {
  await patch(quoteId, {
    won_approval_status: wonApproval.status || 'none',
    data: { ...(data || {}), wonApproval },
  })
}

// Dashboard-queue decisions: the queue doesn't hold the quote's full state, so we
// fetch the current data blob, merge the decision (preserving submit info +
// history), and persist. Returns the new status.

async function loadData(quoteId: string): Promise<Record<string, any>> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?id=eq.${encodeURIComponent(quoteId)}&select=data&limit=1`)
  return rows?.[0]?.data || {}
}

/** Approve or reject a pending quote from the dashboard queue. */
export async function decideApproval(quoteId: string, decision: 'approved' | 'rejected', comments: string, by: string): Promise<void> {
  const data = await loadData(quoteId)
  const prev = (data.approval || {}) as ApprovalBlock
  const at = new Date().toISOString()
  const next: ApprovalBlock = {
    ...prev,
    status: decision,
    decidedBy: by,
    decidedAt: at,
    comments,
    history: [...(prev.history || []), { event: decision, by, at, comments }],
  }
  await persistApproval(quoteId, next, data)
}

/** Approve or reject a pending Closed-Won from the dashboard queue. */
export async function decideWon(quoteId: string, decision: 'won_approved' | 'won_rejected', comments: string, by: string): Promise<void> {
  const data = await loadData(quoteId)
  const prev = (data.wonApproval || {}) as ApprovalBlock
  const at = new Date().toISOString()
  const next: ApprovalBlock = {
    ...prev,
    status: decision,
    decidedBy: by,
    decidedAt: at,
    comments,
    history: [...(prev.history || []), { event: decision, by, at, comments }],
  }
  await persistWonApproval(quoteId, next, data)
}

// ── Reopen requests ────────────────────────────────────────────────────────
// A non-approver viewing an approved+locked quote can ask an approver to reopen
// it for editing. The request lives in data.reopenRequest (status 'requested');
// it does NOT change approval_status, so the quote stays approved/locked until an
// approver acts. The dashboard "Needs your attention" surfaces open requests and
// the approver unlocks or dismisses from there. Callers gate on WRITES_ENABLED.

export interface ReopenRequest {
  status: 'requested' | 'cleared'
  requestedBy?: string
  requestedAt?: string
  reason?: string
  resolvedBy?: string
  resolvedAt?: string
  resolution?: 'unlocked' | 'dismissed'
}

/** A teammate asks an approver to reopen an approved+locked quote. Logs the ask
 *  in approval history but leaves approval_status untouched (stays locked). */
export async function requestReopen(quoteId: string, by: string, reason: string): Promise<void> {
  const data = await loadData(quoteId)
  const prevAp = (data.approval || {}) as ApprovalBlock
  const at = new Date().toISOString()
  const reopenRequest: ReopenRequest = { status: 'requested', requestedBy: by, requestedAt: at, reason: reason || '' }
  const approval: ApprovalBlock = { ...prevAp, history: [...(prevAp.history || []), { event: 'reopen_requested', by, at, comments: reason || '' }] }
  await patch(quoteId, { data: { ...data, approval, reopenRequest } })
}

/** Approver resolves a reopen request from the dashboard. 'unlock' reopens the
 *  quote (approval → none, needs re-approval) and clears the request; 'dismiss'
 *  just clears the request, leaving the quote approved/locked. */
export async function resolveReopen(quoteId: string, action: 'unlock' | 'dismiss', by: string): Promise<void> {
  const data = await loadData(quoteId)
  const at = new Date().toISOString()
  const prevReq = (data.reopenRequest || {}) as ReopenRequest
  if (action === 'unlock') {
    const prevAp = (data.approval || {}) as ApprovalBlock
    const nextAp: ApprovalBlock = {
      ...prevAp,
      status: 'none',
      submittedBy: '',
      submittedAt: '',
      decidedBy: '',
      decidedAt: '',
      comments: '',
      history: [...(prevAp.history || []), { event: 'reopened', by, at, comments: '' }],
    }
    await patch(quoteId, {
      approval_status: 'none',
      submitted_by: null,
      approved_by: null,
      data: { ...data, approval: nextAp, reopenRequest: { ...prevReq, status: 'cleared', resolvedBy: by, resolvedAt: at, resolution: 'unlocked' } },
    })
  } else {
    await patch(quoteId, { data: { ...data, reopenRequest: { ...prevReq, status: 'cleared', resolvedBy: by, resolvedAt: at, resolution: 'dismissed' } } })
  }
}
