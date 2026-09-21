import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Card, CardLabel, StatTile } from '../../components'
import { baseOpp } from '../../lib/opp'
import { fetchCodeEntries, codeReportLabel, type CodeEntry } from './codeReport'

// Deal win time — days from a quote's created date to its Closed-Won date. Shown
// company-wide or for a single product code, across three windows (this month /
// this year / all time), with both the median (typical) and the average, plus the
// deal count so small samples read honestly.
//
// Salesforce-imported quotes are EXCLUDED: their created_at is the import date, not
// when the quote was really created, so their win time is meaningless (often
// negative). That means the numbers reflect NUForce-created quotes only and will
// look sparse until more history accrues — that's expected, and why n is shown.

// Latest revision per family wins, so a quote revised B→D counts once.
function revRankOfOpp(opp: string): number {
  const s = (opp || '').toUpperCase().match(/[A-Z]+$/)?.[0] || ''
  if (!s) return 0
  let n = 0
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 65 || c > 90) return 0; n = n * 26 + (c - 64) }
  return n
}

// Date → UTC-midnight ms (ignores any time-of-day / timezone so day diffs are clean).
// Handles ISO timestamps (created_at), plain YYYY-MM-DD (won_date), and M/D/YYYY
// (the wonInfo.wonDate fallback).
function dayMs(s: string | null): number | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  if (!isNaN(d.getTime())) return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return null
}

interface WonDeal { winDays: number; wonMs: number }

// One qualifying win-time sample per won quote (latest revision per family) in scope.
// Excludes imports, missing/bad dates, and any negative span.
function wonDeals(entries: CodeEntry[], code: string | null): WonDeal[] {
  const byQuote = new Map<string, CodeEntry>()
  for (const e of entries) {
    if (code && e.code !== code) continue
    if (!byQuote.has(e.quoteId)) byQuote.set(e.quoteId, e)
  }
  const byFamily = new Map<string, CodeEntry>()
  for (const e of byQuote.values()) {
    const base = baseOpp(e.opp) || e.opp
    const cur = byFamily.get(base)
    if (!cur || revRankOfOpp(e.opp) > revRankOfOpp(cur.opp)) byFamily.set(base, e)
  }
  const out: WonDeal[] = []
  for (const e of byFamily.values()) {
    if (e.stage !== 'Closed Won') continue
    if (e.source === 'salesforce') continue // import date, not real creation
    const c = dayMs(e.createdAt)
    const w = dayMs(e.wonDate)
    if (c == null || w == null) continue
    const winDays = Math.round((w - c) / 86400000)
    if (winDays < 0) continue
    out.push({ winDays, wonMs: w })
  }
  return out
}

interface Stat { n: number; mean: number; median: number }
function summarize(deals: WonDeal[]): Stat {
  const n = deals.length
  if (!n) return { n: 0, mean: 0, median: 0 }
  const days = deals.map((d) => d.winDays).sort((a, b) => a - b)
  const mean = Math.round(days.reduce((a, d) => a + d, 0) / n)
  const mid = Math.floor(n / 2)
  const median = n % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2)
  return { n, mean, median }
}

function WinTile({ label, stat }: { label: string; stat: Stat }) {
  if (!stat.n) return <StatTile label={label} value="—" sub="no won deals yet" />
  return (
    <StatTile
      label={label}
      value={`${stat.median}d`}
      sub={`avg ${stat.mean}d · ${stat.n} deal${stat.n !== 1 ? 's' : ''}`}
      tone="pos"
    />
  )
}

export function WinTimeCard() {
  const [entries, setEntries] = useState<CodeEntry[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<string>('all') // 'all' or a product code

  useEffect(() => {
    let alive = true
    fetchCodeEntries()
      .then((e) => { if (alive) setEntries(e) })
      .catch((e) => { if (alive) setErr(String(e?.message || e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const codeOptions = useMemo(() => {
    if (!entries) return [] as string[]
    return Array.from(new Set(entries.map((e) => e.code))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  }, [entries])

  const stats = useMemo(() => {
    const deals = wonDeals(entries || [], scope === 'all' ? null : scope)
    const now = new Date()
    const curY = now.getFullYear()
    const curM = now.getMonth()
    const inYear = (ms: number) => new Date(ms).getUTCFullYear() === curY
    const inMonth = (ms: number) => { const d = new Date(ms); return d.getUTCFullYear() === curY && d.getUTCMonth() === curM }
    return {
      month: summarize(deals.filter((d) => inMonth(d.wonMs))),
      year: summarize(deals.filter((d) => inYear(d.wonMs))),
      all: summarize(deals),
    }
  }, [entries, scope])

  const selectStyle: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', cursor: 'pointer', minWidth: 220 }

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
        <div>
          <CardLabel>Deal win time</CardLabel>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>Days from quote created to Closed Won · median headline, average in gray</div>
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={selectStyle} disabled={loading || !!err}>
          <option value="all">All products (company-wide)</option>
          {codeOptions.map((c) => <option key={c} value={c}>{c} — {codeReportLabel(c) || 'code'}</option>)}
        </select>
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {loading && !err && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading win-time data…</div>}

      {!loading && !err && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-4)' }}>
            <WinTile label="This month" stat={stats.month} />
            <WinTile label="This year" stat={stats.year} />
            <WinTile label="All time" stat={stats.all} />
          </div>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-3)' }}>
            Windows are by won date. NUForce-created quotes only — Salesforce-imported quotes are excluded because their created date is the import date, not the real one.
          </div>
        </>
      )}
    </Card>
  )
}
