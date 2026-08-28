import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button, StatTile } from '../../components'
import { money } from '../../lib/format'
import { fetchAccountQuotes, fetchClient, formatClientAddress, yearOfOpp, type AccountRow } from '../../lib/accounts'
import { codeLabel } from '../../data/constants'

// Codes that are deliverables/paperwork or subcontract, not NU testing — excluded
// from the testing-history recap: Report/CoC, Procedure, EMI/DCM/PQ report+proc,
// Subcontract.
const NON_TEST_CODES = new Set(['41', '42', '43', '44', '98'])

// Account history page (/account/:name) — all of one account's quotes grouped by
// year in an aligned table (quotes / total / closed won / won value / win %),
// with lifetime totals. Ported from Classic's AccountDashboard.

const GRID = '64px 1fr 1.1fr 0.9fr 1.1fr 68px'

function stageTone(stage: string | null): string {
  if (stage?.includes('Won')) return 'var(--pos)'
  if (stage?.includes('Lost') || stage?.includes('Cancelled')) return 'var(--accent)'
  return 'var(--info)'
}

export function AccountPage() {
  const { name: rawName } = useParams<{ name: string }>()
  const name = decodeURIComponent(rawName || '')
  // Customer View — a screen-safe mode (?view=customer) that hides internal
  // metrics (lifetime totals, win rate) so you can turn the screen to a customer.
  // Driven by the URL so the header lookup can deep-link straight into it.
  const [sp, setSp] = useSearchParams()
  const customerView = sp.get('view') === 'customer'
  const toggleCustomerView = () =>
    setSp((prev) => { const n = new URLSearchParams(prev); customerView ? n.delete('view') : n.set('view', 'customer'); return n }, { replace: true })
  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [err, setErr] = useState('')
  const [address, setAddress] = useState('')
  const [openYears, setOpenYears] = useState<Set<string>>(new Set())
  const [openContacts, setOpenContacts] = useState<Set<string>>(new Set())
  const initedFor = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    setAddress('')
    fetchAccountQuotes(name)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(String(e?.message || e)))
    fetchClient(name)
      .then((c) => alive && setAddress(formatClientAddress(c)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [name])

  const { years, lifetime } = useMemo(() => {
    const groups = new Map<string, { rows: AccountRow[]; total: number; wonCount: number; wonTotal: number }>()
    ;(rows || []).forEach((r) => {
      const y = yearOfOpp(r.opportunity)
      const g = groups.get(y) || { rows: [], total: 0, wonCount: 0, wonTotal: 0 }
      g.rows.push(r)
      g.total += Number(r.total) || 0
      if (r.stage === 'Closed Won') {
        g.wonCount += 1
        g.wonTotal += Number(r.total) || 0
      }
      groups.set(y, g)
    })
    const years = Array.from(groups.entries())
      .map(([year, g]) => ({ year, ...g, winPct: g.rows.length ? Math.round((g.wonCount / g.rows.length) * 100) : 0 }))
      .sort((a, b) => (a.year === 'Unknown' ? 1 : b.year === 'Unknown' ? -1 : b.year.localeCompare(a.year)))
    const count = (rows || []).length
    const total = (rows || []).reduce((a, r) => a + (Number(r.total) || 0), 0)
    const wonCount = (rows || []).filter((r) => r.stage === 'Closed Won').length
    return { years, lifetime: { count, total, wonCount, winRate: count ? Math.round((wonCount / count) * 100) : 0 } }
  }, [rows])

  // Group the account's quotes by their point of contact (POC on each quote —
  // data.qi.email, falling back to the contact name), then by year within each
  // contact. This is the "quotes per year by contact" view.
  const byContact = useMemo(() => {
    const map = new Map<string, { name: string; email: string; rows: AccountRow[] }>()
    ;(rows || []).forEach((r) => {
      const email = (r.email || '').trim()
      const nm = (r.contact || '').trim()
      const key = email.toLowerCase() || nm.toLowerCase() || '__none'
      const g = map.get(key) || { name: nm, email, rows: [] }
      if (!g.name && nm) g.name = nm
      if (!g.email && email) g.email = email
      g.rows.push(r)
      map.set(key, g)
    })
    return Array.from(map.entries())
      .map(([key, g]) => {
        const ym = new Map<string, AccountRow[]>()
        g.rows.forEach((r) => { const y = yearOfOpp(r.opportunity); const arr = ym.get(y) || []; arr.push(r); ym.set(y, arr) })
        const years = Array.from(ym.entries())
          .map(([year, rr]) => ({ year, rows: rr, total: rr.reduce((a, r) => a + (Number(r.total) || 0), 0), won: rr.filter((r) => r.stage === 'Closed Won').length }))
          .sort((a, b) => (a.year === 'Unknown' ? 1 : b.year === 'Unknown' ? -1 : b.year.localeCompare(a.year)))
        return { key, name: g.name || (key === '__none' ? 'No contact on file' : g.email || 'Unknown'), email: g.email, count: g.rows.length, total: g.rows.reduce((a, r) => a + (Number(r.total) || 0), 0), won: g.rows.filter((r) => r.stage === 'Closed Won').length, years }
      })
      .sort((a, b) => b.count - a.count)
  }, [rows])

  const toggleContact = (k: string) => setOpenContacts((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  // Testing history — the test types (product codes) this account has been quoted,
  // counting each quote once per code. A capabilities recap for the account/customer
  // view. Deliverable/subcontract codes are excluded (see NON_TEST_CODES).
  const testing = useMemo(() => {
    const map = new Map<string, { code: string; label: string; quotes: Set<string>; won: Set<string> }>()
    ;(rows || []).forEach((r) => {
      const items = Array.isArray(r.line_items) ? r.line_items : []
      const seen = new Set<string>()
      items.forEach((li) => {
        const code = String(li?.code ?? '').trim()
        if (!code || NON_TEST_CODES.has(code) || seen.has(code)) return
        seen.add(code)
        const label = codeLabel(code) || String(li?.label ?? '').trim() || `Code ${code}`
        const g = map.get(code) || { code, label, quotes: new Set<string>(), won: new Set<string>() }
        g.quotes.add(r.id)
        if (r.stage === 'Closed Won') g.won.add(r.id)
        map.set(code, g)
      })
    })
    return Array.from(map.values())
      .map((g) => ({ code: g.code, label: g.label, count: g.quotes.size, won: g.won.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [rows])

  // Default the newest year open — once per account load, so collapsing it sticks.
  useEffect(() => {
    if (years.length && initedFor.current !== name) {
      setOpenYears(new Set([years[0].year]))
      initedFor.current = name
    }
  }, [years, name])

  const toggle = (y: string) =>
    setOpenYears((prev) => {
      const next = new Set(prev)
      next.has(y) ? next.delete(y) : next.add(y)
      return next
    })

  const hCol: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5) 60px' }}>
      <Link to="/" style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
        ← Back to dashboard
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', margin: 'var(--sp-3) 0 var(--sp-5)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-.02em' }}>{name}</div>
          {address && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 3 }}>{address}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <button
            onClick={toggleCustomerView}
            title={customerView ? 'Internal metrics are hidden — click to show them' : 'Hide internal metrics (lifetime totals, win rate) so you can turn the screen to a customer'}
            style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '8px 14px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${customerView ? 'var(--pos)' : 'var(--border-strong)'}`, background: customerView ? 'var(--pos)' : '#fff', color: customerView ? '#fff' : 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: customerView ? '#fff' : 'var(--border-strong)' }} />
            Customer View{customerView ? ' · on' : ''}
          </button>
          <Button>+ New Quote</Button>
        </div>
      </div>

      {customerView && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--pos)', background: 'var(--pos-soft)', border: '1px solid var(--pos-border)', borderRadius: 'var(--radius-sm)', padding: '8px 13px', marginBottom: 'var(--sp-4)' }}>
          Customer View is on — lifetime totals and win rate are hidden. Individual quotes and prices stay visible.
        </div>
      )}

      {err && <div style={{ color: 'var(--accent)' }}>Couldn’t load account: {err}</div>}
      {!err && rows == null && <div style={{ color: 'var(--muted)' }}>Loading…</div>}

      {!err && rows != null && (
        <>
          {!customerView && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
              <StatTile label="Quotes (lifetime)" value={lifetime.count} />
              <StatTile label="Total quoted" value={money(lifetime.total)} />
              <StatTile label="Closed Won" value={lifetime.wonCount} tone="pos" />
              <StatTile label="Win rate" value={`${lifetime.winRate}%`} tone="pos" />
            </div>
          )}

          {years.length === 0 && <div style={{ color: 'var(--muted)' }}>No quotes for this account.</div>}
          {years.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '0 14px 8px' }}>
                <div style={hCol}>Year</div>
                <div style={hCol}>Quotes</div>
                <div style={hCol}>Total value</div>
                <div style={hCol}>Closed won</div>
                <div style={hCol}>Won value</div>
                <div style={{ ...hCol, textAlign: 'right' }}>{customerView ? '' : 'Win %'}</div>
              </div>
              {years.map((y) => {
                const isOpen = openYears.has(y.year)
                return (
                  <div key={y.year} style={{ marginBottom: 6 }}>
                    <div
                      onClick={() => toggle(y.year)}
                      style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '12px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isOpen ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid ' + (isOpen ? 'var(--accent)' : 'var(--border)') }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 'var(--fs-md)', color: y.year === 'Unknown' ? 'var(--dim)' : 'var(--text)' }}>{y.year}</div>
                      <div style={{ fontWeight: 600 }}>{y.rows.length}</div>
                      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(y.total)}</div>
                      <div style={{ fontWeight: 600, color: 'var(--pos)' }}>{y.wonCount}</div>
                      <div style={{ fontWeight: 600, color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}>{money(y.wonTotal)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontWeight: 700, color: y.winPct >= 50 ? 'var(--pos)' : 'var(--muted)' }}>
                        {!customerView && `${y.winPct}%`}
                        <span style={{ width: 7, height: 7, borderRight: '2px solid var(--dim)', borderBottom: '2px solid var(--dim)', transform: isOpen ? 'rotate(45deg)' : 'rotate(-45deg)' }} />
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ margin: '4px 0 0 14px', borderLeft: '2px solid var(--accent)', paddingLeft: 12 }}>
                        {y.rows.map((r) => (
                          <Link
                            key={r.id}
                            to={`/quote/${encodeURIComponent(r.opportunity || String(r.id))}`}
                            style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: 8, alignItems: 'center', padding: '8px 8px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{r.opportunity || '—'}</span>
                            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: stageTone(r.stage) }}>{r.stage || '—'}</span>
                            <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(Number(r.total) || 0)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {testing.length > 0 && (
            <div style={{ marginTop: 'var(--sp-6)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 800, letterSpacing: '-.01em', marginBottom: 'var(--sp-1)' }}>
                Testing history <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--muted)' }}>({testing.length} test type{testing.length !== 1 ? 's' : ''})</span>
              </div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', margin: '4px 0 var(--sp-3)' }}>The testing NU Laboratories has quoted for this account.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                {testing.map((t) => (
                  <div key={t.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 20, border: '1px solid var(--border-strong)', background: 'var(--card)', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ fontWeight: 700 }}>{t.label}</span>
                    <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>{t.count} quote{t.count !== 1 ? 's' : ''}{t.won ? ` · ${t.won} won` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byContact.length > 0 && (
            <div style={{ marginTop: 'var(--sp-6)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 800, letterSpacing: '-.01em', marginBottom: 'var(--sp-3)' }}>
                Contacts <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--muted)' }}>({byContact.length})</span>
              </div>
              {byContact.map((c) => {
                const isOpen = openContacts.has(c.key)
                return (
                  <div key={c.key} style={{ marginBottom: 6 }}>
                    <div onClick={() => toggleContact(c.key)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '11px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isOpen ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid ' + (isOpen ? 'var(--accent)' : 'var(--border)') }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        {c.email && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                      </div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.count} quote{c.count !== 1 ? 's' : ''}{c.won ? ` · ${c.won} won` : ''}</div>
                      {!customerView && <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>{money(c.total)}</div>}
                      <span style={{ width: 7, height: 7, borderRight: '2px solid var(--dim)', borderBottom: '2px solid var(--dim)', transform: isOpen ? 'rotate(45deg)' : 'rotate(-45deg)', flexShrink: 0 }} />
                    </div>
                    {isOpen && (
                      <div style={{ margin: '4px 0 0 14px', borderLeft: '2px solid var(--accent)', paddingLeft: 12 }}>
                        {c.years.map((y) => (
                          <div key={y.year} style={{ marginBottom: 'var(--sp-2)' }}>
                            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '6px 8px 2px' }}>{y.year} · {y.rows.length} quote{y.rows.length !== 1 ? 's' : ''}{!customerView ? ` · ${money(y.total)}` : ''}</div>
                            {y.rows.map((r) => (
                              <Link key={r.id} to={`/quote/${encodeURIComponent(r.opportunity || String(r.id))}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: 8, alignItems: 'center', padding: '8px 8px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{r.opportunity || '—'}</span>
                                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: stageTone(r.stage) }}>{r.stage || '—'}</span>
                                <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(Number(r.total) || 0)}</span>
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
