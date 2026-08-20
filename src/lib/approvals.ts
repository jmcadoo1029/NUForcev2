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
