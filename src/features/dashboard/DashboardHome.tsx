import { Card, CardLabel, StatTile } from '../../components'
import { money, moneyShort } from '../../lib/format'
import { useDashboardMetrics } from './useDashboardMetrics'
import { ThreeMonthWidgets } from './ThreeMonthWidgets'
import { ApprovalsCard } from './ApprovalsCard'
import { TrendChart } from './TrendChart'
import { ProductCodeDeepDive } from './ProductCodeDeepDive'
import { WonBreakdown } from './WonBreakdown'
import { YtdMetrics } from './YtdMetrics'
import { ActiveQuotesCard } from './ActiveQuotesCard'

// Manager view content (the top bar/frame lives in DashboardShell). The sales
// cockpit: action items, KPI tiles, Closed-Won, quotes created this month, and
// the 3-month widgets — all live, read-only.

// Monthly closed-won target. Placeholder from Classic — confirm the real figure;
// becomes an editable setting once writes are on.
const MONTHLY_WON_TARGET = 175000

export function DashboardHome() {
  const { data: m, err: mErr } = useDashboardMetrics()

  const dash = (v: string) => (m ? v : mErr ? '—' : '…')

  return (
    <>
      {mErr && (
        <div style={{ background: 'var(--accent-soft)', border: '1px solid #f0c9c7', borderRadius: 'var(--radius-sm)', padding: '11px 16px', fontSize: 'var(--fs-sm)', color: 'var(--accent)', marginBottom: 'var(--sp-4)' }}>
          Couldn’t load metrics: {mErr}
        </div>
      )}

      <ApprovalsCard />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <StatTile label="Quoted (net) · this month" value={dash(money(m?.quotedTotal ?? 0))} sub={dash(`${m?.quotedCount ?? 0} opportunities`)} />
        <StatTile label="Avg quote" value={dash(money(m?.avgQuote ?? 0))} sub={dash(`${m?.quotedCount ?? 0} quotes`)} />
        <StatTile label="Capture rate" value={dash(`${m?.capturePct ?? 0}%`)} sub={dash(`${moneyShort(m?.wonTotal ?? 0)} won / ${moneyShort(m?.quotedTotal ?? 0)} net quoted`)} tone="pos" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)', alignItems: 'start' }}>
        <Card>
          <CardLabel>Closed Won — this month</CardLabel>
          <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: 'var(--accent)' }}>{dash(money(m?.wonTotal ?? 0))}</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 6 }}>{dash(`${m?.wonCount ?? 0} quotes · ${m?.capturePct ?? 0}% win rate`)}</div>
          {m && (() => {
            const ratio = MONTHLY_WON_TARGET > 0 ? m.wonTotal / MONTHLY_WON_TARGET : 0
            const targetPct = Math.round(ratio * 100)
            const over = m.wonTotal - MONTHLY_WON_TARGET
            const hit = over >= 0
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 8, background: '#f0f2f5', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, targetPct))}%`, background: hit ? 'var(--pos)' : 'var(--accent)', borderRadius: 6, transition: 'width .3s' }} />
                </div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 6 }}>
                  <b style={{ color: hit ? 'var(--pos)' : 'var(--text)' }}>{targetPct}%</b>
                  {hit ? ` · ${money(over)} over the ${moneyShort(MONTHLY_WON_TARGET)} target` : ` of ${moneyShort(MONTHLY_WON_TARGET)} target · ${money(-over)} to go`}
                </div>
              </div>
            )
          })()}
          {m && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <WonBreakdown wonQuotes={m.wonQuotes} wonNewTotal={m.wonNewTotal} wonExistingTotal={m.wonExistingTotal} />
            </div>
          )}
        </Card>

        <ActiveQuotesCard netTotal={m?.quotedTotal} />
      </div>

      <YtdMetrics />

      <TrendChart />

      <ThreeMonthWidgets />

      <ProductCodeDeepDive />
    </>
  )
}
