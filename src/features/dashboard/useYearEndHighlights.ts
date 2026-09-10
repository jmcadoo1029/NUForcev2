import { useEffect, useRef, useState } from 'react'
import { restFetchAll } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'
import { lineItemsFromData, type QuoteData } from '../../data/quoteModel'
import { codeReportLabel } from './codeReport'

// Year-end highlights — per-calendar-year rollups over ALL history, computed once
// (client-side) so the panel can flip between years and compute a trailing 3-year
// average without re-querying. Loads lazily (only when first expanded) because it pulls
// every quote's data blob.
//
// Quoted value is NET OF REVISIONS (same rule as the monthly KPI / trend): a new family's
// latest total in the year its ORIGINAL was created, plus only the DELTA of revisions saved
// this year (vs the prior revision) for older, active families. Won metrics bucket by won
// date. "New business" = data.qi.type !== 'Existing Business'.

export interface CodeAgg {
  code: string
  label: string
  count: number // distinct quotes that include this code
  value: number // summed extended line value (unit price × qty)
}
export interface Award {
  opp: string
  customer: string
  total: number
}
export interface Change {
  opp: string
  customer: string
  delta: number
}
export interface YearStats {
  year: number
  quoteCount: number // new families originated this year (net of revisions)
  quotedValue: number // net: new-family totals + revision deltas
  wonCount: number
  wonValue: number
  newWonCount: number
  newWonValue: number
  highestNewWon: Award | null // highest NEW-business closed quote
  bestCustomer: { name: string; wonValue: number; wonCount: number } | null
  bestProduct: CodeAgg | null // top product code by won value
  mostChangedUp: Change | null // revision this year with the biggest value increase
  mostChangedDown: Change | null // …biggest decrease
  quotedByCode: CodeAgg[] // sorted desc by value
  wonNewByCode: CodeAgg[]
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
const customerOf = (q: Q) => (q.customer || q.data?.qi?.account || '(Unknown)').trim() || '(Unknown)'
const stageOf = (q: Q) => q.stage || q.data?.qi?.stage || ''

function msOf(s?: string | null): number {
  const t = s ? new Date(s).getTime() : NaN
  return isNaN(t) ? Infinity : t
}
function yearFromDate(s?: string | null): number | null {
  if (!s) return null
  const m = String(s).match(/(\d{4})-\d{2}-\d{2}/)
  const y = m ? parseInt(m[1], 10) : new Date(s).getFullYear()
  return y >= 2000 && y <= 2099 ? y : null
}
const wonYearOf = (q: Q): number | null => yearFromDate(q.won_date) ?? yearFromDate(q.data?.wonInfo?.wonDate)

/** Keep the highest-revision row per family. */
function latestPerBase(rows: Q[]): Q[] {
  const m = new Map<string, Q>()
  rows.forEach((r) => {
    const key = baseOpp(r.opportunity) || `__id_${r.id}`
    const cur = m.get(key)
    if (!cur || revRank(r.revision) > revRank(cur.revision)) m.set(key, r)
  })
  return Array.from(m.values())
}

/** The opportunity string of the revision just BEFORE this one ('26-9B' → '26-9A', 'A' → base). */
function priorRevOppOf(opp?: string | null, rev?: string | null): string | null {
  const letter = String(rev || '').trim().toUpperCase()
  if (!/^[A-Z]$/.test(letter)) return null
  const base = baseOpp(opp)
  return letter === 'A' ? base : base + String.fromCharCode(letter.charCodeAt(0) - 1)
}

/** Per code across a set of quote families: how many quotes include it, summed extended value. */
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

  // Indexes shared across years.
  const byOpp = new Map<string, Q>() // exact opportunity string → row (for prior-rev lookup)
  const famRows = new Map<string, Q[]>() // baseOpp → all its revision rows
  const byCreatedYear = new Map<number, Q[]>()
  const byWonYear = new Map<number, Q[]>()
  const push = (m: Map<number, Q[]>, y: number, q: Q) => { const a = m.get(y); if (a) a.push(q); else m.set(y, [q]) }

