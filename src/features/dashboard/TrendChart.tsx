import { useState, type CSSProperties } from 'react'
import { Card, CardLabel } from '../../components'
import { money, moneyShort } from '../../lib/format'
import { useMonthlyTrend } from './useMonthlyTrend'

// Monthly trend — single-series bar chart with a Value/Count toggle (one series
// at a time → single hue, no legend). Per-bar hover updates the readout line;
// recessive baseline; 4px rounded bar tops. Built per the dataviz method.
export function TrendChart() {
  const { data, err } = useMonthlyTrend()
  const [mode, setMode] = useState<'value' | 'count'>('value')
  const [hover, setHover] = useState<number | null>(null)

  const seg = (active: boolean, first: boolean): CSSProperties => ({
    fontFamily: 'inherit',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    padding: '6px 14px',
    border: 'none',
    borderLeft: first ? 'none' : '1px solid var(--border-strong)',
    background: active ? 'var(--accent)' : '#fff',
    color: active ? '#fff' : 'var(--muted)',
    cursor: 'pointer',
  })

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
      <CardLabel>Monthly trend</CardLabel>
      <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
        <button style={seg(mode === 'value', true)} onClick={() => setMode('value')}>Value</button>
        <button style={seg(mode === 'count', false)} onClick={() => setMode('count')}>Count</button>
      </div>
    </div>
  )

  if (err) {
    return (
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        {header}
        <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-3)' }}>Couldn’t load trend: {err}</div>
      </Card>
    )
  }
  if (!data) {
    return (
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        {header}
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-3)' }}>Loading…</div>
      </Card>
    )
  }

  const color = mode === 'value' ? 'var(--accent)' : 'var(--info)'
  const valOf = (i: number) => (mode === 'value' ? data[i].netTotal : data[i].newCount)
  const max = Math.max(1, ...data.map((_, i) => valOf(i)))
  const readIdx = hover ?? data.length - 1
  const rp = data[readIdx]

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      {header}
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 4 }}>
        <b style={{ color: 'var(--text)' }}>{rp.label}</b> — {money(rp.netTotal)} net · {rp.newCount} quote{rp.newCount !== 1 ? 's' : ''}
      </div>
      {mode === 'value' && (
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', marginTop: 2 }}>
          {money(rp.newTotal)} new
          <span style={{ color: rp.revDelta >= 0 ? 'var(--pos)' : 'var(--accent)', fontWeight: 600, marginLeft: 8 }}>
            {rp.revDelta >= 0 ? '+' : '−'}
            {money(Math.abs(rp.revDelta))} revisions
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170, borderBottom: '1px solid var(--border)', marginTop: 'var(--sp-4)' }}>
        {data.map((_p, i) => {
          const v = valOf(i)
          const h = Math.round((v / max) * 100)
          const isHover = readIdx === i
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', cursor: 'default' }}
            >
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: isHover ? 'var(--text)' : 'var(--muted)', marginBottom: 4, whiteSpace: 'nowrap' }}>
                {mode === 'value' ? moneyShort(v) : v}
              </div>
              <div
                style={{
                  width: '100%',
                  maxWidth: 56,
                  height: `${h}%`,
                  minHeight: v > 0 ? 4 : 0,
                  background: color,
                  borderRadius: '4px 4px 0 0',
                  opacity: isHover ? 1 : 0.85,
                  transition: 'opacity .1s',
                }}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {data.map((p, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--fs-caption)', color: readIdx === i ? 'var(--text)' : 'var(--dim)', fontWeight: readIdx === i ? 700 : 400 }}>
            {p.label}
          </div>
        ))}
      </div>
    </Card>
  )
}
