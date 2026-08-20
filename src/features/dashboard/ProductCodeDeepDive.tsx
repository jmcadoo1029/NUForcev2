import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Card, StatTile } from '../../components'
import { money, moneyShort } from '../../lib/format'
import { fetchCodeEntries, codeReportLabel, type CodeEntry } from './codeReport'

// Product-code deep dive — drilldown (metrics, trend, per-quote table) and a
// compare view (won-value bars + per-year win-value-rate trend line). Loads
// lazily on first expand (heavy all-history pull).

const round = (n: number) => Math.round(n)
const pct = (part: number, whole: number) => (whole ? round((part / whole) * 100) : 0)

function metricsFor(entries: CodeEntry[], code: string) {
  const sel = entries.filter((e) => e.code === code)
  const won = sel.filter((e) => e.stage === 'Closed Won')
  const uniqueQuotes = new Set(sel.map((e) => e.quoteId)).size
  const uniqueWon = new Set(won.map((e) => e.quoteId)).size
  const totalValue = sel.reduce((a, e) => a + e.price, 0)
  const wonValue = won.reduce((a, e) => a + e.price, 0)
  return { uniqueQuotes, totalValue, wonValue, winRate: pct(uniqueWon, uniqueQuotes), wonValueRate: pct(wonValue, totalValue) }
}

function codesByTotal(entries: CodeEntry[]): string[] {
  const totals = new Map<string, number>()
  entries.forEach((e) => totals.set(e.code, (totals.get(e.code) || 0) + e.price))
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

// Per-quote rows for a code (aggregate that code's lines per quote).
function quoteRowsFor(entries: CodeEntry[], code: string) {
  const map = new Map<string, { opp: string; customer: string; stage: string; price: number }>()
  entries.filter((e) => e.code === code).forEach((e) => {
    const g = map.get(e.quoteId) || { opp: e.opp, customer: e.customer, stage: e.stage, price: 0 }
    g.price += e.price
    map.set(e.quoteId, g)
  })
  return Array.from(map.entries())
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => (b.opp || '').localeCompare(a.opp || '', undefined, { numeric: true }))
}

// Won-value-rate per year for a code (for the compare trend line).
function perYearRate(entries: CodeEntry[], code: string): { year: string; rate: number }[] {
  const map = new Map<string, { total: number; won: number }>()
  entries.filter((e) => e.code === code && e.year !== 'unknown').forEach((e) => {
    const g = map.get(e.year) || { total: 0, won: 0 }
    g.total += e.price
    if (e.stage === 'Closed Won') g.won += e.price
    map.set(e.year, g)
  })
  return Array.from(map.entries()).map(([year, g]) => ({ year, rate: pct(g.won, g.total) })).sort((a, b) => a.year.localeCompare(b.year))
}

function lifetimeRate(entries: CodeEntry[], code: string): number {
  const all = entries.filter((e) => e.code === code)
  return pct(all.filter((e) => e.stage === 'Closed Won').reduce((a, e) => a + e.price, 0), all.reduce((a, e) => a + e.price, 0))
}

function stageTone(stage: string): string {
  if (stage.includes('Won')) return 'var(--pos)'
  if (stage.includes('Lost') || stage.includes('Cancelled')) return 'var(--accent)'
  return 'var(--info)'
}

