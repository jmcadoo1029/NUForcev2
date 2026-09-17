import { useEffect, useState } from 'react'
import { restFetchAll } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'

// Year-to-date metrics, NET OF REVISIONS — the same rule as Year-End Highlights, the
// monthly trend, and this card's own this-month-vs-average row. "Quotes created" counts
// only families ORIGINATED this year; the quoted value is those new-family totals plus
// the DELTA of any revisions saved this year on older, still-active families. That way a
// re-quote of a prior-year opportunity is not double-counted as a new quote this year.

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
  stage?: string | null
  created_at?: string | null
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
function msOf(s?: string | null): number {
  const t = s ? new Date(s).getTime() : NaN
  return isNaN(t) ? Infinity : t
}
// Calendar year from a date string — matches Year-End's bucketing exactly (date-string
// year, not a timezone-sensitive range) so the two panels agree row-for-row.
function yearFromDate(s?: string | null): number | null {
  if (!s) return null
  const m = String(s).match(/(\d{4})-\d{2}-\d{2}/)
  const y = m ? parseInt(m[1], 10) : new Date(s).getFullYear()
  return y >= 2000 && y <= 2099 ? y : null
}
/** Opportunity string of the revision just BEFORE this one ('26-9B' -> '26-9A', 'A' -> base). */
function priorRevOppOf(opp?: string | null, rev?: string | null): string | null {
  const letter = String(rev || '').trim().toUpperCase()
  if (!/^[A-Z]$/.test(letter)) return null
  const base = baseOpp(opp)
  return letter === 'A' ? base : base + String.fromCharCode(letter.charCodeAt(0) - 1)
}

async function load(): Promise<YtdMetrics> {
  const now = new Date()
  const year = now.getFullYear()
  const yStartMs = new Date(year, 0, 1).getTime()
  const start = new Date(year, 0, 1).toISOString()
  const end = new Date(year + 1, 0, 1).toISOString()

  // All quotes (columns only — no data blob, so this stays light on dashboard load) for
  // the net-of-revisions quoted figure; plus this year's Closed-Won for the won split.
  const [allRows, wonRaw] = await Promise.all([
    restFetchAll<Row>('quotes?select=id,opportunity,revision,total,stage,created_at&order=id'),
    restFetchAll<Row>(`quotes?select=id,opportunity,revision,total,won_date,data&stage=eq.Closed%20Won&won_date=gte.${start.slice(0, 10)}&won_date=lt.${end.slice(0, 10)}&order=id`),
  ])

  const rowsAll = allRows || []

  // Prior-revision lookup + each family's rows, for origin-year and revision deltas.
  const byOpp = new Map<string, Row>()
  const famRows = new Map<string, Row[]>()
  rowsAll.forEach((r) => {
    if (r.opportunity) byOpp.set(r.opportunity, r)
    const b = baseOpp(r.opportunity) || `__id_${r.id}`
    const fr = famRows.get(b)
    if (fr) fr.push(r)
    else famRows.set(b, [r])
  })
  const familyOriginMs = new Map<string, number>()
  famRows.forEach((rows, b) => {
    const blank = rows.find((r) => revRank(r.revision) === -1)
    familyOriginMs.set(b, blank ? msOf(blank.created_at) : Math.min(...rows.map((r) => msOf(r.created_at))))
  })

  // This year's created rows -> net-of-revisions count + value (mirrors Year-End).
  const rowsCreated = rowsAll.filter((r) => yearFromDate(r.created_at) === year)
  const hasBlank = new Set<string>()
  rowsCreated.forEach((r) => { if (revRank(r.revision) === -1) hasBlank.add(baseOpp(r.opportunity)) })
  const groups = new Map<string, Row>()
  rowsCreated.forEach((r) => { const b = baseOpp(r.opportunity) || `__id_${r.id}`; const cur = groups.get(b); if (!cur || revRank(r.revision) > revRank(cur.revision)) groups.set(b, r) })

  let newCount = 0
  let newTotal = 0
  groups.forEach((latest, b) => { if (hasBlank.has(b)) { newCount += 1; newTotal += num(latest.total) } })

  let revDelta = 0
  rowsCreated.forEach((r) => {
    if (revRank(r.revision) < 1) return // lettered revisions only
    if ((r.stage || '') === 'Closed Lost') return // active quoting only
    const originMs = familyOriginMs.get(baseOpp(r.opportunity)) ?? Infinity
    if (originMs >= yStartMs) return // original is also this year -> already counted in newTotal
    const priorOpp = priorRevOppOf(r.opportunity, r.revision)
    const prior = priorOpp ? byOpp.get(priorOpp) : undefined
    if (!prior) return
    revDelta += num(r.total) - num(prior.total)
  })

  const quotedCount = newCount
  const quotedTotal = newTotal + revDelta

  // Won this year (net of revisions), with the new/existing split.
  const wonNet = latestPerBase(wonRaw || [])
  const wonTotal = wonNet.reduce((a, q) => a + num(q.total), 0)
  let wonNewTotal = 0
  let wonExistingTotal = 0
  wonNet.forEach((q) => {
    if (q.data?.qi?.type === 'Existing Business') wonExistingTotal += num(q.total)
    else wonNewTotal += num(q.total)
  })

  return {
    year,
    quotedCount,
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
