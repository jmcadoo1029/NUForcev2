import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import { lineItemsFromData, type QuoteData } from '../../data/quoteModel'
import { baseOpp, revRank } from '../../lib/opp'

// Rolling-3-month insights (current month + 2 prior), net of revisions:
//   • product codes — quoted value vs. closed-won value, by code
//   • accounts — quoting activity vs. won activity, per customer
// These are the reworked replacements for Classic's "this month" code/account
// widgets. No exact Classic equivalent to diff against (they were monthly), so
// sanity-check the top entries and magnitudes.

export interface CodeAgg {
  code: string
  total: number
  quotes: number
}
export interface AccountAgg {
  name: string
  quotedTotal: number
  quotedCount: number
  wonTotal: number
  wonCount: number
}
export interface ThreeMonthInsights {
  quotedCodes: CodeAgg[]
  wonCodes: CodeAgg[]
  accounts: AccountAgg[]
}

interface Row {
  id: string
  opportunity?: string | null
  revision?: string | null
  total?: number | null
  customer?: string | null
  data?: QuoteData
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
const acctName = (q: Row): string => String(q.customer || (q.data?.qi?.account as string) || '(Unknown)')

function aggCodes(quotes: Row[]): CodeAgg[] {
  const map = new Map<string, { total: number; quotes: Set<string> }>()
  quotes.forEach((q) => {
    lineItemsFromData(q.data).forEach((l) => {
      if (!l.code) return
      const e = map.get(l.code) || { total: 0, quotes: new Set<string>() }
      e.total += l.price
      e.quotes.add(q.id)
      map.set(l.code, e)
    })
  })
  return Array.from(map.entries())
    .map(([code, e]) => ({ code, total: e.total, quotes: e.quotes.size }))
    .sort((a, b) => b.total - a.total)
}

async function load(): Promise<ThreeMonthInsights> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const startDate = startIso.slice(0, 10)
  const endDate = endIso.slice(0, 10)

  const [createdRaw, wonRaw] = await Promise.all([
    restFetch<Row[]>(
      'GET',
      `quotes?select=id,opportunity,revision,total,customer,data&created_at=gte.${encodeURIComponent(startIso)}&created_at=lt.${encodeURIComponent(endIso)}`,
    ),
    restFetch<Row[]>(
      'GET',
      `quotes?select=id,opportunity,revision,total,customer,data&stage=eq.Closed%20Won&won_date=gte.${startDate}&won_date=lt.${endDate}`,
    ),
  ])

  const quotedNet = latestPerBase(createdRaw || [])
  const wonNet = latestPerBase(wonRaw || [])

  const acct = new Map<string, AccountAgg>()
  const getA = (name: string): AccountAgg => {
    let a = acct.get(name)
    if (!a) {
      a = { name, quotedTotal: 0, quotedCount: 0, wonTotal: 0, wonCount: 0 }
      acct.set(name, a)
    }
    return a
  }
  quotedNet.forEach((q) => {
    const a = getA(acctName(q))
    a.quotedTotal += num(q.total)
    a.quotedCount += 1
  })
  wonNet.forEach((q) => {
    const a = getA(acctName(q))
    a.wonTotal += num(q.total)
    a.wonCount += 1
  })

  return {
    quotedCodes: aggCodes(quotedNet).slice(0, 5),
    wonCodes: aggCodes(wonNet).slice(0, 5),
    accounts: Array.from(acct.values()),
  }
}

export function useThreeMonthInsights() {
  const [data, setData] = useState<ThreeMonthInsights | null>(null)
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
