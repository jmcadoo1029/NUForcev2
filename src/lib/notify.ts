import { invokeFunction } from './workspace'
import { restFetch } from './restFetch'

// NUForce approval-workflow notifications, ported from Classic. All go through the
// shared `send-notification` edge function (Russ/Workspace-owned), which keys on
// `type` and resolves recipients itself. Every call is best-effort — a failed
// notification must never block or fail the user-visible action.

const APPROVALS_URL = 'https://nuforce.nulabs.com/#dashboard'

const warn = (label: string, e: unknown) => console.warn(`[NOTIFY] ${label} failed:`, e instanceof Error ? e.message : e)

export interface PendingSubmitter { submittedById: string }

/**
 * Notify approvers that a quote (or Closed-Won) was submitted. The payload is the
 * set of currently-pending submitters' Workspace employees.id; the function
 * resolves recipients (approvers, minus self-submitters) and composes the email.
 * No ids → nothing to send.
 */
export async function notifyQuoteSubmitted(pending: PendingSubmitter[]): Promise<void> {
  if (!pending.length) return
  try {
    await invokeFunction('send-notification', {
      type: 'nuforce_quote_submitted',
      data: { pending, approvalsUrl: APPROVALS_URL },
    })
  } catch (e) {
    warn('quote_submitted', e)
  }
}

export interface QuoteApprovedData {
  opportunity: string
  customer: string
  total: string // already money-formatted
  approverName: string
  submitterName: string
}

/** Notify the "send approved quotes" group that a quote is approved and ready to send. */
export async function notifyQuoteApproved(d: QuoteApprovedData): Promise<void> {
  try {
    await invokeFunction('send-notification', {
      type: 'nuforce_quote_approved',
      data: { ...d, linkUrl: APPROVALS_URL },
    })
  } catch (e) {
    warn('quote_approved', e)
  }
}

export interface ReopenUnlockedData {
  requestedBy: string // the teammate who asked for the reopen (their email)
  opportunity: string
  unlockedByName: string
}

/** Notify the teammate who requested a reopen that an approver has unlocked the
 *  quote for them. Recipient is the specific requester (data.requestedBy). */
export async function notifyReopenUnlocked(d: ReopenUnlockedData): Promise<void> {
  if (!d.requestedBy) return
  try {
    await invokeFunction('send-notification', {
      type: 'nuforce_reopen_unlocked',
      data: { ...d, linkUrl: `https://nuforce.nulabs.com/quote/${encodeURIComponent(d.opportunity)}` },
    })
  } catch (e) {
    warn('reopen_unlocked', e)
  }
}

/**
 * Submitter employees.id for every quote currently pending approval — the queue
 * snapshot the submit notification wants. Quotes submitted before this shipped
 * lack the id and are dropped (they age out as decisions are made). Best-effort.
 */
export async function fetchPendingSubmitterIds(): Promise<string[]> {
  try {
    const rows = await restFetch<{ sid: string | null }[]>(
      'GET',
      `quotes?select=sid:data->approval->>submittedById&approval_status=eq.pending&limit=300`,
    )
    return (rows || []).map((r) => r.sid).filter((x): x is string => !!x)
  } catch {
    return []
  }
}
