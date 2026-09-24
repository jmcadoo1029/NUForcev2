import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { globalSearch, fetchQuotesByIds, type SearchResults, type SearchQuote } from '../../lib/search'
import { money } from '../../lib/format'
import { fetchCodeEntries, parseTestQuery, quotesMatchingTests } from './codeReport'

// Comprehensive top-bar search: quote numbers, accounts, contacts, emails — plus
// TEST TYPES. Typing a test name (or several) finds the quotes whose line items
// include them, AND-ed together, e.g. "noise temperature" → quotes with both. Test
// names map to product codes (see parseTestQuery), matched against the all-history
// code data. Debounced; grouped results. Picking a quote opens it by opportunity #.
export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [res, setRes] = useState<SearchResults>({ quotes: [], accounts: [] })
  const [testRes, setTestRes] = useState<{ labels: string[]; quotes: SearchQuote[] }>({ labels: [], quotes: [] })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (term.trim().length < 2) {
      setRes({ quotes: [], accounts: [] })
      setTestRes({ labels: [], quotes: [] })
      setOpen(false)
      return
    }
    setLoading(true)
    const id = setTimeout(() => {
      const tq = parseTestQuery(term)
      const metaP = globalSearch(term).catch(() => ({ quotes: [], accounts: [] } as SearchResults))
      const testP: Promise<{ labels: string[]; quotes: SearchQuote[] }> = tq.codeSets.length
        ? fetchCodeEntries()
            .then((entries) => {
              const hits = quotesMatchingTests(entries, tq)
              return fetchQuotesByIds(hits.map((h) => h.id)).then((rows) => {
                const order = new Map(hits.map((h, i) => [h.id, i]))
                rows.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
                return { labels: tq.labels, quotes: rows }
              })
            })
            .catch(() => ({ labels: tq.labels, quotes: [] as SearchQuote[] }))
        : Promise.resolve({ labels: [] as string[], quotes: [] as SearchQuote[] })
      Promise.all([metaP, testP])
        .then(([meta, test]) => { setRes(meta); setTestRes(test); setOpen(true) })
        .finally(() => setLoading(false))
    }, 260)
    return () => clearTimeout(id)
  }, [term])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const close = () => { setTerm(''); setRes({ quotes: [], accounts: [] }); setTestRes({ labels: [], quotes: [] }); setOpen(false) }
  const goQuote = (opp: string | null, id: string) => { close(); navigate(`/quote/${encodeURIComponent(opp || id)}`) }
  const goAccount = (name: string) => { close(); navigate(`/account/${encodeURIComponent(name)}`) }

  const groupHead: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 12px 4px' }
  const rowStyle: React.CSSProperties = { padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }

  const testIds = new Set(testRes.quotes.map((q) => q.id))
  const metaQuotes = res.quotes.filter((r) => !testIds.has(r.id)) // don't repeat a quote already shown under Tests
  const hasResults = testRes.quotes.length > 0 || res.accounts.length > 0 || metaQuotes.length > 0

  const quoteRow = (r: SearchQuote) => (
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
  )

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
          placeholder="Search quotes, people, tests…"
          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '9px 2px', width: 230, color: 'var(--text)', background: 'none' }}
        />
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 380, maxWidth: '90vw', background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', maxHeight: 420, overflowY: 'auto', zIndex: 60 }}>
          {loading && !hasResults && <div style={{ padding: '12px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Searching…</div>}
          {!loading && !hasResults && <div style={{ padding: '12px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>No matches.</div>}

          {testRes.quotes.length > 0 && (
            <>
              <div style={groupHead}>Quotes with {testRes.labels.join(' + ')} ({testRes.quotes.length})</div>
              {testRes.quotes.map(quoteRow)}
            </>
          )}

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

          {metaQuotes.length > 0 && (
            <>
              <div style={groupHead}>Quotes</div>
              {metaQuotes.map(quoteRow)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
