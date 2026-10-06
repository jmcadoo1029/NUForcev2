import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardLabel, useToast } from '../../components'
import { money, fmtDate } from '../../lib/format'
import { searchMarket, updateOpportunity, FAMILY_LABELS, type MarketItem } from '../../lib/marketResearch'

// Market Research — federal awards (USASpending) + active solicitations (SAM.gov) in
// NUForce's testing lane (NAICS 541380), via the market-research edge function. Awards
// flag existing-account vs new-prospect; solicitations show the agency, set-aside,
// response deadline, and place of performance with a link to bid. Mark Interested /
// Dismiss; everything's cached for the weekly digest (Phase 3).

const seg = (active: boolean, first: boolean): CSSProperties => ({
  fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '7px 14px', border: 'none',
  borderLeft: first ? 'none' : '1px solid var(--border-strong)', background: active ? 'var(--text)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--muted)', cursor: 'pointer',
})
const inputStyle: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)' }

const daysUntil = (iso?: string | null) => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.ceil((t - Date.now()) / 864e5)
}

export function MarketResearch() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'solicitation' | 'award'>('solicitation')
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
    searchMarket({ kind, agencyScope: scope, family, keyword, monthsBack: months })
      .then((rows) => setItems(rows))
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]) })
      .finally(() => setLoading(false))
  }, [kind, scope, family, keyword, months])

  // Search on load and when kind / scope / family / window change (keyword applies on
  // Enter or Search so we don't hammer the APIs).
  useEffect(() => { run() /* eslint-disable-next-line */ }, [kind, scope, family, months])

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
    const v = (items || []).filter((x) => x.status !== 'dismissed')
    return {
      total: v.length,
      accounts: v.filter((x) => x.match_kind === 'account').length,
      prospects: v.filter((x) => x.match_kind === 'prospect').length,
      dueSoon: v.filter((x) => { const d = daysUntil(x.response_deadline); return d !== null && d <= 14 }).length,
      interested: v.filter((x) => x.status === 'interested').length,
    }
  }, [items])

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )

  const actionBtns = (it: MarketItem) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
      {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px' }}>{kind === 'solicitation' ? 'View on SAM.gov ↗' : 'Open on USASpending ↗'}</a>}
      <button onClick={() => setStatus(it, it.status === 'interested' ? 'new' : 'interested')} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: it.status === 'interested' ? '#fff' : 'var(--pos)', background: it.status === 'interested' ? 'var(--pos)' : 'none', border: '1px solid var(--pos)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>{it.status === 'interested' ? '★ Interested' : 'Interested'}</button>
      {it.status !== 'dismissed'
        ? <button onClick={() => setStatus(it, 'dismissed')} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>Dismiss</button>
        : <button onClick={() => setStatus(it, 'new')} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer' }}>Restore</button>}
    </div>
  )

  const familyTag = (it: MarketItem) => it.family
    ? <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)', background: 'var(--info-soft)', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>{FAMILY_LABELS[it.family] || it.family}</span>
    : null

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <CardLabel>Market Research</CardLabel>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
          <button style={seg(kind === 'solicitation', true)} onClick={() => setKind('solicitation')}>Solicitations</button>
          <button style={seg(kind === 'award', false)} onClick={() => setKind('award')}>Awards</button>
        </div>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>
          {kind === 'solicitation' ? 'Open bid opportunities (SAM.gov)' : 'Recent federal contract awards (USASpending)'} · NAICS 541380
        </span>
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
        {kind === 'award' && (
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={inputStyle}>
            {[6, 12, 24, 36].map((m) => <option key={m} value={m}>Last {m} months</option>)}
          </select>
        )}
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
          {kind === 'solicitation' ? (
            <>
              <Stat label="Open solicitations" value={stats.total} />
              <Stat label="Due ≤ 14 days" value={stats.dueSoon} />
              <Stat label="Interested" value={stats.interested} />
            </>
          ) : (
            <>
              <Stat label="Awards" value={stats.total} />
              <Stat label="Existing accounts" value={stats.accounts} />
              <Stat label="New prospects" value={stats.prospects} />
              <Stat label="Interested" value={stats.interested} />
            </>
          )}
        </div>
      )}

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>Couldn’t load: {err}</div>}
      {loading && !items && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Searching {kind === 'solicitation' ? 'SAM.gov' : 'USASpending'}…</div>}
      {items && visible.length === 0 && !loading && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No {kind === 'solicitation' ? 'open solicitations' : 'awards'} match these filters.</div>}

      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {visible.map((it) => {
            const dim = it.status === 'dismissed'
            if (kind === 'solicitation') {
              const d = daysUntil(it.response_deadline)
              const soon = d !== null && d <= 14
              const setAside = (it.raw?.typeOfSetAsideDescription || it.raw?.typeOfSetAside || '') as string
              const place = [it.company_city, it.company_state].filter(Boolean).join(', ')
              return (
                <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', opacity: dim ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, flex: 1, minWidth: 220 }}>{it.title}</span>
                    {familyTag(it)}
                    {it.response_deadline && (
                      <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: soon ? 'var(--accent)' : 'var(--muted)', background: soon ? 'var(--accent-soft)' : 'var(--chip)', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                        Due {fmtDate(it.response_deadline)}{d !== null ? ` · ${d}d` : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>
                      {it.agency}{it.naics ? ` · NAICS ${it.naics}` : ''}{it.psc ? ` · PSC ${it.psc}` : ''}
                    </div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 4 }}>
                      {setAside ? <>Set-aside: <b style={{ color: 'var(--text)' }}>{setAside}</b></> : 'No set-aside'}{place ? ` · Place of performance: ${place}` : ''}
                    </div>
                    {actionBtns(it)}
                  </div>
                </div>
              )
            }
            // Awards
            const isAccount = it.match_kind === 'account'
            return (
              <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', opacity: dim ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, flex: 1, minWidth: 200 }}>{it.company_name || '(unknown recipient)'}</span>
                  {familyTag(it)}
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
                  {actionBtns(it)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-5)' }}>
        Sources: SAM.gov (open solicitations) and USASpending.gov (contract awards), NAICS 541380. On Awards, “Existing account” means the winning company matches a NUForce account; “New prospect” is a company not in your accounts.
      </div>
    </Card>
  )
}
