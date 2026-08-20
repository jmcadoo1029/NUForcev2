import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'

// Quotes created in the current month, net of revisions (latest rev per family),
// for the Manager list — matches Classic's "created this month" view.

export interface MonthQuote {
  id: string
  opportunity: string | null
  customer: string | null
  total: number | null
  updated_at: string | null
  bucket: 'new' | 'revision'
}

interface Raw {
  id: string
  opportunity?: string | null
  revision?: string | null
  customer?: string | null
  total?: number | null
  updated_at?: string | null
}

async function load(): Promise<MonthQuote[]> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const rows =
    (await restFetch<Raw[]>(
      'GET',
      `quotes?select=id,opportunity,revision,customer,total,created_at,updated_at&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}`,
    )) || []

  // A family is "new" if a blank-rev original was created this month; otherwise
  // only a revision landed this month ("revision").
  const baseHasBlank = new Set<string>()
  rows.forEach((r) => {
    if (!r.revision || String(r.revision).trim() === '') baseHasBlank.add(baseOpp(r.opportunity))
  })

  const familyMap = new Map<string, Raw>()
  rows.forEach((r) => {
    const key = baseOpp(r.opportunity) || `__id_${r.id}`
    const cur = familyMap.get(key)
    if (!cur || revRank(r.revision) > revRank(cur.revision)) familyMap.set(key, r)
  })

  return Array.from(familyMap.entries())
    .map(([key, r]) => ({
      id: r.id,
      opportunity: r.opportunity ?? null,
      customer: r.customer ?? null,
      total: r.total ?? null,
      updated_at: r.updated_at ?? null,
      bucket: (baseHasBlank.has(key) ? 'new' : 'revision') as 'new' | 'revision',
    }))
    .sort((a, b) => (b.opportunity || '').localeCompare(a.opportunity || '', undefined, { numeric: true }))
}

export function useQuotesThisMonth() {
  const [data, setData] = useState<MonthQuote[] | null>(null)
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
