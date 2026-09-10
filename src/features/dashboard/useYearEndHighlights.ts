import { useEffect, useRef, useState } from 'react'
import { restFetchAll } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'
import { lineItemsFromData, type QuoteData } from '../../data/quoteModel'
import { codeReportLabel } from './codeReport'

// Year-end highlights — per-calendar-year rollups over ALL history, computed once
// (client-side) so the panel can flip between years and compute a trailing 3-year
// average without re-querying. Quoted metrics bucket by created_at year (matching the
// YTD tile / net-of-revisions dedup); won metrics bucket by won_date year. Loads lazily
// (only when the panel is first expanded) because it pulls every quote's data blob.

export interface CodeAgg {
  code: string
  label: string
  count: number // distinct quotes that include this code
  value: number // summed extended line value (unit price × qty) for this code
}
export interface YearStats {
  year: number
  quoteCount: number
  quotedValue: number
  wonCount: number
  wonValue: number
  newWonCount: number
  newWonValue: number
  highestWon: { opp: string; customer: string; total: number } | null
  quotedByCode: CodeAgg[] // sorted desc by value
  wonNewByCode: CodeAgg[] // new-business won, sorted desc by value
}
export interface YearEndData {
  years: number[] // ascending
  byYear: Record<number, YearStats>
}

interface Q {
  id: string
  opportunity?: string | null
  revision?: string | null
  customer?: string | null
  total?: number | null
  stage?: string | null
  created_at?: string | null
  won_date?: string | null
  data?: QuoteData & { qi?: { type?: string; account?: string; stage?: string }; wonInfo?: { wonDate?: string } }
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

/** Keep the highest-revision row per family (base opportunity). */
function latestPerBase(rows: Q[]): Q[] {
  const m = new Map<string, Q>()
  rows.forEach((r) => {
    const key = baseOpp(r.opportunity) || `__id_${r.id}`
    const cur = m.get(key)
    if (!cur || revRank(r.revision) > revRank(cur.revision)) m.set(key, r)
  })
  return Array.from(m.values())
}

function yearFromDate(s?: string | null): number | null {
  if (!s) return null
  const m = String(s).match(/(\d{4})-\d{2}-\d{2}/)
  const y = m ? parseInt(m[1], 10) : new Date(s).getFullYear()
  return y >= 2000 && y <= 2099 ? y : null
}
const wonYearOf = (q: Q): number | null => yearFromDate(q.won_date) ?? yearFromDate(q.data?.wonInfo?.wonDate)

/** Aggregate product codes across a set of quote families: per code, how many quotes
 *  include it and the summed extended line value. */
function aggCodes(families: Q[]): CodeAgg[] {
  const m = new Map<string, { count: number; value: number }>()
  families.forEach((q) => {
    const seen = new Set<string>()
    lineItemsFromData(q.data).forEach((l) => {
      const code = String(l.code || '').trim()
      if (!code) return
      const cur = m.get(code) || { count: 0, value: 0 }
      cur.value += l.price * l.qty
      if (!seen.has(code)) { cur.count += 1; seen.add(code) }
      m.set(code, cur)
    })
  })
  return Array.from(m.entries())
    .map(([code, v]) => ({ code, label: codeReportLabel(code) || code, count: v.count, value: v.value }))
    .sort((a, b) => b.value - a.value)
}

async function load(): Promise<YearEndData> {
  const all = (await restFetchAll<Q>('quotes?select=id,opportunity,revision,customer,total,stage,created_at,won_date,data&order=id')) || []

  const byCreatedYear = new Map<number, Q[]>()
  const byWonYear = new Map<number, Q[]>()
  const push = (m: Map<number, Q[]>, y: number, q: Q) => { const a = m.get(y); if (a) a.push(q); else m.set(y, [q]) }

  for (const q of all) {
    const cy = yearFromDate(q.created_at)
    if (cy != null) push(byCreatedYear, cy, q)
    const stage = q.stage || q.data?.qi?.stage || ''
    if (stage === 'Closed Won') {
      const wy = wonYearOf(q)
      if (wy != null) push(byWonYear, wy, q)
    }
  }

  const years = Array.from(new Set([...byCreatedYear.keys(), ...byWonYear.keys()])).sort((a, b) => a - b)
  const byYear: Record<number, YearStats> = {}
  for (const y of years) {
    const quotedFams = latestPerBase(byCreatedYear.get(y) || [])
    const wonFams = latestPerBase(byWonYear.get(y) || [])
    const newWonFams = wonFams.filter((q) => q.data?.qi?.type !== 'Existing Business')
    const highestWon = wonFams.reduce<YearStats['highestWon']>((best, q) => {
      const t = num(q.total)
      return !best || t > best.total ? { opp: q.opportunity || '', customer: q.customer || q.data?.qi?.account || '(Unknown)', total: t } : best
    }, null)
    byYear[y] = {
      year: y,
      quoteCount: quotedFams.length,
      quotedValue: quotedFams.reduce((a, q) => a + num(q.total), 0),
      wonCount: wonFams.length,
      wonValue: wonFams.reduce((a, q) => a + num(q.total), 0),
      newWonCount: newWonFams.length,
      newWonValue: newWonFams.reduce((a, q) => a + num(q.total), 0),
      highestWon,
      quotedByCode: aggCodes(quotedFams),
      wonNewByCode: aggCodes(newWonFams),
    }
  }
  return { years, byYear }
}

/** Loads only once, and only after `enabled` becomes true (panel expanded). */
export function useYearEndHighlights(enabled: boolean) {
  const [data, setData] = useState<YearEndData | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    let alive = true
    setLoading(true)
    load()
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setErr(String(e?.message || e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [enabled])
  return { data, err, loading }
}
