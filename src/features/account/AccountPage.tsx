import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button, StatTile } from '../../components'
import { money, fmtDate } from '../../lib/format'
import { baseOpp } from '../../lib/opp'
import { fetchAccountQuotes, fetchClient, formatClientAddress, yearOfOpp, type AccountRow } from '../../lib/accounts'
import { fetchClientContactInfo } from '../../lib/directory'
import { codeLabel } from '../../data/constants'

// Codes excluded from the testing-history recap — deliverables/paperwork/subcontract
// and teardown, not NU testing capabilities: Report/CoC, Procedure, EMI/DCM/PQ
// report+proc, Tear Down, Subcontract.
const NON_TEST_CODES = new Set(['41', '42', '43', '44', '96', '98'])
const OPEN_HIDDEN = new Set(['Closed Won', 'Closed Lost'])

// Canonical test-type name for a line item. Code 51 covers EMI / Power Quality /
// DC Magnetics, so it's split by the line item's own label; every other code uses
// its single catalog label (so Setup/Testing variants don't fragment).
function testType(code: string, label: string): string {
  if (code === '51') {
    const l = label.toLowerCase()
    if (/power\s*quality|\bpq\b/.test(l)) return 'Power Quality'
    if (/dc\s*mag|magnetic/.test(l)) return 'DC Magnetics'
    if (/emi/.test(l)) return 'EMI'
    return label || 'EMI'
  }
  return codeLabel(code) || label || (code ? `Code ${code}` : '')
}

// Rank a revision from the opportunity's trailing letters (base=0, A=1…) so open
// quotes collapse to the family's latest revision.
function revRankOpp(opp: string | null): number {
  const s = (opp || '').toUpperCase().match(/[A-Z]+$/)?.[0] || ''
  if (!s) return 0
  let n = 0
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 65 || c > 90) return 0; n = n * 26 + (c - 64) }
  return n
}

function stageTone(stage: string | null): string {
  if (stage?.includes('Won')) return 'var(--pos)'
  if (stage?.includes('Lost') || stage?.includes('Cancelled')) return 'var(--accent)'
  return 'var(--info)'
}

const GRID = '64px 1fr 1.1fr 0.9fr 1.1fr 68px'

// One quote line — shows the unit (test item) and, where useful, the contact, so a
// row is legible at a glance. Prices always show (Customer View keeps them).
function QuoteLine({ r, showContact }: { r: AccountRow; showContact: boolean }) {
  const cols = showContact ? '0.9fr 1.5fr 1.2fr 1fr 0.8fr' : '1fr 1.7fr 1fr 0.8fr'
  return (
    <Link to={`/quote/${encodeURIComponent(r.opportunity || String(r.id))}`} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '8px 8px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
      <span style={{ fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{r.opportunity || '—'}</span>
      <span style={{ fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.item || ''}>{r.item || '—'}</span>
      {showContact && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.contact || ''}>{r.contact || '—'}</span>}
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: stageTone(r.stage) }}>{r.stage || '—'}</span>
      <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(Number(r.total) || 0)}</span>
    </Link>
  )
}

