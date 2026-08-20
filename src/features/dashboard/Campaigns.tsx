import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { money } from '../../lib/format'
import {
  fetchCampaigns, fetchCampaignContacts, createCampaign, deleteCampaign,
  searchContacts, addContactToCampaign, removeContactFromCampaign, fetchAccountQuotes,
  type Campaign, type CampaignContact, type AccountQuote,
} from './useCampaigns'

// Campaigns manager: pick a campaign and see its contacts; create/delete
// campaigns and add/remove contacts (ported from Classic). Writes gate on
// WRITES_ENABLED.
export function Campaigns({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const [list, setList] = useState<Campaign[] | null>(null)
  const [err, setErr] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<CampaignContact[] | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CampaignContact[] | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [rightView, setRightView] = useState<'contacts' | 'opps'>('contacts')
  const [quotes, setQuotes] = useState<AccountQuote[] | null>(null)

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const loadCampaigns = useCallback(async (selectId?: string | null) => {
    try {
      const c = await fetchCampaigns()
      setList(c)
      setSelId((cur) => (selectId !== undefined ? selectId : cur ?? (c.length ? c[0].id : null)))
    } catch (e) {
      setErr(errMsg(e))
    }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  const loadContacts = useCallback(async (id: string) => {
    setContacts(null)
    try { setContacts(await fetchCampaignContacts(id)) } catch { setContacts([]) }
  }, [])

  useEffect(() => { setRightView('contacts'); if (selId) loadContacts(selId); else setContacts(null) }, [selId, loadContacts])

  // Opportunities for the accounts represented by the campaign's contacts.
  useEffect(() => {
    const names = Array.from(new Set((contacts || []).map((c) => c.client_name || '').filter(Boolean)))
    if (!names.length) { setQuotes([]); return }
    let alive = true
    setQuotes(null)
    fetchAccountQuotes(names).then((q) => { if (alive) setQuotes(q) })
    return () => { alive = false }
  }, [contacts])

  // Debounced contact search.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!term.trim() || !selId) { setResults(null); return }
    searchTimer.current = setTimeout(async () => { setResults(await searchContacts(term)) }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [term, selId])

  const name = (c: CampaignContact) => [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'
  const gate = () => { if (!WRITES_ENABLED) { showToast('Preview — campaign writes are off.', 'warn'); return false } return true }

  const create = async () => {
    if (!newName.trim() || busy) return
    if (!gate()) { setShowNew(false); return }
    setBusy(true)
    try {
      const row = await createCampaign(newName, newDesc)
      setNewName(''); setNewDesc(''); setShowNew(false)
      showToast('Campaign created', 'success')
      await loadCampaigns(row?.id ?? null)
    } catch (e) { showToast('Create failed: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const del = async (c: Campaign) => {
    if (busy) return
    if (!gate()) return
    if (!window.confirm(`Delete campaign "${c.name || 'untitled'}"? Contacts themselves aren’t deleted — only their membership.`)) return
    setBusy(true)
    try {
      await deleteCampaign(c.id)
      showToast('Campaign deleted', 'info')
      await loadCampaigns(null)
    } catch (e) { showToast('Delete failed: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const memberIds = new Set((contacts || []).map((c) => c.id))

  const add = async (c: CampaignContact) => {
    if (!selId || busy) return
    if (!gate()) return
    setBusy(true)
    try {
      await addContactToCampaign(selId, c.id)
      setTerm(''); setResults(null)
      await loadContacts(selId)
      showToast(`Added ${name(c)}`, 'success')
    } catch (e) { showToast('Add failed: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const remove = async (c: CampaignContact) => {
    if (!selId || busy) return
    if (!gate()) return
    setBusy(true)
    try {
      await removeContactFromCampaign(selId, c.id)
      await loadContacts(selId)
      showToast(`Removed ${name(c)}`, 'info')
    } catch (e) { showToast('Remove failed: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const input: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '7px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
  const rv = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent)' : '#fff', color: on ? '#fff' : 'var(--text)' })
  const accounts = Array.from(new Set((contacts || []).map((c) => c.client_name || '').filter(Boolean)))
  const quotesFor = (acct: string) => (quotes || []).filter((q) => { const c = (q.customer || '').toLowerCase(); const n = acct.toLowerCase(); return !!n && (c.includes(n) || n.includes(c)) })

  return (
    <Modal title="Campaigns" onClose={onClose} width={820}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{list ? `${list.length} campaign${list.length === 1 ? '' : 's'}` : ''}</span>
        {!showNew && <Button variant="secondary" small onClick={() => setShowNew(true)}>+ New campaign</Button>}
      </div>

      {showNew && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Campaign name" style={input} autoFocus />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" style={input} />
          <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
            <Button variant="ghost" small onClick={() => { setShowNew(false); setNewName(''); setNewDesc('') }} disabled={busy}>Cancel</Button>
            <Button variant="primary" small onClick={create} disabled={busy || !newName.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      )}

      {err && <div style={{ color: 'var(--accent)' }}>Couldn’t load: {err}</div>}
      {!err && !list && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {!err && list && list.length === 0 && !showNew && <div style={{ color: 'var(--muted)' }}>No campaigns yet. Create one to get started.</div>}

      {!err && list && list.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--sp-5)' }}>
          <div style={{ borderRight: '1px solid var(--border)', paddingRight: 'var(--sp-4)', maxHeight: 440, overflowY: 'auto' }}>
            {list.map((c) => {
              const active = c.id === selId
              return (
                <div key={c.id} onClick={() => setSelId(c.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: active ? 'var(--accent-soft)' : 'transparent', marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{c.name || '(untitled)'}</div>
                    {c.description && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>{c.description}</div>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); del(c) }} title="Delete campaign" aria-label="Delete campaign" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              )
            })}
          </div>

          <div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
              <button onClick={() => setRightView('contacts')} style={rv(rightView === 'contacts')}>Contacts{contacts ? ` · ${contacts.length}` : ''}</button>
              <button onClick={() => setRightView('opps')} style={rv(rightView === 'opps')}>Opportunities{quotes ? ` · ${quotes.length}` : ''}</button>
            </div>

            {rightView === 'contacts' && (<>
            <div style={{ position: 'relative', marginBottom: 'var(--sp-3)' }}>
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search contacts to add…" style={input} disabled={!selId} />
              {results && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', maxHeight: 260, overflowY: 'auto' }}>
                  {results.length === 0 ? (
                    <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No matches.</div>
                  ) : results.map((c) => {
                    const already = memberIds.has(c.id)
                    return (
                      <div key={c.id} onClick={() => !already && add(c)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-2)', padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: already ? 'default' : 'pointer', opacity: already ? 0.55 : 1 }}>
                        <span><span style={{ fontWeight: 600 }}>{name(c)}</span>{c.email ? <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}> · {c.email}</span> : null}</span>
                        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: already ? 'var(--dim)' : 'var(--accent)' }}>{already ? 'Added' : '+ Add'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {!contacts && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
            {contacts && contacts.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No contacts in this campaign yet.</div>}
            {contacts && contacts.length > 0 && (
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {contacts.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-3)', padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600 }}>{name(c)}</span>{c.email ? <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}> · {c.email}</span> : null}{c.client_name ? <span style={{ color: 'var(--dim)', fontSize: 'var(--fs-caption)' }}> · {c.client_name}</span> : null}</span>
                    <button onClick={() => remove(c)} disabled={busy} title="Remove from campaign" aria-label="Remove from campaign" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', color: 'var(--dim)', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            </>)}

            {rightView === 'opps' && (
              !quotes ? (
                <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>
              ) : accounts.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>None of this campaign&rsquo;s contacts are linked to an account, so there are no opportunities to show. Link contacts to a client to see their quotes here.</div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {accounts.map((acct) => {
                    const qs = quotesFor(acct)
                    return (
                      <div key={acct} style={{ marginBottom: 'var(--sp-4)' }}>
                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>{acct} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {qs.length} quote{qs.length === 1 ? '' : 's'}</span></div>
                        {qs.length === 0 ? (
                          <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)', paddingLeft: 4 }}>No quotes found for this account.</div>
                        ) : qs.map((q) => (
                          <Link key={q.id} to={`/quote/${q.id}`} onClick={onClose} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline', padding: '6px 4px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{q.opportunity || '—'}</span>
                            <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.stage || ''}</span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(q.total || 0)}</span>
                          </Link>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
