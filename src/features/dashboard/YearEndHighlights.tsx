import { useState, type CSSProperties } from 'react'
import { Card, StatTile } from '../../components'
import { money, moneyShort } from '../../lib/format'
import { useYearEndHighlights, type YearStats, type YearEndData, type CodeAgg } from './useYearEndHighlights'

// Manager-only "Year-end highlights" — a per-calendar-year recap with a trailing
// 3-year-average comparison, a metric trend, and product-code rollups. Collapsed by
// default; expanding it triggers the (heavy, all-history) load once.

type Metric = { key: string; label: string; pick: (s: YearStats) => number; money: boolean }
const METRICS: Metric[] = [
  { key: 'quotedValue', label: 'Quoted $ (net)', pick: (s) => s.quotedValue, money: true },
  { key: 'wonValue', label: 'Won $', pick: (s) => s.wonValue, money: true },
  { key: 'newWonValue', label: 'New-business won $', pick: (s) => s.newWonValue, money: true },
  { key: 'quoteCount', label: '# Quotes', pick: (s) => s.quoteCount, money: false },
]

/** Average of a metric over the 3 calendar years BEFORE `year` that have data. */
function trailing3(byYear: Record<number, YearStats>, year: number, pick: (s: YearStats) => number): { avg: number; n: number } {
  const vals: number[] = []
  for (let y = year - 1; y >= year - 3; y--) if (byYear[y]) vals.push(pick(byYear[y]))
  return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, n: vals.length }
}

const pill = (active: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-strong)'), background: active ? 'var(--accent-soft)' : '#fff', color: active ? 'var(--accent)' : 'var(--muted)' })
const seg = (active: boolean, first: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 12px', border: 'none', borderLeft: first ? 'none' : '1px solid var(--border-strong)', background: active ? 'var(--accent)' : '#fff', color: active ? '#fff' : 'var(--muted)', cursor: 'pointer' })
const sectionLabel: CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', margin: 'var(--sp-5) 0 var(--sp-3)' }
// A text value (name / code) for a StatTile — smaller than the big numeric value so long
// names wrap instead of overflowing.
const nameVal = (s: string) => <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, lineHeight: 1.15, display: 'block', wordBreak: 'break-word' }}>{s}</span>
const signedMoney = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n))

