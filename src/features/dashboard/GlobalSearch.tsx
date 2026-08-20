import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { globalSearch, type SearchResults } from '../../lib/search'
import { money } from '../../lib/format'

// Comprehensive top-bar search: quote numbers, accounts, contacts, emails.
// Debounced; grouped results (Accounts, then Quotes). Picking a quote opens it
// by opportunity number; picking an account opens the account page. Typing a
// quote number as 23-123 or 23123 returns the same result.
export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [res, setRes] = useState<SearchResults>({ quotes: [], accounts: [] })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (term.trim().length < 2) {
      setRes({ quotes: [], accounts: [] })
      setOpen(false)
      return
    }
    setLoading(true)
    const id = setTimeout(() => {
      globalSearch(term)
        .then((r) => { setRes(r); setOpen(true) })
        .catch(() => setRes({ quotes: [], accounts: [] }))
        .finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(id)
  }, [term])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const close = () => { setTerm(''); setRes({ quotes: [], accounts: [] }); setOpen(false) }
  const goQuote = (opp: string | null, id: string) => { close(); navigate(`/quote/${encodeURIComponent(opp || id)}`) }
  const goAccount = (name: string) => { close(); navigate(`/account/${encodeURIComponent(name)}`) }

  const groupHead: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 12px 4px' }
  const rowStyle: React.CSSProperties = { padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }
  const hasResults = res.accounts.length > 0 || res.quotes.length > 0

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '0 12px' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--dim)' }}>
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          placeholder="Search quotes, people, email…"
          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '9px 2px', width: 230, color: 'var(--text)', background: 'none' }}
        />
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 380, maxWidth: '90vw', background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', maxHeight: 420, overflowY: 'auto', zIndex: 60 }}>
          {loading && !hasResults && <div style={{ padding: '12px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Searching…</div>}
          {!loading && !hasResults && <div style={{ padding: '12px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>No matches.</div>}

          {res.accounts.length > 0 && (
            <>
              <div style={groupHead}>Accounts</div>
              {res.accounts.map((name) => (
                <div
                  key={name}
                  onMouseDown={() => goAccount(name)}
                  style={rowStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>{name}</span>
                </div>
              ))}
            </>
          )}

          {res.quotes.length > 0 && (
            <>
              <div style={groupHead}>Quotes</div>
              {res.quotes.map((r) => (
                <div
                  key={r.id}
                  onMouseDown={() => goQuote(r.opportunity, r.id)}
                  style={rowStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.opportunity || '—'}</span>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', fontWeight: 600 }}>{money(Number(r.total) || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer || '—'}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
                      {r.job_number && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)' }}>Job {r.job_number}</span>}
                      {r.po_number && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)' }}>PO {r.po_number}</span>}
                      {r.stage && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{r.stage}</span>}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
