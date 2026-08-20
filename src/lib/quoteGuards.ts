// Pure save-time guards, ported from Classic's save handler. These decide what a
// save should confirm/require before it writes; the UI wires the confirm dialogs
// and calls the writer. Kept pure (no I/O) so they're trivially testable and the
// write path can compose them however it needs.

export interface ApprovalHistoryEvent { event: string; by: string; at: string; comments?: string }
export interface ApprovalBlock {
  status: string
  submittedBy?: string
  submittedAt?: string
  decidedBy?: string
  decidedAt?: string
  comments?: string
  history?: ApprovalHistoryEvent[]
}

/** True when the revision letter differs from what's saved — the trigger for the
 *  "new revision vs overwrite" decision. */
export function isRevisionChange(oldRev?: string | null, newRev?: string | null): boolean {
  return (oldRev || '').toString().trim() !== (newRev || '').toString().trim()
}

/**
 * Describe an opportunity-number change so the save handler can confirm it and,
 * when it looks like a revision (26-224 → 26-224A), remind the user to set the
 * Quote Revision field. Mirrors Classic's splitRev logic.
 */
export function oppChangeInfo(oldOpp?: string | null, newOpp?: string | null): { changed: boolean; looksLikeRev: boolean; newLetter: string } {
  const o = (oldOpp || '').toString().trim()
  const n = (newOpp || '').toString().trim()
  const changed = !!o && o !== n
  const split = (s: string) => {
    const m = s.match(/^(.*?)([A-Za-z])$/)
    return m ? { base: m[1], letter: m[2].toUpperCase() } : { base: s, letter: '' }
  }
  const op = split(o)
  const np = split(n)
  const looksLikeRev = !!np.letter && np.base.toUpperCase() === op.base.toUpperCase() && np.letter !== op.letter
  return { changed, looksLikeRev, newLetter: np.letter }
}

/**
 * Account must be linked to an existing client (qi.clientId) — free-text accounts
 * aren't allowed (clients are created in Workspace). Returns true when linked.
 */
export function accountLinked(qi?: { clientId?: unknown; account?: unknown } | null): boolean {
  const id = qi?.clientId
  return id !== undefined && id !== null && id !== ''
}

/**
 * Fresh approval for a NEW revision. A revised quote must earn its own approval,
 * so we clear the inherited decision (status → none, decision fields blanked) while
 * preserving history for the audit trail. This is the same rule the Ready-to-Send
 * queue and the "needs re-approval" badge already assume — enforced here at write
 * time so a new revision is never persisted as approved.
 */
export function resetApprovalForNewRevision(prev: ApprovalBlock | null | undefined, currentUser: string, oldLabel: string, newLabel: string, at: string): ApprovalBlock {
  return {
    status: 'none',
    submittedBy: '',
    submittedAt: '',
    decidedBy: '',
    decidedAt: '',
    comments: '',
    history: [
      ...((prev?.history) || []),
      { event: 'revision_reset', by: currentUser, at, comments: `New revision "${newLabel}" created from "${oldLabel}" — prior approval cleared; re-approval required.` },
    ],
  }
}