// Two-series year trend line (compare).
function TrendLines({ years, a, b, codeA, codeB }: { years: string[]; a: Map<string, number>; b: Map<string, number>; codeA: string; codeB: string }) {
  const W = 620, H = 210, padL = 34, padR = 12, padT = 12, padB = 26
  const innerW = W - padL - padR, innerH = H - padT - padB
  const x = (i: number) => padL + (years.length <= 1 ? innerW / 2 : (i / (years.length - 1)) * innerW)
  const y = (r: number) => padT + (1 - r / 100) * innerH
  const line = (m: Map<string, number>) => years.filter((yr) => m.has(yr)).map((yr) => `${x(years.indexOf(yr))},${y(m.get(yr) || 0)}`).join(' ')
  const dots = (m: Map<string, number>, color: string, code: string) =>
    years.filter((yr) => m.has(yr)).map((yr) => (
      <circle key={code + yr} cx={x(years.indexOf(yr))} cy={y(m.get(yr) || 0)} r={3.5} fill={color}>
        <title>{`${code} — ${yr}: ${m.get(yr)}%`}</title>
      </circle>
    ))
  return (
    <div style={{ marginTop: 'var(--sp-4)' }}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 6 }}>Won-value rate by year</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 6} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--dim)">{g}</text>
          </g>
        ))}
        {years.map((yr, i) => (
          <text key={yr} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--dim)">{yr}</text>
        ))}
        <polyline points={line(a)} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <polyline points={line(b)} fill="none" stroke="var(--info)" strokeWidth={2} />
        {dots(a, 'var(--accent)', codeA)}
        {dots(b, 'var(--info)', codeB)}
      </svg>
      <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 6, fontSize: 'var(--fs-sm)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 3, background: 'var(--accent)', borderRadius: 2 }} /> {codeA}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 3, background: 'var(--info)', borderRadius: 2 }} /> {codeB}</span>
      </div>
    </div>
  )
}

