import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'

// Pending approvals, read-only. Two tracks, matching Classic:
//   • quote approvals  — approval_status = pending
//   • won approvals    — won_approval_status = pending_won
// (Approve/reject actions are writes — Phase 7. This just surfaces the queue.)
// Later this card gets capability-gated to approvers (nuforce_approve_quotes).

export interface ApprovalRow {
  id: string
  opportunity: string | null
  customer: string | null
  total: number | null
  submittedBy: string | null
  reason?: string | null
}

interface RawRow {
  id: string
  opportunity?: string | null
  customer?: string | null
  total?: number | null
  data?: {
    approval?: { submittedBy?: string }
    wonApproval?: { submittedBy?: string }
    reopenRequest?: { requestedBy?: string; reason?: string }
  }
}

export interface ApprovalQueue {
  quote: ApprovalRow[]
  won: ApprovalRow[]
  reopen: ApprovalRow[]
}

function mapRows(rows: RawRow[], kind: 'quote' | 'won'): ApprovalRow[] {
  return (rows || []).map((r) => ({
    id: r.id,
    opportunity: r.opportunity ?? null,
    customer: r.customer ?? null,
    total: r.total ?? null,
    submittedBy: (kind === 'won' ? r.data?.wonApproval?.submittedBy : r.data?.approval?.submittedBy) ?? null,
  }))
}

function mapReopen(rows: RawRow[]): ApprovalRow[] {
  return (rows || []).map((r) => ({
    id: r.id,
    opportunity: r.opportunity ?? null,
    customer: r.customer ?? null,
    total: r.total ?? null,
    submittedBy: r.data?.reopenRequest?.requestedBy ?? null,
    reason: r.data?.reopenRequest?.reason ?? null,
  }))
}

async function load(): Promise<ApprovalQueue> {
  const cols = 'id,opportunity,customer,total,data'
  const [q, w, ro] = await Promise.all([
    restFetch<RawRow[]>('GET', `quotes?select=${cols}&approval_status=eq.pending&order=updated_at.desc&limit=50`),
    restFetch<RawRow[]>('GET', `quotes?select=${cols}&won_approval_status=eq.pending_won&order=updated_at.desc&limit=50`),
    restFetch<RawRow[]>('GET', `quotes?select=${cols}&data->reopenRequest->>status=eq.requested&order=updated_at.desc&limit=50`),
  ])
  return { quote: mapRows(q, 'quote'), won: mapRows(w, 'won'), reopen: mapReopen(ro) }
}

export function useApprovalQueue() {
  const [data, setData] = useState<ApprovalQueue | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [])

  return { data, err }
}
