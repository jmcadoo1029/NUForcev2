import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Card, CardLabel, StatTile } from '../../components'
import { baseOpp } from '../../lib/opp'
import { fetchCodeEntries, codeReportLabel, type CodeEntry } from './codeReport'

// Deal win time — days from a quote's created date to its Closed-Won date. Shown
// company-wide or for a single product code, across three windows (this month /
// this year / all time), with both the median (typical) and the average, plus the
// deal count so small samples read honestly.
//
// Pre-NUForce (Salesforce-imported) quotes carry an import date for created_at, not
// their real creation date. Rather than drop them, we ESTIMATE their created date from
// the quote number (see estimatedCreatedMs) so they can join the distribution. Those
// win times are approximate and informational only — a footer note keeps that honest.

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

// ── Estimated created date for pre-NUForce (Salesforce) quotes ─────────────────
// Their stored created_at is the import date, so we approximate the ACTUAL creation
// from the quote number. Numbers run YY-NNN sequentially within a year, so if a year
// produced ~T quotes that's ~T/12 per month; quote NNN therefore lands in month
// ceil(NNN ÷ (T/12)), placed on the 15th (mid-month, since it's an average). Purely an
// estimate for the win-time view — never written back to the quote.

// { year (4-digit), seq } from an opp like "26-123" / "26-123A"; null if unparseable.
function parseOpp(opp: string): { year: number; seq: number } | null {
  const m = String(opp || '').match(/^\s*(\d{2})-0*(\d+)/)
  if (!m) return null
  return { year: 2000 + parseInt(m[1], 10), seq: parseInt(m[2], 10) }
}

// Per-year quote volume = the highest sequence number that year across ALL quotes
// (numbers are sequential, so the max ≈ how many were created). The ÷12 base.
function yearTotals(entries: CodeEntry[]): Map<number, number> {
  const seen = new Set<string>()
  const totals = new Map<number, number>()
  for (const e of entries) {
    if (!e.opp || seen.has(e.opp)) continue
    seen.add(e.opp)
    const p = parseOpp(e.opp)
    if (!p) continue
    totals.set(p.year, Math.max(totals.get(p.year) || 0, p.seq))
  }
  return totals
}

// Estimated created date (UTC-midnight ms) for a pre-NUForce quote. null if the opp
// can't be parsed or the year has no volume to divide by.
function estimatedCreatedMs(opp: string, totals: Map<number, number>): number | null {
  const p = parseOpp(opp)
  if (!p) return null
  const total = totals.get(p.year) || 0
  if (total <= 0) return null
  const perMonth = total / 12
  const month = Math.max(1, Math.min(12, Math.ceil(p.seq / perMonth)))
  return Date.UTC(p.year, month - 1, 15)
}

interface WonDeal { winDays: number; wonMs: number; estimated: boolean }

// One qualifying win-time sample per won quote (latest revision per family) in scope.
// Excludes imports, missing/bad dates, and any negative span.
function wonDeals(entries: CodeEntry[], code: string | null, totals: Map<number, number>): WonDeal[] {
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
    // Pre-NUForce quotes: estimate the created date from the quote number; NUForce
    // quotes use their real created_at.
    const estimated = e.source === 'salesforce'
    const c = estimated ? estimatedCreatedMs(e.opp, totals) : dayMs(e.createdAt)
    const w = dayMs(e.wonDate)
    if (c == null || w == null) continue
    const winDays = Math.round((w - c) / 86400000)
    if (winDays < 0) continue // estimate landed after the win — drop rather than distort
    out.push({ winDays, wonMs: w, estimated })
  }
  return out
}

// Median + quartiles — robust to the long right tail that skews cycle times, so
// they never produce the nonsensical negative lows a mean±SD does. Values kept
// unrounded for plotting; rounded only for display.
interface Stat { n: number; min: number; q1: number; median: number; q3: number; max: number }
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
function summarize(deals: WonDeal[]): Stat {
  const n = deals.length
  if (!n) return { n: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0 }
  const s = deals.map((d) => d.winDays).sort((a, b) => a - b)
  return { n, min: s[0], q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[s.length - 1] }
}
const r = (v: number) => Math.round(v)

function WinTile({ label, stat }: { label: string; stat: Stat }) {
  if (!stat.n) return <StatTile label={label} value="—" sub="no won deals yet" />
  return (
    <StatTile
      label={label}
      value={`${r(stat.median)}d`}
      sub={stat.n > 1 ? `middle half ${r(stat.q1)}–${r(stat.q3)}d · ${stat.n} deals` : `1 deal`}
      tone="pos"
    />
  )
}

