import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import { baseOpp as baseOf } from '../../lib/opp'
import { approvalInherited } from '../../lib/approval'

// Ready-to-Send queue, ported from Classic. Approved + still-open + not
// dismissed, deduped to the latest revision per family, and only those NOT sent
// since their most recent approval. Oldest-approved first.

export interface ReadyRow {
  id: string
  opportunity: string
  customer: string
  total: number
  approvedAt: string
  daysInQueue: number
}

interface Raw {
  id: string
  opportunity?: string | null
  revision?: string | null
  customer?: string | null
  total?: number | null
  created_at?: string | null
  data?: { approval?: { decidedAt?: string }; qi?: { opp?: string; account?: string } }
}

async function load(): Promise<ReadyRow[]> {
  const approved =
    (await restFetch<Raw[]>(
      'GET',
      `quotes?select=id,opportunity,revision,customer,total,data,created_at,ready_to_send_dismissed_at&approval_status=eq.approved&ready_to_send_dismissed_at=is.null&stage=not.in.(${encodeURIComponent('Closed Won')},${encodeURIComponent('Closed Lost')})&limit=2000`,
    )) || []

  const familyMap = new Map<string, Raw>()
  approved.forEach((r) => {
    const key = baseOf(r.opportunity) || `__no_${r.id}`
    const cur = familyMap.get(key)
    if (!cur || String(r.revision || '') > String(cur.revision || '')) familyMap.set(key, r)
  })
  const latest = Array.from(familyMap.values())

  const sendMax: Record<string, string> = {}
  const ids = latest.map((r) => r.id)
  if (ids.length) {
    const idList = ids.map((id) => encodeURIComponent(id)).join(',')
    const fuRows =
      (await restFetch<{ quote_id: string; sent_at: string }[]>(
        'GET',
        `follow_ups?select=quote_id,sent_at&quote_id=in.(${idList})&sent_by=neq.manually_dismissed&or=(voided.is.null,voided.eq.false)`,
      )) || []
    fuRows.forEach((fu) => {
      const prev = sendMax[fu.quote_id]
      if (!prev || new Date(fu.sent_at) > new Date(prev)) sendMax[fu.quote_id] = fu.sent_at
    })
  }

  const nowMs = Date.now()
  return latest
    .map((r): ReadyRow | null => {
      const decidedAt = r.data?.approval?.decidedAt
      if (!decidedAt) return null
      // Drop revisions whose approval was inherited from the prior revision
      // (decided before this row was created) — they need their own approval.
      if (approvalInherited(decidedAt, r.created_at)) return null
      const lastSent = sendMax[r.id]
      if (lastSent && new Date(lastSent) >= new Date(decidedAt)) return null
      const approvedMs = new Date(decidedAt).getTime()
      if (isNaN(approvedMs)) return null
      return {
        id: r.id,
        opportunity: r.opportunity || r.data?.qi?.opp || '',
        customer: r.customer || r.data?.qi?.account || '',
        total: Number(r.total) || 0,
        approvedAt: decidedAt,
        daysInQueue: Math.floor((nowMs - approvedMs) / (1000 * 60 * 60 * 24)),
      }
    })
    .filter((x): x is ReadyRow => x !== null)
    .sort((a, b) => new Date(a.approvedAt).getTime() - new Date(b.approvedAt).getTime())
}

/**
 * Remove a quote from the Ready-to-Send queue by stamping
 * ready_to_send_dismissed_at (the queue query filters on it being null). A
 * single-column update on `quotes`; callers gate on WRITES_ENABLED. Reversible by
 * clearing the column in the DB — the quote itself is untouched.
 */
export async function dismissReadyToSend(quoteId: string): Promise<void> {
  await restFetch('PATCH', `quotes?id=eq.${encodeURIComponent(quoteId)}`, {
    body: { ready_to_send_dismissed_at: new Date().toISOString() },
  })
}

export function useReadyToSend() {
  const [data, setData] = useState<ReadyRow[] | null>(null)
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