  for (const q of all) {
    if (q.opportunity) byOpp.set(q.opportunity, q)
    const b = baseOpp(q.opportunity) || `__id_${q.id}`
    const fr = famRows.get(b); if (fr) fr.push(q); else famRows.set(b, [q])
    const cy = yearFromDate(q.created_at)
    if (cy != null) push(byCreatedYear, cy, q)
    if (stageOf(q) === 'Closed Won') { const wy = wonYearOf(q); if (wy != null) push(byWonYear, wy, q) }
  }

  // Each family's ORIGIN created-time (its blank-rev row, else its earliest row).
  const familyOriginMs = new Map<string, number>()
  famRows.forEach((rows, b) => {
    const blank = rows.find((r) => revRank(r.revision) === -1)
    const originMs = blank ? msOf(blank.created_at) : Math.min(...rows.map((r) => msOf(r.created_at)))
    familyOriginMs.set(b, originMs)
  })

  const years = Array.from(new Set([...byCreatedYear.keys(), ...byWonYear.keys()])).sort((a, b) => a - b)
  const byYear: Record<number, YearStats> = {}

  for (const y of years) {
    const yStartMs = new Date(y, 0, 1).getTime()
    const rowsCreated = byCreatedYear.get(y) || []

    // ── Net-of-revisions quoted value + count ──
    const hasBlank = new Set<string>()
    rowsCreated.forEach((r) => { if (revRank(r.revision) === -1) hasBlank.add(baseOpp(r.opportunity)) })
    const groups = new Map<string, Q>() // latest rev per base among THIS year's created rows
    rowsCreated.forEach((r) => { const b = baseOpp(r.opportunity) || `__id_${r.id}`; const cur = groups.get(b); if (!cur || revRank(r.revision) > revRank(cur.revision)) groups.set(b, r) })
    let newCount = 0
    let newTotal = 0
    groups.forEach((latest, b) => { if (hasBlank.has(b)) { newCount += 1; newTotal += num(latest.total) } })

    let revDelta = 0
    let mostChangedUp: Change | null = null
    let mostChangedDown: Change | null = null
    rowsCreated.forEach((r) => {
      if (revRank(r.revision) < 1) return // lettered revisions only
      if (stageOf(r) === 'Closed Lost') return // active quoting only
      const originMs = familyOriginMs.get(baseOpp(r.opportunity)) ?? Infinity
      if (originMs >= yStartMs) return // original is also this year → already in newTotal
      const priorOpp = priorRevOppOf(r.opportunity, r.revision)
      const prior = priorOpp ? byOpp.get(priorOpp) : undefined
      if (!prior) return
      const delta = num(r.total) - num(prior.total)
      revDelta += delta
      const c: Change = { opp: r.opportunity || '', customer: customerOf(r), delta }
      if (delta > 0 && (!mostChangedUp || delta > mostChangedUp.delta)) mostChangedUp = c
      if (delta < 0 && (!mostChangedDown || delta < mostChangedDown.delta)) mostChangedDown = c
    })

    // ── Won ──
    const wonFams = latestPerBase(byWonYear.get(y) || [])
    const newWonFams = wonFams.filter((q) => q.data?.qi?.type !== 'Existing Business')
    const highestNewWon = newWonFams.reduce<Award | null>((best, q) => {
      const t = num(q.total)
      return !best || t > best.total ? { opp: q.opportunity || '', customer: customerOf(q), total: t } : best
    }, null)
    const custMap = new Map<string, { value: number; count: number }>()
    wonFams.forEach((q) => { const c = customerOf(q); const cur = custMap.get(c) || { value: 0, count: 0 }; cur.value += num(q.total); cur.count += 1; custMap.set(c, cur) })
    let bestCustomer: YearStats['bestCustomer'] = null
    custMap.forEach((v, name) => { if (!bestCustomer || v.value > bestCustomer.wonValue) bestCustomer = { name, wonValue: v.value, wonCount: v.count } })
    const wonByCode = aggCodes(wonFams)

    byYear[y] = {
      year: y,
      quoteCount: newCount,
      quotedValue: newTotal + revDelta,
      wonCount: wonFams.length,
      wonValue: wonFams.reduce((a, q) => a + num(q.total), 0),
      newWonCount: newWonFams.length,
      newWonValue: newWonFams.reduce((a, q) => a + num(q.total), 0),
      highestNewWon,
      bestCustomer,
      bestProduct: wonByCode[0] || null,
      mostChangedUp,
      mostChangedDown,
      quotedByCode: aggCodes(latestPerBase(rowsCreated)),
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
