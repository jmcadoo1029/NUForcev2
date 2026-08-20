import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'

// Per-month trend over the last N months, net of revisions. Uses the SAME rules
// as the current-month KPI (newCount + newTotal + revision deltas), so the
// latest bar equals the "Quoted (net)" tile.

const N_MONTHS = 6

export interface MonthPoint {
  label: string
  newCount: number
  netTotal: number
  newTotal: number
  revDelta: number
}

interface CreatedRow {
  id: string
  opportunity?: string | null
  revision?: string | null
  total?: number | null
  created_at?: string | null
}
interface RevRow {
  id: string
  opportunity?: string | null
  revision?: string | null
  total?: number | null
  data?: { approval?: { decidedAt?: string } }
}
interface LookupRow {
  opportunity: string
  total?: number | null
  created_at?: string | null
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

interface Bucket {
  label: string
  startMs: number
  endMs: number
  rows: CreatedRow[]
  newCount: number
  newTotal: number
  revDelta: number
}

async function load(): Promise<MonthPoint[]> {
  const now = new Date()
  const months: Bucket[] = []
  for (let i = N_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    months.push({ label: d.toLocaleString('en-US', { month: 'short' }), startMs: d.getTime(), endMs: end.getTime(), rows: [], newCount: 0, newTotal: 0, revDelta: 0 })
  }
  const rangeStartIso = new Date(months[0].startMs).toISOString()

  // 1) All quotes created in the window → bucket by month.
  const created =
    (await restFetch<CreatedRow[]>(
      'GET',
      `quotes?select=id,opportunity,revision,total,created_at&created_at=gte.${encodeURIComponent(rangeStartIso)}`,
    )) || []
  created.forEach((r) => {
    const t = new Date(r.created_at || '').getTime()
    const b = months.find((mm) => t >= mm.startMs && t < mm.endMs)
    if (b) b.rows.push(r)
  })

  // newCount / newTotal per month (families with a blank-rev original that month).
  months.forEach((b) => {
    const hasBlank = new Set<string>()
    b.rows.forEach((r) => {
      if (!r.revision || String(r.revision).trim() === '') hasBlank.add(baseOpp(r.opportunity))
    })
    const groups = new Map<string, CreatedRow>()
    b.rows.forEach((r) => {
      const k = baseOpp(r.opportunity)
      const cur = groups.get(k)
      if (!cur || revRank(r.revision) > revRank(cur.revision)) groups.set(k, r)
    })
    groups.forEach((latest, k) => {
      if (hasBlank.has(k)) {
        b.newCount += 1
        b.newTotal += num(latest.total)
      }
    })
  })

  // 2) Revision deltas: approved revs, assigned to their decided month.
  try {
    const approvedRevs =
      (await restFetch<RevRow[]>(
        'GET',
        `quotes?select=id,opportunity,revision,total,data&approval_status=eq.approved&revision=not.is.null&revision=neq.`,
      )) || []
    const rangeStart = months[0].startMs
    const rangeEnd = months[months.length - 1].endMs
    const revsHere = approvedRevs.filter((r) => {
      const d = r.data?.approval?.decidedAt
      if (!d) return false
      const t = new Date(d).getTime()
      return !isNaN(t) && t >= rangeStart && t < rangeEnd
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
      const lookupRows =
        (await restFetch<LookupRow[]>('GET', `quotes?select=opportunity,total,created_at&opportunity=in.(${oppList})`)) || []
      const byOpp: Record<string, LookupRow> = {}
      lookupRows.forEach((p) => {
        byOpp[p.opportunity] = p
      })
      revsHere.forEach((r) => {
        const t = new Date(r.data!.approval!.decidedAt as string).getTime()
        const b = months.find((mm) => t >= mm.startMs && t < mm.endMs)
        if (!b) return
        const priorOpp = priorRevOppOf(r.opportunity, r.revision)
        const priorRow = priorOpp ? byOpp[priorOpp] : null
        if (!priorRow) return
        const originRow = byOpp[baseOpp(r.opportunity)] || priorRow
        const originMs = new Date(originRow.created_at || '').getTime()
        if (isNaN(originMs) || originMs >= b.startMs) return
        b.revDelta += num(r.total) - num(priorRow.total)
      })
    }
  } catch {
    /* deltas stay 0 on failure */
  }

  return months.map((b) => ({ label: b.label, newCount: b.newCount, netTotal: b.newTotal + b.revDelta, newTotal: b.newTotal, revDelta: b.revDelta }))
}

export function useMonthlyTrend() {
  const [data, setData] = useState<MonthPoint[] | null>(null)
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
