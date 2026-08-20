import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel } from '../../components'
import { money } from '../../lib/format'
import { fetchRecentQuotes, type QuoteRow } from '../../lib/quotes'

// Recently worked quotes — quick re-entry into what you've touched lately
// (most-recently-updated). Read-only; each links to its quote.
export function RecentlyWorkedCard() {
  const [rows, setRows] = useState<QuoteRow[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    fetchRecentQuotes(10)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [])

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Recently worked</CardLabel>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && !rows && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && rows && rows.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Nothing recent.</div>}
      {!err && rows && rows.length > 0 && (
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {rows.map((q) => (
            <Link
              key={q.id}
              to={`/quote/${encodeURIComponent(q.opportunity || String(q.id))}`}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', padding: '10px 4px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}
            >
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{q.opportunity}</span>
              <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(Number(q.total) || 0)}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
