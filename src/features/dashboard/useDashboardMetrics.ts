import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'

// Current-month sales metrics, ported faithfully from the classic dashboard.
// Net-of-revisions rules (the load-bearing part):
//   • # quotes  = newCount  — families whose blank-rev ORIGINAL was created
//                 this month (a family with only a revision this month doesn't
//                 add to the count).
//   • Net quoted = newTotal + monthRevDelta — new families' latest totals, plus
//                 only the *delta* of revisions SAVED this month (vs the prior
//                 revision) on active/non-lost, prior-month families — so a
//                 correction you make this month lands this month.
//   • Avg quote = newTotal / newCount.

export interface WonQuote {
  id: string
  opportunity: string | null
  customer: string | null
  total: number
  type: 'New Business' | 'Existing Business'
}

export interface DashboardMetrics {
  quotedTotal: number // netTotal
  quotedCount: number // newCount
  avgQuote: number
  wonTotal: number
  wonCount: number
  wonNewTotal: number
  wonExistingTotal: number
  capturePct: number
  wonQuotes: WonQuote[]
}

interface Row {
  id: string
  opportunity?: string | null
  revision?: string | null
  customer?: string | null
  total?: number | null
  created_at?: string | null
  won_date?: string | null
  stage?: string | null
  data?: {
    qi?: { type?: string }
    wonInfo?: { wonDate?: string }
    approval?: { decidedAt?: string }
  }
}
interface LookupRow {
  opportunity: string
  total?: number | null
  created_at?: string | null
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

export async function loadMonthMetrics(monthStart: Date): Promise<DashboardMetrics> {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const startDate = startIso.slice(0, 10)
  const endDate = endIso.slice(0, 10)
  const ms = start.getTime()
  const me = end.getTime()

  const [createdRaw, wonRaw, wonNullRaw] = await Promise.all([
    restFetch<Row[]>(
      'GET',
      `quotes?select=id,opportunity,revision,total,created_at&created_at=gte.${encodeURIComponent(startIso)}&created_at=lt.${encodeURIComponent(endIso)}`,
    ),
    restFetch<Row[]>(
      'GET',
      `quotes?select=id,opportunity,revision,customer,total,won_date,data&stage=eq.Closed%20Won&won_date=gte.${startDate}&won_date=lt.${endDate}`,
    ),
    restFetch<Row[]>(
      'GET',
      `quotes?select=id,opportunity,revision,customer,total,won_date,data&stage=eq.Closed%20Won&won_date=is.null&updated_at=gte.${encodeURIComponent(startIso)}&updated_at=lt.${encodeURIComponent(endIso)}`,
    ),
  ])

  // ── Quoted this month: newCount + newTotal (families with a blank-rev original this month) ──
  const monthRows = createdRaw || []
  const baseHasBlank = new Set<string>()
  monthRows.forEach((r) => {
    if (!r.revision || String(r.revision).trim() === '') baseHasBlank.add(baseOpp(r.opportunity))
  })
  const groups = new Map<string, Row>() // base → latest rev row (among this month's rows)
  monthRows.forEach((r) => {
    const b = baseOpp(r.opportunity)
    const cur = groups.get(b)
    if (!cur || revRank(r.revision) > revRank(cur.revision)) groups.set(b, r)
  })
  let newCount = 0
  let newTotal = 0
  groups.forEach((latest, b) => {
    if (baseHasBlank.has(b)) {
      newCount += 1
      newTotal += num(latest.total)
    }
  })

  // ── Revision delta: revisions SAVED this month (net change vs the prior revision), on
  // active (non-lost) quotes, regardless of when the original was created. Counted on save
  // (not on approval) so a correction you make this month lands this month. A revision whose
  // ORIGINAL was also created this month is skipped — its latest total is already in newTotal
  // above, so adding the delta too would double-count. ──
  let monthRevDelta = 0
  try {
    const revs = await restFetch<Row[]>(
      'GET',
      `quotes?select=id,opportunity,revision,total,created_at,stage&revision=not.is.null&revision=neq.`,
    )
    const revsHere = (revs || []).filter((r) => {
      if (String(r.stage || '') === 'Closed Lost') return false // active quoting only
      const t = new Date(r.created_at || '').getTime()
      return !isNaN(t) && t >= ms && t < me
    })
    if (revsHere.length > 0) {
      const priorRevOppOf = (opp?: string | null, rev?: string | null): string | null => {
        const letter = String(rev || '').trim().toUpperCase()
        if (!/^[A-Z]$/.test(letter)) return null
        const base = baseOpp(opp)
        return letter === 'A' ? base : base + String.fromCharCode(letter.charCodeAt(0) - 1)
      }
      const lookup = new Set<string>()
      revsHere.forEach((r) => {
        const p = priorRevOppOf(r.opportunity, r.revision)
        if (p) lookup.add(p)
        lookup.add(baseOpp(r.opportunity))
      })
      const oppList = Array.from(lookup)
        .map((o) => encodeURIComponent(o))
        .join(',')
      const lookupRows = await restFetch<LookupRow[]>(
        'GET',
        `quotes?select=opportunity,total,created_at&opportunity=in.(${oppList})`,
      )
      const byOpp: Record<string, LookupRow> = {}
      ;(lookupRows || []).forEach((p) => {
        byOpp[p.opportunity] = p
      })
      revsHere.forEach((r) => {
        const priorOpp = priorRevOppOf(r.opportunity, r.revision)
        const priorRow = priorOpp ? byOpp[priorOpp] : null
        if (!priorRow) return // orphan — skip
        const originRow = byOpp[baseOpp(r.opportunity)] || priorRow
        const originMs = new Date(originRow.created_at || '').getTime()
        if (isNaN(originMs) || originMs >= ms) return // same-month origin — already counted
        monthRevDelta += num(r.total) - num(priorRow.total)
      })
    }
  } catch {
    /* leave monthRevDelta at 0 on lookup failure */
  }

  const netTotal = newTotal + monthRevDelta

  // ── Closed Won this month (with null-won_date fallback) ──
  const wonNull = (wonNullRaw || []).filter((q) => {
    const d = q.data?.wonInfo?.wonDate
    if (!d) return false
    const t = new Date(d).getTime()
    return !isNaN(t) && t >= ms && t < me
  })
  const wonMerged = [...(wonRaw || [])]
  const seen = new Set(wonMerged.map((q) => q.id))
  wonNull.forEach((q) => {
    if (!seen.has(q.id)) wonMerged.push(q)
  })
  const wonNet = latestPerBase(wonMerged)
  const wonTotal = wonNet.reduce((a, q) => a + num(q.total), 0)
  let wonNewTotal = 0
  let wonExistingTotal = 0
  const wonQuotes: WonQuote[] = wonNet.map((q) => {
    const type: WonQuote['type'] = q.data?.qi?.type === 'Existing Business' ? 'Existing Business' : 'New Business'
    if (type === 'Existing Business') wonExistingTotal += num(q.total)
    else wonNewTotal += num(q.total)
    return { id: q.id, opportunity: q.opportunity ?? null, customer: q.customer ?? null, total: num(q.total), type }
  })

  return {
    quotedTotal: netTotal,
    quotedCount: newCount,
    avgQuote: newCount ? Math.round(newTotal / newCount) : 0,
    wonTotal,
    wonCount: wonNet.length,
    wonNewTotal,
    wonExistingTotal,
    // Capture rate = dollars won this month ÷ net dollars quoted this month.
    capturePct: netTotal > 0 ? Math.round((wonTotal / netTotal) * 100) : 0,
    wonQuotes,
  }
}

export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    loadMonthMetrics(new Date())
      .then((m) => alive && setData(m))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [])

  return { data, err }
}
