import { Card, CardLabel } from '../../components'
import { money } from '../../lib/format'
import { useYtdMetrics } from './useYtdMetrics'
import { useMonthlyTrend } from './useMonthlyTrend'

// Year-to-date sales block (net of revisions) + this-month-vs-3-month-average.
export function YtdMetrics() {
  const { data, err } = useYtdMetrics()
  const { data: trend } = useMonthlyTrend()

  const col = (label: string, value: string, sub: string, color?: string) => (
    <div>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, letterSpacing: '-.02em', color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 3 }}>{sub}</div>
    </div>
  )

  // This month vs. average of the prior 3 months (from the trend series).
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
  const cur = trend && trend.length ? trend[trend.length - 1] : null
  const prior = trend ? trend.slice(-4, -1) : []
  const avgCount = avg(prior.map((p) => p.newCount))
  const avgNet = avg(prior.map((p) => p.netTotal))
  const avgQV = avg(prior.map((p) => (p.newCount ? p.newTotal / p.newCount : 0)))
  const curQV = cur && cur.newCount ? cur.newTotal / cur.newCount : 0

  const delta = (v: number, isMoney: boolean) => {
    const up = v >= 0
    return (
      <span style={{ color: up ? 'var(--pos)' : 'var(--accent)', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
        {up ? '+' : '−'}
        {isMoney ? money(Math.abs(v)) : Math.abs(Math.round(v))} vs 3-mo avg
      </span>
    )
  }
  const cmpCell = (label: string, value: string, deltaEl: React.ReactNode) => (
    <div>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, letterSpacing: '-.02em' }}>{value}</div>
      <div style={{ marginTop: 3 }}>{deltaEl}</div>
    </div>
  )

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Year to date{data ? ` — ${data.year}` : ''}</CardLabel>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-5)', marginTop: 'var(--sp-2)' }}>
          {col('Quotes created', String(data.quotedCount), money(data.quotedTotal) + ' quoted')}
          {col('Closed Won', money(data.wonTotal), `${data.wonPctOfQuoted}% of quoted value`, 'var(--accent)')}
          {col('Won — new business', money(data.wonNewTotal), `${data.wonNewPct}% of won`, 'var(--pos)')}
          {col('Won — existing', money(data.wonExistingTotal), `${data.wonExistingPct}% of won`, 'var(--info)')}
        </div>
      )}

      {cur && prior.length > 0 && (
        <div style={{ marginTop: 'var(--sp-5)', paddingTop: 'var(--sp-5)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 'var(--sp-3)' }}>
            This month vs 3-month average
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-5)' }}>
            {cmpCell('Quotes', String(cur.newCount), delta(cur.newCount - avgCount, false))}
            {cmpCell('Avg quote value', money(curQV), delta(curQV - avgQV, true))}
            {cmpCell('Net value', money(cur.netTotal), delta(cur.netTotal - avgNet, true))}
          </div>
        </div>
      )}
    </Card>
  )
}
