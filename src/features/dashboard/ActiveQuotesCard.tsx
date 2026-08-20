import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel } from '../../components'
import { money } from '../../lib/format'
import { useQuotesThisMonth } from './useQuotesThisMonth'

// "Active quotes this month" — the month's created quotes, filterable by New /
// Revisions / All, with a running total. Used on the Manager dashboard and (for
// non-managers) on My Work. `netTotal` optionally shows the net quoted figure on
// the All view; omit it where that context isn't available.
export function ActiveQuotesCard({ netTotal }: { netTotal?: number }) {
  const { data: created, err } = useQuotesThisMonth()
  const [qFilter, setQFilter] = useState<'all' | 'new' | 'revision'>('all')

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Active quotes this month{created && created.length > 0 ? ` · ${created.length}` : ''}</CardLabel>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && created == null && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && created != null && created.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>None this month.</div>}
      {!err && created != null && created.length > 0 && (() => {
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
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
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
                {qFilter === 'all' && netTotal != null && <span style={{ color: 'var(--muted)', marginLeft: 12 }}>Net {money(netTotal)}</span>}
              </span>
            </div>
          </>
        )
      })()}
    </Card>
  )
}
