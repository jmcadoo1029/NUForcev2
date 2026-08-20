// Shared approval helpers. The key idea: a quote saved as a NEW revision inherits
// the prior revision's approval blob (Classic copies the quote forward without
// clearing it), so a fresh, un-re-approved revision can read as `approved` with a
// `decidedAt` that predates its own creation. A genuine approval is always decided
// at/after the row exists; an inherited one is decided before. We use that to tell
// the two apart — both for the Ready-to-Send queue and the "needs re-approval" cue.

// Grace window absorbing clock skew when a quote is approved on its first save
// (client-generated decidedAt vs. server-generated created_at). Inherited
// approvals predate creation by far more than this (a revision is created well
// after the original was approved), so the window cleanly separates the two.
export const INHERITED_APPROVAL_GRACE_MS = 5 * 60 * 1000

/**
 * True when an approval was inherited from a prior revision — i.e. it was decided
 * meaningfully before this row was created, so it doesn't belong to this revision.
 * Missing/unparseable timestamps are treated as "not inherited" (fail open).
 */
export function approvalInherited(decidedAt?: string | null, createdAt?: string | null): boolean {
  if (!decidedAt || !createdAt) return false
  const d = new Date(decidedAt).getTime()
  const c = new Date(createdAt).getTime()
  if (isNaN(d) || isNaN(c)) return false
  return d < c - INHERITED_APPROVAL_GRACE_MS
}

/**
 * True when a quote is marked `approved` but that approval was inherited from a
 * prior revision — so this revision still needs its own approval before it's
 * really approved (and before it can be sent).
 */
export function needsReapproval(approvalStatus?: string | null, decidedAt?: string | null, createdAt?: string | null): boolean {
  return approvalStatus === 'approved' && approvalInherited(decidedAt, createdAt)
}