export function ProductCodeDeepDive() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<CodeEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [year, setYear] = useState('all')
  const [mode, setMode] = useState<'drill' | 'compare'>('drill')
  const [code, setCode] = useState('')
  const [codeA, setCodeA] = useState('')
  const [codeB, setCodeB] = useState('')

  const expand = () => {
    setOpen((o) => !o)
    if (!entries && !loading) {
      setLoading(true)
      fetchCodeEntries().then((e) => setEntries(e)).catch((e) => setErr(String(e?.message || e))).finally(() => setLoading(false))
    }
  }

  useEffect(() => {
    if (!entries || code) return
    const codes = codesByTotal(entries)
    if (codes.length) {
      setCode(codes[0])
      setCodeA(codes[0])
      setCodeB(codes[1] || codes[0])
    }
  }, [entries, code])

  const seg = (active: boolean, first: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '6px 14px', border: 'none', borderLeft: first ? 'none' : '1px solid var(--border-strong)', background: active ? 'var(--accent)' : '#fff', color: active ? '#fff' : 'var(--muted)', cursor: 'pointer' })
  const selectStyle: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)' }

  const all = entries || []
  const filtered = year === 'all' ? all : all.filter((e) => e.year === year)
  const years = entries ? ['all', ...Array.from(new Set(all.map((e) => e.year))).filter((y) => y !== 'unknown').sort().reverse()] : ['all']
  // Dropdown order: by code number, low → high (default selection still uses top-by-total).
  const codeOptions = Array.from(new Set(filtered.map((e) => e.code))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const opt = (c: string) => `${c} — ${codeReportLabel(c) || 'code'}`

  return (
    <Card pad={false} style={{ marginBottom: 'var(--sp-4)' }}>
      <div onClick={expand} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 'var(--sp-5)' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>Product codes — deep dive</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>Drill into a code’s totals, win rate, and quotes, or compare two.</div>
        </div>
        <span style={{ width: 10, height: 10, borderRight: '2px solid var(--dim)', borderBottom: '2px solid var(--dim)', transform: open ? 'rotate(45deg)' : 'rotate(-45deg)', transition: 'transform .18s' }} />
      </div>

      {open && (
        <div style={{ padding: '0 var(--sp-5) var(--sp-5)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-5)' }}>
          {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
          {loading && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading all-history code data…</div>}

          {!loading && !err && entries && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {years.map((y) => (
                    <button key={y} onClick={() => setYear(y)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (year === y ? 'var(--accent)' : 'var(--border-strong)'), background: year === y ? 'var(--accent-soft)' : '#fff', color: year === y ? 'var(--accent)' : 'var(--muted)' }}>
                      {y === 'all' ? 'All years' : y}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
                  <button style={seg(mode === 'drill', true)} onClick={() => setMode('drill')}>Drilldown</button>
                  <button style={seg(mode === 'compare', false)} onClick={() => setMode('compare')}>Compare</button>
                </div>
              </div>

              {mode === 'drill' ? (
                <>
                  <select value={code} onChange={(e) => setCode(e.target.value)} style={{ ...selectStyle, marginBottom: 'var(--sp-4)', minWidth: 260 }}>
                    {codeOptions.map((c) => (<option key={c} value={c}>{opt(c)}</option>))}
                  </select>
                  {(() => {
                    const mm = metricsFor(filtered, code)
                    const life = lifetimeRate(entries, code)
                    const delta = mm.wonValueRate - life
                    const quoteRows = quoteRowsFor(filtered, code)
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-4)' }}>
                          <StatTile label="Quotes" value={mm.uniqueQuotes} />
                          <StatTile label="Total quoted" value={money(mm.totalValue)} />
                          <StatTile label="Won value" value={money(mm.wonValue)} tone="pos" />
                          <StatTile label="Win rate" value={`${mm.winRate}%`} sub="by quote count" tone="pos" />
                          <StatTile label="Won-value rate" value={`${mm.wonValueRate}%`} sub="$ won / $ quoted" />
                        </div>
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', margin: 'var(--sp-4) 0' }}>
                          Lifetime won-value rate <b style={{ color: 'var(--text)' }}>{life}%</b>
                          {year !== 'all' && (
                            <>
                              {' · '}{year} <b style={{ color: 'var(--text)' }}>{mm.wonValueRate}%</b>{' '}
                              <span style={{ color: delta >= 0 ? 'var(--pos)' : 'var(--accent)', fontWeight: 600 }}>({delta >= 0 ? '+' : '−'}{Math.abs(delta)} pts)</span>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 'var(--sp-2)' }}>Quotes at this code ({quoteRows.length})</div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          {quoteRows.map((q) => (
                            <Link key={q.id} to={`/quote/${encodeURIComponent(q.opp || String(q.id))}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 0.9fr', gap: 8, alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                              <span style={{ fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{q.opp || '—'}</span>
                              <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer}</span>
                              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: stageTone(q.stage) }}>{q.stage || '—'}</span>
                              <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(q.price)}</span>
                            </Link>
                          ))}
                          {quoteRows.length === 0 && <div style={{ padding: 'var(--sp-4)', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No quotes at this code for the selected year.</div>}
                        </div>
                      </>
                    )
                  })()}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
                    <select value={codeA} onChange={(e) => setCodeA(e.target.value)} style={selectStyle}>
                      {codeOptions.map((c) => (<option key={c} value={c}>{opt(c)}</option>))}
                    </select>
                    <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>vs</span>
                    <select value={codeB} onChange={(e) => setCodeB(e.target.value)} style={selectStyle}>
                      {codeOptions.map((c) => (<option key={c} value={c}>{opt(c)}</option>))}
                    </select>
                  </div>
                  {(() => {
                    const a = metricsFor(filtered, codeA)
                    const b = metricsFor(filtered, codeB)
                    const max = Math.max(1, a.wonValue, b.wonValue)
                    const bar = (label: string, val: number, color: string) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 54, fontWeight: 700 }}>{label}</div>
                        <div style={{ flex: 1, height: 28, background: '#f0f2f5', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${round((val / max) * 100)}%`, minWidth: val > 0 ? 60 : 0, background: color, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10, color: '#fff', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{moneyShort(val)}</div>
                        </div>
                      </div>
                    )
                    const aByYear = new Map(perYearRate(all, codeA).map((p) => [p.year, p.rate]))
                    const bByYear = new Map(perYearRate(all, codeB).map((p) => [p.year, p.rate]))
                    const yrs = Array.from(new Set([...aByYear.keys(), ...bByYear.keys()])).sort()
                    return (
                      <div>
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 12 }}>Won value {year === 'all' ? '(all years)' : `(${year})`}</div>
                        {bar(codeA, a.wonValue, 'var(--accent)')}
                        {bar(codeB, b.wonValue, 'var(--info)')}
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 6 }}>
                          Win rate — <b style={{ color: 'var(--text)' }}>{codeA}</b>: {a.winRate}% · <b style={{ color: 'var(--text)' }}>{codeB}</b>: {b.winRate}%
                        </div>
                        {yrs.length > 0 && <TrendLines years={yrs} a={aByYear} b={bByYear} codeA={codeA} codeB={codeB} />}
                      </div>
                    )
                  })()}
                </>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}
