import { useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../../lib/format'
import type { WonQuote } from './useDashboardMetrics'

// Expandable New-Business / Existing won breakdown, shared by the Manager
// Closed-Won card and the Monthly Snapshot. Each segment shows its total and
// count, and expands to the actual won quotes (click-to-open).
export function WonBreakdown({ wonQuotes, wonNewTotal, wonExistingTotal }: { wonQuotes: WonQuote[]; wonNewTotal: number; wonExistingTotal: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (t: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  return (
    <>
      {(['New Business', 'Existing Business'] as const).map((t) => {
        const list = wonQuotes.filter((q) => q.type === t)
        const total = t === 'New Business' ? wonNewTotal : wonExistingTotal
        const color = t === 'New Business' ? 'var(--pos)' : 'var(--info)'
        const label = t === 'New Business' ? 'New business' : 'Existing'
        const isOpen = expanded.has(t)
        return (
          <div key={t} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--sp-2)' }}>
            <div onClick={() => list.length && toggle(t)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: list.length ? 'pointer' : 'default' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, marginTop: 2, color }}>{money(total)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{list.length}</span>
                {list.length > 0 && <span style={{ width: 8, height: 8, borderRight: '2px solid var(--dim)', borderBottom: '2px solid var(--dim)', transform: isOpen ? 'rotate(45deg)' : 'rotate(-45deg)', transition: 'transform .18s' }} />}
              </div>
            </div>
            {isOpen && list.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
                {list.map((q) => (
                  <Link key={q.id} to={`/quote/${encodeURIComponent(q.opportunity || String(q.id))}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '8px 14px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{q.opportunity}</span>
                    <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer}</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(q.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
