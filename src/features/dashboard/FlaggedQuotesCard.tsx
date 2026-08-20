import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, useToast } from '../../components'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { unflagQuote } from '../../lib/quoteActions'
import { useFlaggedQuotes } from './useFlaggedQuotes'

// Flagged quotes — unresolved flags needing attention. Each links to the quote;
// Resolve clears the flag (quote_flags.resolved) and drops it from the board.
// Writes gate on WRITES_ENABLED.

export function FlaggedQuotesCard() {
  const { data, err, reload } = useFlaggedQuotes()
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  const rows = (data || []).filter((f) => !resolved.has(f.id))

  const resolve = async (id: string, opp: string | null) => {
    if (busyId) return
    setBusyId(id)
    try {
      if (WRITES_ENABLED) await unflagQuote(id, me)
      setResolved((s) => new Set(s).add(id))
      showToast(WRITES_ENABLED ? `Resolved flag on ${opp || 'quote'}` : 'Resolved (preview — writes off)', WRITES_ENABLED ? 'success' : 'warn')
      if (WRITES_ENABLED) reload()
    } catch (e) {
      showToast('Resolve failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
        <CardLabel>Flagged quotes</CardLabel>
        {rows.length > 0 && (
          <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 20, padding: '2px 9px' }}>{rows.length}</span>
        )}
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load flags: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && data && rows.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No flagged quotes.</div>}

      {!err && rows.length > 0 && (
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {rows.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
              <Link to={f.quote_id ? `/quote/${f.quote_id}` : '#'} style={{ display: 'block', flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--text)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{f.opportunity || '—'}</span>
                  <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.customer}</span>
                  <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                    {prettifyEmail(f.flagged_by)}
                    {f.flagged_at ? ` · ${fmtDate(f.flagged_at)}` : ''}
                  </span>
                </div>
                {f.note && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginTop: 3 }}>{f.note}</div>}
              </Link>
              <button
                onClick={() => resolve(f.id, f.opportunity)}
                disabled={busyId === f.id}
                title="Resolve this flag"
                style={{ flexShrink: 0, fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '4px 12px', cursor: busyId === f.id ? 'default' : 'pointer' }}
              >
                {busyId === f.id ? '…' : 'Resolve'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
