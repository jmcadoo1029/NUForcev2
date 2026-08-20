import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, StatTile } from '../../components'
import { money, moneyShort } from '../../lib/format'
import { useDashboardMetrics } from './useDashboardMetrics'
import { useQuotesThisMonth } from './useQuotesThisMonth'
import { ThreeMonthWidgets } from './ThreeMonthWidgets'
import { ApprovalsCard } from './ApprovalsCard'
import { TrendChart } from './TrendChart'
import { ProductCodeDeepDive } from './ProductCodeDeepDive'
import { WonBreakdown } from './WonBreakdown'
import { YtdMetrics } from './YtdMetrics'

// Manager view content (the top bar/frame lives in DashboardShell). The sales
// cockpit: action items, KPI tiles, Closed-Won, quotes created this month, and
// the 3-month widgets — all live, read-only.

// Monthly closed-won target. Placeholder from Classic — confirm the real figure;
// becomes an editable setting once writes are on.
const MONTHLY_WON_TARGET = 175000

export function DashboardHome() {
  const { data: m, err: mErr } = useDashboardMetrics()
  const { data: created, err: cErr } = useQuotesThisMonth()
  const [qFilter, setQFilter] = useState<'all' | 'new' | 'revision'>('all')

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
        <StatTile label="Capture rate" value={dash(`${m?.capturePct ?? 0}%`)} sub={dash(`${m?.wonCount ?? 0} won / ${m?.quotedCount ?? 0} quoted`)} tone="pos" />
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

        <Card>
          <CardLabel>Active quotes this month{created && created.length > 0 ? ` · ${created.length}` : ''}</CardLabel>
          {cErr && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {cErr}</div>}
          {!cErr && created == null && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
          {!cErr && created != null && created.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>None this month.</div>}
          {!cErr && created != null && created.length > 0 && (() => {
            const counts = { all: created.length, new: created.filter((q) => q.bucket === 'new').length, revision: created.filter((q) => q.bucket === 'revision').length }
            const visible = qFilter === 'all' ? created : created.filter((q) => q.bucket === qFilter)
            const total = visible.reduce((a, q) => a + (Number(q.total) || 0), 0)
            const pill = (key: 'new' | 'revision' | 'all', label: string) => (
              <button key={key} onClick={() => setQFilter(key)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (qFilter === key ? 'var(--accent)' : 'var(--border-strong)'), background: qFilter === key ? 'var(--accent-soft)' : '#fff', color: qFilter === key ? 'var(--accent)' : 'var(--muted)' }}>
                {label} {counts[key]}
              </button>
            )
            return (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)' }}>
                  {pill('new', 'New')}
                  {pill('revision', 'Revisions')}
                  {pill('all', 'All')}
                </div>
                <div style={{ height: 280, overflowY: 'auto' }}>
                  {visible.map((q) => (
                    <Link key={q.id} to={`/quote/${encodeURIComponent(q.opportunity || String(q.id))}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', padding: '10px 4px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{q.opportunity}</span>
                      <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer}</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(Number(q.total) || 0)}</span>
                    </Link>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 'var(--sp-3)', marginTop: 'var(--sp-2)', borderTop: '2px solid var(--border)' }}>
                  <span style={{ fontWeight: 700 }}>{visible.length} quote{visible.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontWeight: 700 }}>Total {money(total)}</span>
                    {qFilter === 'all' && m && <span style={{ color: 'var(--muted)', marginLeft: 12 }}>Net {money(m.quotedTotal)}</span>}
                  </span>
                </div>
              </>
            )
          })()}
        </Card>
      </div>

      <YtdMetrics />

      <TrendChart />

      <ThreeMonthWidgets />

      <ProductCodeDeepDive />
    </>
  )
}