// Account history page (/account/:name). Sections collapse so a long customer
// history stays scannable. Customer View (?view=customer) hides internal metrics.
export function AccountPage() {
  const { name: rawName } = useParams<{ name: string }>()
  const name = decodeURIComponent(rawName || '')
  const [sp, setSp] = useSearchParams()
  const customerView = sp.get('view') === 'customer'
  const toggleCustomerView = () =>
    setSp((prev) => { const n = new URLSearchParams(prev); customerView ? n.delete('view') : n.set('view', 'customer'); return n }, { replace: true })

  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [err, setErr] = useState('')
  const [address, setAddress] = useState('')
  const [openYears, setOpenYears] = useState<Set<string>>(new Set())
  const [openContacts, setOpenContacts] = useState<Set<string>>(new Set())
  const [openTests, setOpenTests] = useState<Set<string>>(new Set())
  // Section-level collapse. Default: only Active quotes open, so the page opens
  // compact but still shows the live work. Everything else is a click away.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['active']))
  const [contactInfo, setContactInfo] = useState<Record<string, { phone: string; title: string }>>({})

  useEffect(() => {
    let alive = true
    setRows(null); setAddress(''); setOpenYears(new Set()); setOpenContacts(new Set()); setOpenTests(new Set()); setOpenSections(new Set(['active']))
    fetchAccountQuotes(name).then((r) => alive && setRows(r)).catch((e) => alive && setErr(String(e?.message || e)))
    fetchClient(name).then((c) => alive && setAddress(formatClientAddress(c))).catch(() => {})
    return () => { alive = false }
  }, [name])

  const toggleIn = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (k: string) =>
    set((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleYear = toggleIn(setOpenYears)
  const toggleContact = toggleIn(setOpenContacts)
  const toggleTest = toggleIn(setOpenTests)
  const toggleSection = toggleIn(setOpenSections)

  const { years, lifetime } = useMemo(() => {
    const groups = new Map<string, { rows: AccountRow[]; total: number; wonCount: number; wonTotal: number }>()
    ;(rows || []).forEach((r) => {
      const y = yearOfOpp(r.opportunity)
      const g = groups.get(y) || { rows: [], total: 0, wonCount: 0, wonTotal: 0 }
      g.rows.push(r); g.total += Number(r.total) || 0
      if (r.stage === 'Closed Won') { g.wonCount += 1; g.wonTotal += Number(r.total) || 0 }
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

  const byContact = useMemo(() => {
    const map = new Map<string, { name: string; email: string; rows: AccountRow[] }>()
    ;(rows || []).forEach((r) => {
      const email = (r.email || '').trim()
      const nm = (r.contact || '').trim()
      const key = email.toLowerCase() || nm.toLowerCase() || '__none'
      const g = map.get(key) || { name: nm, email, rows: [] }
      if (!g.name && nm) g.name = nm
      if (!g.email && email) g.email = email
      g.rows.push(r); map.set(key, g)
    })
    return Array.from(map.entries())
      .map(([key, g]) => {
        const ym = new Map<string, AccountRow[]>()
        g.rows.forEach((r) => { const y = yearOfOpp(r.opportunity); const arr = ym.get(y) || []; arr.push(r); ym.set(y, arr) })
        const years = Array.from(ym.entries())
          .map(([year, rr]) => ({ year, rows: rr, total: rr.reduce((a, r) => a + (Number(r.total) || 0), 0) }))
          .sort((a, b) => (a.year === 'Unknown' ? 1 : b.year === 'Unknown' ? -1 : b.year.localeCompare(a.year)))
        return { key, name: g.name || (key === '__none' ? 'No contact on file' : g.email || 'Unknown'), email: g.email, count: g.rows.length, total: g.rows.reduce((a, r) => a + (Number(r.total) || 0), 0), won: g.rows.filter((r) => r.stage === 'Closed Won').length, years }
      })
      .sort((a, b) => b.count - a.count)
  }, [rows])

  // Testing history — test types quoted for this account (EMI/PQ/DC Mag split out),
  // each with the quotes that included it (for drill-down). Teardown/paperwork excluded.
  const testing = useMemo(() => {
    const map = new Map<string, { label: string; ids: Set<string>; quotes: AccountRow[]; won: number }>()
    ;(rows || []).forEach((r) => {
      const items = Array.isArray(r.line_items) ? r.line_items : []
      const seen = new Set<string>()
      items.forEach((li) => {
        const code = String(li?.code ?? '').trim()
        if (!code || NON_TEST_CODES.has(code)) return
        const label = testType(code, String(li?.label ?? '').trim())
        if (!label) return
        const key = label.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        const g = map.get(key) || { label, ids: new Set<string>(), quotes: [], won: 0 }
        g.ids.add(r.id); g.quotes.push(r); if (r.stage === 'Closed Won') g.won++
        map.set(key, g)
      })
    })
    return Array.from(map.entries())
      .map(([key, g]) => ({ key, label: g.label, count: g.ids.size, won: g.won, quotes: g.quotes.slice().sort((a, b) => (b.opportunity || '').localeCompare(a.opportunity || '', undefined, { numeric: true })) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [rows])

  const accountClientId = useMemo(() => (rows || []).map((r) => (r.clientId || '').trim()).find(Boolean) || '', [rows])
  const activity = useMemo(() => {
    const list = rows || []
    const maxDate = (arr: AccountRow[], f: (r: AccountRow) => string | null | undefined) =>
      arr.reduce<string>((m, r) => { const d = (f(r) || '').toString(); return d && d > m ? d : m }, '')
    return { lastQuoted: maxDate(list, (r) => r.created_at), lastAwarded: maxDate(list.filter((r) => r.stage === 'Closed Won'), (r) => r.won_date || r.created_at) }
  }, [rows])
  const openQuotes = useMemo(() => {
    const open = (rows || []).filter((r) => r.stage && !OPEN_HIDDEN.has(r.stage))
    const byFam = new Map<string, AccountRow>()
    for (const r of open) {
      const base = baseOpp(r.opportunity || '') || String(r.id)
      const cur = byFam.get(base)
      if (!cur || revRankOpp(r.opportunity) > revRankOpp(cur.opportunity)) byFam.set(base, r)
    }
    return Array.from(byFam.values()).sort((a, b) => (b.opportunity || '').localeCompare(a.opportunity || '', undefined, { numeric: true }))
  }, [rows])

  useEffect(() => {
    if (!accountClientId) { setContactInfo({}); return }
    let alive = true
    fetchClientContactInfo(accountClientId)
      .then((list) => {
        if (!alive) return
        const map: Record<string, { phone: string; title: string }> = {}
        list.forEach((c) => { const e = c.email.toLowerCase(); if (e) map[e] = { phone: c.phone, title: c.title } })
        setContactInfo(map)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [accountClientId])

  const hCol: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }
  const chev = (open: boolean, sz = 8): React.CSSProperties => ({ width: sz, height: sz, borderRight: '2px solid var(--dim)', borderBottom: '2px solid var(--dim)', transform: open ? 'rotate(45deg)' : 'rotate(-45deg)', flexShrink: 0 })

  // Collapsible section header.
  const SectionHead = ({ id, title, sub }: { id: string; title: string; sub?: string }) => {
    const open = openSections.has(id)
    return (
      <div onClick={() => toggleSection(id)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer', marginTop: 'var(--sp-6)', marginBottom: open ? 'var(--sp-3)' : 0 }}>
        <span style={chev(open)} />
        <span style={{ fontSize: 'var(--fs-md)', fontWeight: 800, letterSpacing: '-.01em' }}>{title}</span>
        {sub && <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--muted)' }}>{sub}</span>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5) 60px' }}>
      <Link to="/" style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>← Back to dashboard</Link>
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
          {(activity.lastQuoted || activity.lastAwarded) && (
            <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap', fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-4)' }}>
              {activity.lastQuoted && <span>Last quoted <b style={{ color: 'var(--text)' }}>{fmtDate(activity.lastQuoted)}</b></span>}
              {activity.lastAwarded && <span>Last awarded <b style={{ color: 'var(--pos)' }}>{fmtDate(activity.lastAwarded)}</b></span>}
              <span>Active quotes <b style={{ color: 'var(--text)' }}>{openQuotes.length}</b></span>
            </div>
          )}

          {/* Active quotes — collapsible, open by default. */}
          {openQuotes.length > 0 && (
            <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 'var(--sp-5)' }}>
              <div onClick={() => toggleSection('active')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', background: 'var(--accent-soft)', padding: '10px 14px', cursor: 'pointer' }}>
                <span style={chev(openSections.has('active'), 7)} />
                <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>Active quotes ({openQuotes.length})</span>
              </div>
              {openSections.has('active') && openQuotes.map((r) => (
                <div key={r.id} style={{ borderTop: '1px solid var(--border)' }}><QuoteLine r={r} showContact /></div>
              ))}
            </div>
          )}

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
                    <div onClick={() => toggleYear(y.year)} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '12px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isOpen ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid ' + (isOpen ? 'var(--accent)' : 'var(--border)') }}>
                      <div style={{ fontWeight: 800, fontSize: 'var(--fs-md)', color: y.year === 'Unknown' ? 'var(--dim)' : 'var(--text)' }}>{y.year}</div>
                      <div style={{ fontWeight: 600 }}>{y.rows.length}</div>
                      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(y.total)}</div>
                      <div style={{ fontWeight: 600, color: 'var(--pos)' }}>{y.wonCount}</div>
                      <div style={{ fontWeight: 600, color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}>{money(y.wonTotal)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontWeight: 700, color: y.winPct >= 50 ? 'var(--pos)' : 'var(--muted)' }}>
                        {!customerView && `${y.winPct}%`}
                        <span style={chev(isOpen, 7)} />
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ margin: '4px 0 0 14px', borderLeft: '2px solid var(--accent)', paddingLeft: 12 }}>
                        {y.rows.map((r) => <QuoteLine key={r.id} r={r} showContact />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Testing history — collapsible; each type drills into its quotes. */}
          {testing.length > 0 && (
            <>
              <SectionHead id="testing" title="Testing history" sub={`${testing.length} test type${testing.length !== 1 ? 's' : ''}`} />
              {openSections.has('testing') && (
                <div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>The testing NU Laboratories has quoted for this account. Click a test to see its quotes.</div>
                  {testing.map((t) => {
                    const isOpen = openTests.has(t.key)
                    return (
                      <div key={t.key} style={{ marginBottom: 6 }}>
                        <div onClick={() => toggleTest(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isOpen ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid ' + (isOpen ? 'var(--accent)' : 'var(--border)') }}>
                          <span style={{ fontWeight: 700, flex: 1 }}>{t.label}</span>
                          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.count} quote{t.count !== 1 ? 's' : ''}{t.won ? ` · ${t.won} won` : ''}</span>
                          <span style={chev(isOpen, 7)} />
                        </div>
                        {isOpen && (
                          <div style={{ margin: '4px 0 0 14px', borderLeft: '2px solid var(--accent)', paddingLeft: 12 }}>
                            {t.quotes.map((r) => <QuoteLine key={r.id} r={r} showContact />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Contacts — collapsible; each contact drills into their quotes by year. */}
          {byContact.length > 0 && (
            <>
              <SectionHead id="contacts" title="Contacts" sub={`${byContact.length}`} />
              {openSections.has('contacts') && byContact.map((c) => {
                const isOpen = openContacts.has(c.key)
                const info = contactInfo[(c.email || '').toLowerCase()] || { phone: '', title: '' }
                return (
                  <div key={c.key} style={{ marginBottom: 6 }}>
                    <div onClick={() => toggleContact(c.key)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '11px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isOpen ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid ' + (isOpen ? 'var(--accent)' : 'var(--border)') }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{c.name}{info.title && <span style={{ fontWeight: 500, color: 'var(--muted)' }}> · {info.title}</span>}</div>
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.email}{c.email && info.phone ? ' · ' : ''}{info.phone}
                        </div>
                      </div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.count} quote{c.count !== 1 ? 's' : ''}{c.won ? ` · ${c.won} won` : ''}</div>
                      {!customerView && <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>{money(c.total)}</div>}
                      <span style={chev(isOpen, 7)} />
                    </div>
                    {isOpen && (
                      <div style={{ margin: '4px 0 0 14px', borderLeft: '2px solid var(--accent)', paddingLeft: 12 }}>
                        {c.years.map((y) => (
                          <div key={y.year} style={{ marginBottom: 'var(--sp-2)' }}>
                            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '6px 8px 2px' }}>{y.year} · {y.rows.length} quote{y.rows.length !== 1 ? 's' : ''}{!customerView ? ` · ${money(y.total)}` : ''}</div>
                            {y.rows.map((r) => <QuoteLine key={r.id} r={r} showContact={false} />)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}