// Horizontal box plots — one row per window, all on a SHARED day-axis so the three
// are directly comparable. Box = middle 50% (Q1–Q3), line = median, whiskers = full
// range. Single hue (win = good = --pos), recessive axis, native <title> tooltips.
function BoxPlots({ rows }: { rows: { label: string; stat: Stat }[] }) {
  const plotted = rows.filter((row) => row.stat.n > 0)
  const anySpread = rows.some((row) => row.stat.n > 1)
  if (!plotted.length || !anySpread) {
    return <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-3)' }}>Not enough closed deals to chart a distribution yet.</div>
  }
  const maxX = Math.max(...rows.map((row) => row.stat.max), 1)
  const W = 620, rowH = 34, padT = 6, padB = 22, Lw = 78, padR = 46
  const H = padT + rows.length * rowH + padB
  const plotL = Lw, plotR = W - padR, plotW = plotR - plotL
  const x = (v: number) => plotL + (v / maxX) * plotW
  const ticks = [0, maxX / 2, maxX]
  return (
    <div style={{ marginTop: 'var(--sp-4)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Win-time distribution by window">
        {/* vertical gridlines at the ticks */}
        {ticks.map((t, i) => (
          <line key={'g' + i} x1={x(t)} x2={x(t)} y1={padT} y2={padT + rows.length * rowH} stroke="var(--border)" strokeWidth={1} />
        ))}
        {rows.map((row, i) => {
          const cy = padT + i * rowH + rowH / 2
          const st = row.stat
          return (
            <g key={row.label}>
              <text x={Lw - 10} y={cy + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--muted)">{row.label}</text>
              {st.n === 0 ? (
                <text x={plotL} y={cy + 4} fontSize={11} fill="var(--dim)">no deals</text>
              ) : st.n === 1 ? (
                <>
                  <circle cx={x(st.median)} cy={cy} r={4} fill="var(--pos)" />
                  <title>{`${row.label}: 1 deal at ${r(st.median)}d`}</title>
                </>
              ) : (
                <>
                  {/* whisker */}
                  <line x1={x(st.min)} x2={x(st.max)} y1={cy} y2={cy} stroke="var(--dim)" strokeWidth={1.5} />
                  <line x1={x(st.min)} x2={x(st.min)} y1={cy - 5} y2={cy + 5} stroke="var(--dim)" strokeWidth={1.5} />
                  <line x1={x(st.max)} x2={x(st.max)} y1={cy - 5} y2={cy + 5} stroke="var(--dim)" strokeWidth={1.5} />
                  {/* box (IQR) */}
                  <rect x={x(st.q1)} y={cy - 9} width={Math.max(1, x(st.q3) - x(st.q1))} height={18} rx={3} fill="var(--pos)" fillOpacity={0.16} stroke="var(--pos)" strokeWidth={1.5} />
                  {/* median */}
                  <line x1={x(st.median)} x2={x(st.median)} y1={cy - 9} y2={cy + 9} stroke="var(--pos)" strokeWidth={2.5} />
                  <title>{`${row.label} · ${st.n} deals\nmin ${r(st.min)}d · 25% ${r(st.q1)}d · median ${r(st.median)}d · 75% ${r(st.q3)}d · max ${r(st.max)}d`}</title>
                </>
              )}
            </g>
          )
        })}
        {/* x-axis ticks (days) */}
        {ticks.map((t, i) => (
          <text key={'t' + i} x={x(t)} y={H - 7} textAnchor="middle" fontSize={10} fill="var(--dim)">{r(t)}d</text>
        ))}
      </svg>
      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 2 }}>
        Box = middle 50% of deals (25th–75th percentile) · line = median · whiskers = full range. Hover a box for the exact figures.
      </div>
    </div>
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
    const totals = yearTotals(entries || [])
    const deals = wonDeals(entries || [], scope === 'all' ? null : scope, totals)
    const now = new Date()
    const curY = now.getFullYear()
    const curM = now.getMonth()
    const inYear = (ms: number) => new Date(ms).getUTCFullYear() === curY
    const inMonth = (ms: number) => { const d = new Date(ms); return d.getUTCFullYear() === curY && d.getUTCMonth() === curM }
    return {
      month: summarize(deals.filter((d) => inMonth(d.wonMs))),
      year: summarize(deals.filter((d) => inYear(d.wonMs))),
      all: summarize(deals),
      estCount: deals.filter((d) => d.estimated).length, // pre-NUForce deals with an estimated created date
    }
  }, [entries, scope])

  const selectStyle: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', cursor: 'pointer', minWidth: 220 }

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
        <div>
          <CardLabel>Deal win time</CardLabel>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>Days from quote created to Closed Won · median, with the middle half of deals</div>
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

          <BoxPlots rows={[{ label: 'This month', stat: stats.month }, { label: 'This year', stat: stats.year }, { label: 'All time', stat: stats.all }]} />

          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-3)' }}>
            Windows are by won date. Pre-NUForce quotes{stats.estCount ? ` (${stats.estCount} here)` : ''} use an <em>estimated</em> created date from their quote number — placed mid-month by that year’s quote volume — since their stored created date is the import date. Those win times are approximate.
          </div>
        </>
      )}
    </Card>
  )
}
