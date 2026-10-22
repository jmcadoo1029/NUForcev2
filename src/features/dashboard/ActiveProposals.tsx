import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components'
import { restFetch } from '../../lib/restFetch'
import { money } from '../../lib/format'
import { baseOpp, revRank } from '../../lib/opp'

// "Active quotes" — everything currently sitting in the Proposal/Price Quote stage:
// the live pipeline you can still engage with. Stage lives in the top-level column on
// most quotes and in data.qi.stage on others, so we query BOTH and merge. Deduped to
// the latest revision per opportunity family. Count + a clickable list, newest activity
// first. Reached from the dashboard More menu.

const STAGE = 'Proposal/Price Quote'

interface ActiveRow { id: string; opportunity: string; customer: string; total: number; updatedAt: string; daysIdle: number }
interface Raw { id: string; opportunity?: string | null; revision?: string | null; customer?: string | null; total?: number | null; updated_at?: string | null; data?: { qi?: { opp?: string; account?: string } } }

async function loadActive(): Promise<ActiveRow[]> {
  const cols = 'id,opportunity,revision,customer,total,updated_at,data'
  const enc = encodeURIComponent(STAGE)
  // Two queries (top-level stage + json stage) merged — some quotes only carry one.
  const [byCol, byJson] = await Promise.all([
    restFetch<Raw[]>('GET', `quotes?select=${cols}&stage=eq.${enc}&order=updated_at.desc&limit=1000`),
    restFetch<Raw[]>('GET', `quotes?select=${cols}&data->qi->>stage=eq.${enc}&order=updated_at.desc&limit=1000`),
  ])
  const byId = new Map<string, Raw>()
  ;[...(byCol || []), ...(byJson || [])].forEach((r) => { if (!byId.has(r.id)) byId.set(r.id, r) })

  // Dedupe to the latest revision per opportunity family.
  const family = new Map<string, Raw>()
  byId.forEach((r) => {
    const opp = r.opportunity || r.data?.qi?.opp || ''
    const key = baseOpp(opp) || `__id_${r.id}`
    const cur = family.get(key)
    if (!cur || revRank(r.revision) > revRank(cur.revision)) family.set(key, r)
  })

  const now = Date.now()
  return Array.from(family.values())
    .map((r): ActiveRow => {
      const updatedAt = r.updated_at || ''
      const ms = updatedAt ? new Date(updatedAt).getTime() : 0
      return {
        id: r.id,
        opportunity: r.opportunity || r.data?.qi?.opp || '',
        customer: r.customer || r.data?.qi?.account || '',
        total: Number(r.total) || 0,
        updatedAt,
        daysIdle: ms ? Math.floor((now - ms) / 86400000) : 0,
      }
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function ActiveProposals({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ActiveRow[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    loadActive().then((d) => alive && setRows(d)).catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [])

  const total = (rows || []).reduce((a, r) => a + r.total, 0)
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--border)' }

  return (
    <Modal title="Active quotes — Proposal / Price Quote" onClose={onClose} width={720}>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && rows === null && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && rows && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
            <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>{rows.length}</span>
            <span style={{ color: 'var(--muted)' }}>active quote{rows.length !== 1 ? 's' : ''} you can engage with</span>
            <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>Total <b style={{ color: 'var(--text)' }}>{money(total)}</b></span>
          </div>
          {rows.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Nothing in the Proposal / Price Quote stage right now.</div>
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' }}>
                <thead><tr>
                  <th style={th}>Opportunity</th>
                  <th style={th}>Account</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Idle</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>
                        <Link to={`/quote/${encodeURIComponent(r.opportunity || r.id)}`} onClick={onClose} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{r.opportunity || r.id}</Link>
                      </td>
                      <td style={{ ...td, color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.total)}</td>
                      <td style={{ ...td, textAlign: 'right', color: r.daysIdle >= 30 ? 'var(--accent)' : 'var(--dim)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.daysIdle}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
