import { useEffect, useState } from 'react'
import { restFetchAll } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'

// Year-to-date metrics, net of revisions. Quotes created this year vs. closed-won
// this year, with the won new/existing split. Ported from Classic's YTD block.

export interface YtdMetrics {
  year: number
  quotedCount: number
  quotedTotal: number
  wonTotal: number
  wonPctOfQuoted: number
  wonNewTotal: number
  wonExistingTotal: number
  wonNewPct: number
  wonExistingPct: number
}

interface Row {
  id: string
  opportunity?: string | null
  revision?: string | null
  total?: number | null
  data?: { qi?: { type?: string } }
}

function latestPerBase(rows: Row[]): Row[] {
  const m = new Map<string, Row>()
  rows.forEach((r) => {
    const key = baseOpp(r.opportunity) || `__id_${r.id}`
    const cur = m.get(key)
    if (!cur || revRank(r.revision) > revRank(cur.revision)) m.set(key, r)
  })
  return Array.from(m.values())
}
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

async function load(): Promise<YtdMetrics> {
  const now = new Date()
  const year = now.getFullYear()
  const start = new Date(year, 0, 1).toISOString()
  const end = new Date(year + 1, 0, 1).toISOString()

  const [createdRaw, wonRaw] = await Promise.all([
    restFetchAll<Row>(`quotes?select=id,opportunity,revision,total,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&order=id`),
    restFetchAll<Row>(`quotes?select=id,opportunity,revision,total,won_date,data&stage=eq.Closed%20Won&won_date=gte.${start.slice(0, 10)}&won_date=lt.${end.slice(0, 10)}&order=id`),
  ])

  const quotedNet = latestPerBase(createdRaw || [])
  const wonNet = latestPerBase(wonRaw || [])
  const quotedTotal = quotedNet.reduce((a, q) => a + num(q.total), 0)
  const wonTotal = wonNet.reduce((a, q) => a + num(q.total), 0)
  let wonNewTotal = 0
  let wonExistingTotal = 0
  wonNet.forEach((q) => {
    if (q.data?.qi?.type === 'Existing Business') wonExistingTotal += num(q.total)
    else wonNewTotal += num(q.total)
  })

  return {
    year,
    quotedCount: quotedNet.length,
    quotedTotal,
    wonTotal,
    wonPctOfQuoted: pct(wonTotal, quotedTotal),
    wonNewTotal,
    wonExistingTotal,
    wonNewPct: pct(wonNewTotal, wonTotal),
    wonExistingPct: pct(wonExistingTotal, wonTotal),
  }
}

export function useYtdMetrics() {
  const [data, setData] = useState<YtdMetrics | null>(null)
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
