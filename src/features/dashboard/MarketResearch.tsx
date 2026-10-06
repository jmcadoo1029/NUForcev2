import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardLabel, useToast } from '../../components'
import { money } from '../../lib/format'
import { searchMarket, updateOpportunity, FAMILY_LABELS, type MarketItem } from '../../lib/marketResearch'

// Market Research — Phase 1 (Awards). Pulls recent federal contract awards for
// NUForce's testing lane (NAICS 541380) from USASpending via the market-research
// edge function, tags each by test family, and flags whether the winning company is
// already a NUForce account or a new prospect. Mark Interested / Dismiss; open the
// source record; jump to a matched account. Solicitations arrive in Phase 2.

const seg = (active: boolean, first: boolean): CSSProperties => ({
  fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '7px 14px', border: 'none',
  borderLeft: first ? 'none' : '1px solid var(--border-strong)', background: active ? 'var(--text)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--muted)', cursor: 'pointer',
})
const inputStyle: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)' }

export function MarketResearch() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [scope, setScope] = useState<'dod' | 'all'>('dod')
  const [family, setFamily] = useState('')
  const [keyword, setKeyword] = useState('')
  const [months, setMonths] = useState(12)
  const [items, setItems] = useState<MarketItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [showDismissed, setShowDismissed] = useState(false)

  const run = useCallback(() => {
    setLoading(true); setErr('')
    searchMarket({ agencyScope: scope, family, keyword, monthsBack: months })
      .then((rows) => setItems(rows))
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]) })
      .finally(() => setLoading(false))
  }, [scope, family, keyword, months])

  // Search on first load and whenever scope / family / window change (not on every
  // keystroke — keyword applies on Enter / Search so we don't hammer USASpending).
  useEffect(() => { run() /* eslint-disable-next-line */ }, [scope, family, months])

  const setStatus = async (it: MarketItem, status: string) => {
    try {
      await updateOpportunity(it.id, { status })
      setItems((cur) => (cur || []).map((x) => (x.id === it.id ? { ...x, status } : x)))
    } catch (e) {
      showToast('Couldn’t update: ' + (e instanceof Error ? e.message : String(e)), 'error', 5000)
    }
  }

  const visible = useMemo(() => (items || []).filter((x) => showDismissed || x.status !== 'dismissed'), [items, showDismissed])
  const stats = useMemo(() => {
    const v = items || []
    return {
      total: v.filter((x) => x.status !== 'dismissed').length,
      accounts: v.filter((x) => x.match_kind === 'account' && x.status !== 'dismissed').length,
      prospects: v.filter((x) => x.match_kind === 'prospect' && x.status !== 'dismissed').length,
      interested: v.filter((x) => x.status === 'interested').length,
    }
  }, [items])

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <CardLabel>Market Research · Awards</CardLabel>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>Recent federal contract awards for testing (NAICS 541380)</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
          <button style={seg(scope === 'dod', true)} onClick={() => setScope('dod')}>Navy / DoD</button>
          <button style={seg(scope === 'all', false)} onClick={() => setScope('all')}>All federal</button>
        </div>
        <select value={family} onChange={(e) => setFamily(e.target.value)} style={inputStyle}>
          <option value="">All test families</option>
          {Object.entries(FAMILY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={inputStyle}>
          {[6, 12, 24, 36].map((m) => <option key={m} value={m}>Last {m} months</option>)}
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder="Keyword (optional)…"
          style={{ ...inputStyle, width: 200 }}
        />
        <button onClick={run} disabled={loading} style={{ ...seg(true, true), borderRadius: 8, padding: '8px 16px', cursor: loading ? 'default' : 'pointer' }}>{loading ? 'Searching…' : 'Search'}</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> show dismissed
        </label>
      </div>

      {/* Stats */}
      {items && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
          <Stat label="Awards" value={stats.total} />
          <Stat label="Existing accounts" value={stats.accounts} />
          <Stat label="New prospects" value={stats.prospects} />
          <Stat label="Interested" value={stats.interested} />
        </div>
      )}

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>Couldn’t load: {err}</div>}
      {loading && !items && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Searching USASpending…</div>}
      {items && visible.length === 0 && !loading && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No awards match these filters.</div>}

      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {visible.map((it) => {
            const isAccount = it.match_kind === 'account'
            return (
              <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', opacity: it.status === 'dismissed' ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, flex: 1, minWidth: 200 }}>{it.company_name || '(unknown recipient)'}</span>
                  {it.family && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)', background: 'var(--info-soft)', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>{FAMILY_LABELS[it.family] || it.family}</span>}
                  {isAccount ? (
                    <button onClick={() => navigate(`/account/${encodeURIComponent(it.company_name || '')}`)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)', background: 'var(--pos-soft)', border: '1px solid var(--pos-border)', borderRadius: 20, padding: '2px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Existing account ↗</button>
                  ) : (
                    <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-soft)', border: '1px solid var(--warn-border)', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>New prospect</span>
                  )}
                  <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(it.amount || 0)}</span>
                </div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.55 }}>{it.title || '(no description)'}</div>
                  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 6 }}>
                    {[it.agency, it.sub_agency].filter(Boolean).join(' · ')}{it.naics ? ` · NAICS ${it.naics}` : ''}{it.psc ? ` · PSC ${it.psc}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
                    {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px' }}>Open on USASpending ↗</a>}
                    <button onClick={() => setStatus(it, it.status === 'interested' ? 'new' : 'interested')} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: it.status === 'interested' ? '#fff' : 'var(--pos)', background: it.status === 'interested' ? 'var(--pos)' : 'none', border: '1px solid var(--pos)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>{it.status === 'interested' ? '★ Interested' : 'Interested'}</button>
                    {it.status !== 'dismissed'
                      ? <button onClick={() => setStatus(it, 'dismissed')} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>Dismiss</button>
                      : <button onClick={() => setStatus(it, 'new')} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>Restore</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-5)' }}>
        Source: USASpending.gov (federal contract awards, NAICS 541380). “Existing account” means the winning company matches a NUForce account; “New prospect” is a company not in your accounts. Solicitations (SAM.gov) come in Phase 2.
      </div>
    </Card>
  )
}
