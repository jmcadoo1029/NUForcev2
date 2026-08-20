import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components'
import { restFetch } from '../../lib/restFetch'
import { money, fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'

// Recently approved — quote approvals + closed-won approvals decided within a
// 7 / 14 / 30-day window. Ported from Classic's Recently Approved modal.

interface RecentRow {
  id: string
  opportunity: string | null
  customer: string | null
  total: number | null
  type: 'Closed Won' | 'Quote'
  decidedAt: string
  decidedBy: string
}
interface Raw {
  id: string
  opportunity?: string | null
  customer?: string | null
  total?: number | null
  updated_at?: string | null
  data?: { approval?: { decidedAt?: string; decidedBy?: string }; wonApproval?: { decidedAt?: string; decidedBy?: string } }
}

async function loadRecent(days: number): Promise<RecentRow[]> {
  const cols = 'id,opportunity,customer,total,updated_at,data'
  const wideSince = new Date(Date.now() - days * 1.6 * 24 * 60 * 60 * 1000).toISOString()
  const [approved, wonApproved] = await Promise.all([
    restFetch<Raw[]>('GET', `quotes?select=${cols}&approval_status=eq.approved&updated_at=gte.${encodeURIComponent(wideSince)}&order=updated_at.desc&limit=500`),
    restFetch<Raw[]>('GET', `quotes?select=${cols}&won_approval_status=eq.won_approved&updated_at=gte.${encodeURIComponent(wideSince)}&order=updated_at.desc&limit=500`),
  ])
  const map = new Map<string, RecentRow>()
  const add = (r: Raw, type: RecentRow['type']) => {
    const dec = type === 'Closed Won' ? r.data?.wonApproval : r.data?.approval
    const decidedAt = dec?.decidedAt || r.updated_at || ''
    map.set(r.id + type, {
      id: r.id,
      opportunity: r.opportunity ?? null,
      customer: r.customer ?? null,
      total: r.total ?? null,
      type,
      decidedAt,
      decidedBy: dec?.decidedBy || '',
    })
  }
  ;(wonApproved || []).forEach((r) => add(r, 'Closed Won'))
  ;(approved || []).forEach((r) => add(r, 'Quote'))

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return Array.from(map.values())
    .filter((r) => {
      const t = new Date(r.decidedAt).getTime()
      return !isNaN(t) && t >= cutoff
    })
    .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime())
}

export function RecentlyApproved({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(7)
  const [rows, setRows] = useState<RecentRow[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setRows(null)
    setErr('')
    loadRecent(days)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [days])

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--border)' }

  return (
    <Modal title="Recently approved" onClose={onClose} width={760}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-4)' }}>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (days === d ? 'var(--accent)' : 'var(--border-strong)'), background: days === d ? 'var(--accent-soft)' : '#fff', color: days === d ? 'var(--accent)' : 'var(--muted)' }}
          >
            {d} days
          </button>
        ))}
      </div>

      {err && <div style={{ color: 'var(--accent)' }}>Couldn’t load: {err}</div>}
      {!err && !rows && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {!err && rows && rows.length === 0 && <div style={{ color: 'var(--muted)' }}>Nothing approved in the last {days} days.</div>}
      {!err && rows && rows.length > 0 && (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' }}>
            <thead>
              <tr>
                <th style={th}>Opportunity</th>
                <th style={th}>Customer</th>
                <th style={th}>Type</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Approved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id + r.type}>
                  <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <Link to={`/quote/${encodeURIComponent(r.opportunity || String(r.id))}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{r.opportunity}</Link>
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{r.customer}</td>
                  <td style={td}>
                    <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: r.type === 'Closed Won' ? 'var(--pos-soft)' : 'var(--info-soft)', color: r.type === 'Closed Won' ? 'var(--pos)' : 'var(--info)' }}>{r.type}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(Number(r.total) || 0)}</td>
                  <td style={{ ...td, color: 'var(--muted)', fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap' }}>
                    {fmtDate(r.decidedAt)}
                    {r.decidedBy ? ` · ${prettifyEmail(r.decidedBy)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
