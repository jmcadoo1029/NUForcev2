import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel } from '../../components'
import { restFetch } from '../../lib/restFetch'

// "Due soon" — In-progress board items whose due date is within the next 5 days, plus
// anything already overdue. Shared/team-wide (the board is shared). Renders nothing
// when there's nothing coming due, so it only appears when it needs attention.

interface DueRow { opportunity: string; account: string; description: string; due_date: string; days: number }

const daysUntil = (ymd: string): number | null => {
  const [y, m, d] = (ymd || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const due = new Date(y, m - 1, d)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - now.getTime()) / 86400000)
}
const fmtDue = (ymd: string): string => {
  const [y, m, d] = (ymd || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function load(): Promise<DueRow[]> {
  const rows = await restFetch<Array<{ opportunity: string | null; account: string | null; description: string | null; due_date: string | null }>>(
    'GET', 'open_quotes?select=opportunity,account,description,due_date&due_date=not.is.null&order=due_date.asc&limit=1000',
  )
  return (rows || [])
    .map((r) => ({ opportunity: (r.opportunity || '').trim(), account: (r.account || '').trim(), description: (r.description || '').trim(), due_date: (r.due_date || '').slice(0, 10), days: daysUntil(r.due_date || '') ?? 9999 }))
    .filter((r) => r.due_date && r.days <= 5) // within 5 days or overdue
    .sort((a, b) => a.days - b.days)
}

export function DueSoonCard() {
  const [rows, setRows] = useState<DueRow[] | null>(null)
  useEffect(() => { let alive = true; load().then((d) => alive && setRows(d)).catch(() => alive && setRows([])); return () => { alive = false } }, [])

  if (!rows || rows.length === 0) return null

  const label = (days: number) => (days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`)

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <span style={{ minWidth: 26, height: 26, borderRadius: 7, background: 'var(--warn)', color: '#fff', fontWeight: 800, fontSize: 'var(--fs-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{rows.length}</span>
        <CardLabel>Due soon</CardLabel>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>In-progress items due within 5 days</span>
      </div>
      <div>
        {rows.map((r, i) => {
          const overdue = r.days < 0
          const soon = r.days >= 0 && r.days <= 5
          const color = overdue ? 'var(--accent)' : soon ? 'var(--warn)' : 'var(--muted)'
          const body = (
            <>
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color, minWidth: 92 }}>{label(r.days)}</span>
              <span style={{ fontWeight: 700 }}>{r.opportunity || '(no opportunity)'}</span>
              {r.account && <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>· {r.account}</span>}
              {r.description && <span style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {r.description}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-caption)', color, whiteSpace: 'nowrap' }}>{fmtDue(r.due_date)}</span>
            </>
          )
          const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }
          return r.opportunity
            ? <Link key={i} to={`/quote/${encodeURIComponent(r.opportunity)}`} style={rowStyle}>{body}</Link>
            : <div key={i} style={rowStyle}>{body}</div>
        })}
      </div>
    </Card>
  )
}
