import { useState } from 'react'
import { Card, CardLabel } from '../../components'
import { moneyShort } from '../../lib/format'
import { codeLabel } from '../../data/constants'
import { useThreeMonthInsights, type CodeAgg, type AccountAgg } from './useThreeMonthInsights'

// The two reworked rolling-3-month widgets: product codes (quoted vs. won) and
// most-active accounts (toggle between quoting and won rankings).

function CodeList({ rows }: { rows: CodeAgg[] }) {
  if (rows.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: '6px 0' }}>None.</div>
  return (
    <>
      {rows.map((r) => (
        <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, minWidth: 32 }}>{r.code}</span>
          <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>{codeLabel(r.code) || '—'}</span>
          <span style={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {moneyShort(r.total)}
            <span style={{ display: 'block', fontSize: 'var(--fs-caption)', color: 'var(--dim)', fontWeight: 500 }}>{r.quotes} quote{r.quotes !== 1 ? 's' : ''}</span>
          </span>
        </div>
      ))}
    </>
  )
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', margin: 'var(--sp-4) 0 var(--sp-2)' }}>
      {children}
    </div>
  )
}

function AccountsTable({ accounts }: { accounts: AccountAgg[] }) {
  const [by, setBy] = useState<'quoted' | 'won'>('quoted')
  const rows = [...accounts].sort((a, b) => (by === 'won' ? b.wonTotal - a.wonTotal : b.quotedTotal - a.quotedTotal)).slice(0, 6)
  const qHot = by === 'quoted'

  const th: React.CSSProperties = { textAlign: 'right', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '8px 6px', borderBottom: '1px solid var(--border)' }
  const seg = (active: boolean): React.CSSProperties => ({
    fontFamily: 'inherit',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    padding: '6px 12px',
    border: 'none',
    background: active ? 'var(--accent)' : '#fff',
    color: active ? '#fff' : 'var(--muted)',
    cursor: 'pointer',
  })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
        <CardLabel>Most active accounts · last 3 months</CardLabel>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
          <button style={seg(qHot)} onClick={() => setBy('quoted')}>By quoting</button>
          <button style={{ ...seg(!qHot), borderLeft: '1px solid var(--border-strong)' }} onClick={() => setBy('won')}>By won</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No accounts.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Account</th>
              <th style={{ ...th, color: qHot ? 'var(--accent)' : 'var(--dim)' }}>Quoted</th>
              <th style={{ ...th, color: !qHot ? 'var(--accent)' : 'var(--dim)' }}>Won</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.name}>
                <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>{a.name}</td>
                <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontWeight: 700, color: qHot ? 'var(--text)' : 'var(--muted)' }}>{moneyShort(a.quotedTotal)}</span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{a.quotedCount} quote{a.quotedCount !== 1 ? 's' : ''}</span>
                </td>
                <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontWeight: 700, color: !qHot ? 'var(--pos)' : 'var(--muted)' }}>{moneyShort(a.wonTotal)}</span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{a.wonCount} won</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

export function ThreeMonthWidgets() {
  const { data, err } = useThreeMonthInsights()

  if (err) {
    return (
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load 3-month insights: {err}</div>
      </Card>
    )
  }
  if (!data) {
    return (
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading 3-month insights…</div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)', alignItems: 'start' }}>
      <Card>
        <CardLabel>Product codes · last 3 months</CardLabel>
        <MiniLabel>Most quoted</MiniLabel>
        <CodeList rows={data.quotedCodes.slice(0, 3)} />
        <MiniLabel>Most closed-won</MiniLabel>
        <CodeList rows={data.wonCodes.slice(0, 3)} />
      </Card>
      <Card>
        <AccountsTable accounts={data.accounts} />
      </Card>
    </div>
  )
}