// ── Metric trend: per-year bars + a trailing-3-year-average line (SVG) ───────────
function MetricTrend({ data, metric }: { data: YearEndData; metric: Metric }) {
  const years = data.years
  const W = 660, H = 230, L = 48, R = 16, T = 16, B = 30
  const iw = W - L - R, ih = H - T - B
  const vals = years.map((y) => metric.pick(data.byYear[y]))
  const avgs = years.map((y) => trailing3(data.byYear, y, metric.pick))
  const max = Math.max(1, ...vals, ...avgs.map((a) => a.avg))
  const n = years.length
  const slot = iw / Math.max(1, n)
  const barW = Math.min(46, slot * 0.55)
  const xc = (i: number) => L + slot * i + slot / 2
  const y = (v: number) => T + ih * (1 - v / max)
  const fmt = (v: number) => (metric.money ? moneyShort(v) : String(Math.round(v)))
  const linePts = years.map((_, i) => (avgs[i].n > 0 ? `${xc(i)},${y(avgs[i].avg)}` : null)).filter(Boolean).join(' ')
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 460, maxWidth: 720, display: 'block' }} role="img" aria-label={`${metric.label} by year`}>
        {[0, 0.5, 1].map((g) => {
          const gy = T + ih * (1 - g)
          return (
            <g key={g}>
              <line x1={L} y1={gy} x2={W - R} y2={gy} stroke="var(--border)" strokeWidth={1} />
              <text x={L - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--dim)">{fmt(max * g)}</text>
            </g>
          )
        })}
        {years.map((yr, i) => {
          const v = vals[i]
          const h = Math.max(0, ih - (y(v) - T))
          return (
            <g key={yr}>
              <rect x={xc(i) - barW / 2} y={y(v)} width={barW} height={h} rx={3} fill="var(--accent)">
                <title>{yr}: {metric.money ? money(v) : Math.round(v)}</title>
              </rect>
              <text x={xc(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>{yr}</text>
            </g>
          )
        })}
        {linePts && <polyline points={linePts} fill="none" stroke="var(--warn)" strokeWidth={2} strokeDasharray="5 4" />}
        {years.map((yr, i) => (avgs[i].n > 0 ? <circle key={yr} cx={xc(i)} cy={y(avgs[i].avg)} r={3} fill="var(--warn)"><title>{yr} 3-yr avg: {metric.money ? money(avgs[i].avg) : Math.round(avgs[i].avg)}</title></circle> : null))}
      </svg>
      <div style={{ display: 'flex', gap: 'var(--sp-4)', fontSize: 'var(--fs-caption)', color: 'var(--muted)', marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />{metric.label} by year</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed var(--warn)', marginRight: 5, verticalAlign: 'middle' }} />3-yr running average</span>
      </div>
    </div>
  )
}

// ── Product-code ranking: top codes as horizontal bars, by value or by count ─────
function CodeRanks({ title, codes, emptyNote }: { title: string; codes: CodeAgg[]; emptyNote: string }) {
  const [mode, setMode] = useState<'value' | 'count'>('value')
  const ranked = [...codes].sort((a, b) => (mode === 'value' ? b.value - a.value : b.count - a.count)).slice(0, 6)
  const valOf = (c: CodeAgg) => (mode === 'value' ? c.value : c.count)
  const max = Math.max(1, ...ranked.map(valOf))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)' }}>{title}</div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
          <button style={seg(mode === 'value', true)} onClick={() => setMode('value')}>By value</button>
          <button style={seg(mode === 'count', false)} onClick={() => setMode('count')}>By count</button>
        </div>
      </div>
      {ranked.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>{emptyNote}</div>
      ) : (
        ranked.map((c) => (
          <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 150, flexShrink: 0, fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${c.code} — ${c.label}`}>
              <b style={{ color: 'var(--accent)' }}>{c.code}</b> <span style={{ color: 'var(--muted)' }}>{c.label}</span>
            </div>
            <div style={{ flex: 1, height: 24, background: '#f0f2f5', borderRadius: 6, overflow: 'hidden', minWidth: 80 }}>
              <div style={{ height: '100%', width: `${Math.round((valOf(c) / max) * 100)}%`, minWidth: valOf(c) > 0 ? 52 : 0, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontSize: 'var(--fs-caption)', fontWeight: 700 }}>
                {mode === 'value' ? moneyShort(c.value) : c.count}
              </div>
            </div>
            <div style={{ width: 92, flexShrink: 0, textAlign: 'right', fontSize: 'var(--fs-caption)', color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
              {mode === 'value' ? `${c.count} quote${c.count === 1 ? '' : 's'}` : moneyShort(c.value)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function YearEndHighlights() {
  const [open, setOpen] = useState(false)
  const { data, err, loading } = useYearEndHighlights(open)
  const [selYear, setSelYear] = useState<number | null>(null)
  const [metricKey, setMetricKey] = useState('quotedValue')

  const nowYear = new Date().getFullYear()
  const year = selYear ?? (data ? (data.years.includes(nowYear) ? nowYear : data.years[data.years.length - 1]) : nowYear)
  const cur = data?.byYear[year]
  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0]

  const subMoney = (pick: (s: YearStats) => number) => {
    if (!data || !cur) return null
    const t = trailing3(data.byYear, year, pick)
    if (t.n === 0) return <span style={{ color: 'var(--dim)' }}>no prior years yet</span>
    const c = pick(cur)
    const up = c >= t.avg
    const d = t.avg ? Math.round(((c - t.avg) / t.avg) * 100) : 0
    return (
      <span>
        <span style={{ color: up ? 'var(--pos)' : 'var(--accent)', fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(d)}%</span>
        <span style={{ color: 'var(--dim)' }}> vs 3-yr avg {money(t.avg)}</span>
      </span>
    )
  }
  const subCount = (pick: (s: YearStats) => number) => {
    if (!data || !cur) return null
    const t = trailing3(data.byYear, year, pick)
    if (t.n === 0) return <span style={{ color: 'var(--dim)' }}>no prior years yet</span>
    const c = pick(cur)
    const up = c >= t.avg
    const d = t.avg ? Math.round(((c - t.avg) / t.avg) * 100) : 0
    return (
      <span>
        <span style={{ color: up ? 'var(--pos)' : 'var(--accent)', fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(d)}%</span>
        <span style={{ color: 'var(--dim)' }}> vs 3-yr avg {Math.round(t.avg)}</span>
      </span>
    )
  }

  return (
    <Card pad={false} style={{ marginBottom: 'var(--sp-4)' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 'var(--sp-5)' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>Year-end highlights</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>A per-year recap vs the trailing 3-year average — totals, new business won, and product-code leaders.</div>
        </div>
        <span style={{ width: 10, height: 10, borderRight: '2px solid var(--dim)', borderBottom: '2px solid var(--dim)', transform: open ? 'rotate(45deg)' : 'rotate(-45deg)', transition: 'transform .18s' }} />
      </div>

      {open && (
        <div style={{ padding: '0 var(--sp-5) var(--sp-5)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-5)' }}>
          {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
          {loading && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading all-history data…</div>}

          {!loading && !err && data && cur && (
            <>
              {/* Year picker */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
                {[...data.years].reverse().map((yy) => (
                  <button key={yy} onClick={() => setSelYear(yy)} style={pill(yy === year)}>{yy}{yy === nowYear ? ' · YTD' : ''}</button>
                ))}
              </div>

              {/* Core metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--sp-4)' }}>
                <StatTile label="Quotes started" value={cur.quoteCount.toLocaleString()} sub={subCount((s) => s.quoteCount)} />
                <StatTile label="Quoted value (net)" value={money(cur.quotedValue)} sub={subMoney((s) => s.quotedValue)} />
                <StatTile label="New business won" value={cur.newWonCount.toLocaleString()} sub={subCount((s) => s.newWonCount)} tone="pos" />
                <StatTile label="New-business won value" value={money(cur.newWonValue)} sub={subMoney((s) => s.newWonValue)} tone="pos" />
              </div>

              {/* Superlatives */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
                <StatTile
                  label="Highest closed (new business)"
                  tone="accent"
                  value={cur.highestNewWon ? money(cur.highestNewWon.total) : '—'}
                  sub={cur.highestNewWon ? `${cur.highestNewWon.opp} · ${cur.highestNewWon.customer}` : 'no new-business wins this year'}
                />
                <StatTile
                  label="Best customer"
                  value={cur.bestCustomer ? nameVal(cur.bestCustomer.name) : '—'}
                  sub={cur.bestCustomer ? `${money(cur.bestCustomer.wonValue)} won · ${cur.bestCustomer.wonCount} quote${cur.bestCustomer.wonCount === 1 ? '' : 's'}` : 'no wins this year'}
                />
                <StatTile
                  label="Best product"
                  value={cur.bestProduct ? nameVal(`${cur.bestProduct.code} · ${cur.bestProduct.label}`) : '—'}
                  sub={cur.bestProduct ? `${money(cur.bestProduct.value)} won` : 'no coded wins this year'}
                />
                <StatTile
                  label="Most changed ▲"
                  tone="pos"
                  value={cur.mostChangedUp ? signedMoney(cur.mostChangedUp.delta) : '—'}
                  sub={cur.mostChangedUp ? `${cur.mostChangedUp.opp} · ${cur.mostChangedUp.customer}` : 'no upward revisions'}
                />
                <StatTile
                  label="Most changed ▼"
                  tone="accent"
                  value={cur.mostChangedDown ? signedMoney(cur.mostChangedDown.delta) : '—'}
                  sub={cur.mostChangedDown ? `${cur.mostChangedDown.opp} · ${cur.mostChangedDown.customer}` : 'no downward revisions'}
                />
              </div>

              {/* Trend + running average */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                <div style={sectionLabel}>Trend vs 3-year running average</div>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', flexWrap: 'wrap' }}>
                  {METRICS.map((m, i) => (
                    <button key={m.key} style={seg(metric.key === m.key, i === 0)} onClick={() => setMetricKey(m.key)}>{m.label}</button>
                  ))}
                </div>
              </div>
              <MetricTrend data={data} metric={metric} />

              {/* Product-code leaders */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-5)', marginTop: 'var(--sp-5)' }}>
                <CodeRanks title={`Most quoted — ${year}`} codes={cur.quotedByCode} emptyNote="No coded quotes this year." />
                <CodeRanks title={`Most won (new business) — ${year}`} codes={cur.wonNewByCode} emptyNote="No new-business wins with product codes this year." />
              </div>

              <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-5)' }}>
                Quoted value is net of revisions (new families' value the year they started, plus only the delta of revisions saved that year). Best customer and best product rank by total value won that year; highest closed is new-business only. “Most changed” is the single revision this year with the largest value increase / decrease. The 3-year average is the mean of the up-to-three prior years with data.
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
