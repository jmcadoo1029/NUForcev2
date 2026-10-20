import { useEffect, useRef, useState } from 'react'
import { Card, CardLabel, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { restFetch } from '../../lib/restFetch'
import { baseOpp } from '../../lib/opp'
import { getSessionEmail } from '../../lib/auth'
import { flagQuote, resolveFlagsForQuote, findQuoteByOpportunity } from '../../lib/quoteActions'
import { saveBoard } from '../../lib/openQuotes'
import { useOpenQuotes } from './useOpenQuotes'

// Shared "in progress" board — the same rows for everyone (open_quotes),
// replacing Classic's left-side slide-out. Read view for all; an Edit mode adds
// rows, edits fields, and drags to reorder. Save reconciles the whole board to
// open_quotes (delete/insert/update + sort_order) so it syncs across users.

interface EditRow { key: number; id?: string; opportunity: string; account: string; description: string }

export function InProgressCard() {
  const { data, err, reload } = useOpenQuotes()
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<EditRow[]>([])
  const seq = useRef(1)
  const [dragKey, setDragKey] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // Open flags, by opportunity family → the flag's note, so a board row for a flagged
  // quote shows a ⚑ and the detail someone left when they flagged it.
  const [flagNotes, setFlagNotes] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    let alive = true
    restFetch<Array<{ opportunity: string | null; note: string | null }>>('GET', 'quote_flags?select=opportunity,note&resolved=eq.false&limit=1000')
      .then((r) => {
        if (!alive) return
        const m = new Map<string, string>()
        for (const x of r || []) {
          const b = baseOpp(String(x.opportunity || '')).toUpperCase()
          if (!b) continue
          const note = String(x.note || '').trim()
          // First flag for a family wins the key; fill in a note if a later one has one.
          if (!m.has(b)) m.set(b, note)
          else if (!m.get(b) && note) m.set(b, note)
        }
        setFlagNotes(m)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [data])
  const flagBase = (opp: string | null) => { const b = baseOpp(String(opp || '')).toUpperCase(); return b && flagNotes.has(b) ? b : '' }

  // Flag-from-edit: a board row can be flagged (with a comment) right here. The flag
  // attaches to the live quote the row's opportunity resolves to, and writes
  // immediately — independently of the board's Save.
  const me = getSessionEmail() || ''
  const [flagForKey, setFlagForKey] = useState<number | null>(null)
  const [flagNoteDraft, setFlagNoteDraft] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  const setBaseFlag = (opp: string, note: string | null) => {
    const b = baseOpp(opp).toUpperCase()
    if (!b) return
    setFlagNotes((prev) => { const m = new Map(prev); if (note === null) m.delete(b); else m.set(b, note); return m })
  }
  const openFlag = (r: EditRow) => {
    setFlagForKey(r.key)
    const b = baseOpp(r.opportunity).toUpperCase()
    setFlagNoteDraft(b ? (flagNotes.get(b) || '') : '')
  }
  const closeFlag = () => { if (!flagBusy) { setFlagForKey(null); setFlagNoteDraft('') } }
  const submitFlag = async (r: EditRow) => {
    if (flagBusy) return
    const opp = r.opportunity.trim()
    if (!opp) { showToast('Add an opportunity number on this row first.', 'warn'); return }
    const note = flagNoteDraft.trim()
    if (!WRITES_ENABLED) { setBaseFlag(opp, note); showToast('Flagged (preview — writes are off).', 'info'); closeFlag(); return }
    setFlagBusy(true)
    try {
      const q = await findQuoteByOpportunity(opp)
      if (!q) { showToast(`No live quote matches ${opp} — can't flag it.`, 'error', 6000); return }
      await flagQuote({ quoteId: q.id, opportunity: q.opportunity || opp, customer: (r.account || '').trim() || q.customer || null, note, by: me })
      setBaseFlag(opp, note)
      showToast(`Flagged ${q.opportunity || opp}`, 'success')
      setFlagForKey(null); setFlagNoteDraft('')
    } catch (e) {
      showToast('Flag failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setFlagBusy(false) }
  }
  const removeFlag = async (r: EditRow) => {
    if (flagBusy) return
    const opp = r.opportunity.trim()
    if (!WRITES_ENABLED) { setBaseFlag(opp, null); showToast('Flag removed (preview).', 'info'); closeFlag(); return }
    setFlagBusy(true)
    try {
      const q = await findQuoteByOpportunity(opp)
      if (q) await resolveFlagsForQuote(q.id, me)
      setBaseFlag(opp, null)
      showToast('Flag removed', 'info')
      setFlagForKey(null); setFlagNoteDraft('')
    } catch (e) {
      showToast('Couldn’t remove flag: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setFlagBusy(false) }
  }

  // Seed the editable copy from the shared board once it loads (and whenever a
  // fresh load arrives while we're not mid-edit).
  useEffect(() => {
    if (data && !editing) {
      setRows(data.map((r) => ({ key: seq.current++, id: r.id, opportunity: r.opportunity || '', account: r.account || '', description: r.description || '' })))
    }
  }, [data, editing])

  const save = async () => {
    if (busy) return
    if (!WRITES_ENABLED) { showToast('Preview — In-progress writes are off.', 'warn'); setEditing(false); return }
    setBusy(true)
    try {
      const originalIds = (data || []).map((r) => r.id)
      await saveBoard(rows.map((r) => ({ id: r.id, opportunity: r.opportunity, account: r.account, description: r.description })), originalIds)
      showToast('In-progress board saved', 'success')
      setEditing(false)
      reload()
    } catch (e) {
      showToast('Save failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 7000)
    } finally {
      setBusy(false)
    }
  }

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 10px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)' }
  const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
  const inp: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }

  const upd = (key: number, patch: Partial<EditRow>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: number) => setRows((cur) => cur.filter((r) => r.key !== key))
  const add = () => setRows((cur) => [...cur, { key: seq.current++, opportunity: '', account: '', description: '' }])
  const reorderTo = (fromKey: number, toKey: number) =>
    setRows((cur) => {
      const from = cur.findIndex((r) => r.key === fromKey)
      const to = cur.findIndex((r) => r.key === toKey)
      if (from < 0 || to < 0 || from === to) return cur
      const next = [...cur]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })

  const cancelEdit = () => {
    // Discard local changes — reseed from the shared board.
    if (data) setRows(data.map((r) => ({ key: seq.current++, opportunity: r.opportunity || '', account: r.account || '', description: r.description || '' })))
    setEditing(false)
  }

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
        <CardLabel>In progress</CardLabel>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)', background: 'var(--info-soft)', borderRadius: 20, padding: '2px 9px' }}>Shared</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-2)' }}>
          {editing ? (
            <>
              <Button variant="ghost" small onClick={cancelEdit} disabled={busy}>Cancel</Button>
              <Button variant="primary" small onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </>
          ) : (
            <Button variant="secondary" small onClick={() => setEditing(true)} disabled={!data}>Edit</Button>
          )}
        </div>
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}

      {/* ── VIEW MODE ── */}
      {!editing && !err && data && data.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Nothing in progress.</div>}
      {!editing && !err && data && data.length > 0 && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' }}>
            <thead>
              <tr>
                <th style={th}>Opportunity</th>
                <th style={th}>Account</th>
                <th style={th}>Description</th>
                <th style={{ ...th, width: 220 }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const fb = flagBase(r.opportunity)
                const note = fb ? flagNotes.get(fb) || '' : ''
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.opportunity || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.account || '—'}</td>
                    <td style={{ ...td, color: 'var(--text)' }}>{r.description || ''}</td>
                    <td style={td}>
                      {fb ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span title="This quote is flagged for attention" style={{ alignSelf: 'flex-start', fontSize: 'var(--fs-caption)', fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 20, padding: '1px 7px' }}>⚑ Flagged</span>
                          {note && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', lineHeight: 1.35 }}>{note}</span>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--dim)' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EDIT MODE (preview) ── */}
      {editing && (
        <>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
            {WRITES_ENABLED
              ? 'Add, edit, and drag to reorder. Save updates the shared board for everyone. Use ⚑ Flag to flag a quote (saves right away).'
              : 'Preview — writes are off, so Save won’t sync to other users yet.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr 1.4fr auto 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '0 0 6px', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>
            <span />
            <span>Opportunity</span>
            <span>Account</span>
            <span>Description</span>
            <span />
            <span />
          </div>
          <div>
            {rows.map((r) => {
              const flagged = !!flagBase(r.opportunity)
              const panelOpen = flagForKey === r.key
              return (
                <div key={r.key}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); if (dragKey != null && dragKey !== r.key) reorderTo(dragKey, r.key) }}
                    style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr 1.4fr auto 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '4px 0', opacity: dragKey === r.key ? 0.4 : 1 }}
                  >
                    <span
                      draggable
                      onDragStart={() => setDragKey(r.key)}
                      onDragEnd={() => setDragKey(null)}
                      title="Drag to reorder"
                      style={{ cursor: 'grab', color: 'var(--dim)', textAlign: 'center', userSelect: 'none', lineHeight: 1 }}
                    >⠿</span>
                    <input value={r.opportunity} onChange={(e) => upd(r.key, { opportunity: e.target.value })} placeholder="26-000" style={inp} />
                    <input value={r.account} onChange={(e) => upd(r.key, { account: e.target.value })} placeholder="Account" style={inp} />
                    <input value={r.description} onChange={(e) => upd(r.key, { description: e.target.value })} placeholder="What's happening…" style={inp} />
                    <button
                      onClick={() => (panelOpen ? closeFlag() : openFlag(r))}
                      title={flagged ? 'Flagged — edit or remove the flag' : 'Flag this quote for attention'}
                      style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', borderRadius: 20, padding: '4px 9px', border: `1px solid ${flagged ? 'var(--accent)' : 'var(--border-strong)'}`, background: flagged ? 'var(--accent-soft)' : 'var(--surface)', color: flagged ? 'var(--accent)' : 'var(--muted)' }}
                    >{flagged ? '⚑ Flagged' : '⚑ Flag'}</button>
                    <button onClick={() => remove(r.key)} aria-label="Remove" title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                  {panelOpen && (
                    <div style={{ margin: '2px 0 10px', marginLeft: 28, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                      <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4 }}>Flag comment</label>
                      <input
                        value={flagNoteDraft}
                        onChange={(e) => setFlagNoteDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitFlag(r) }}
                        placeholder="What needs attention on this quote?"
                        style={inp}
                        autoFocus
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
                        <Button variant="primary" small disabled={flagBusy} onClick={() => submitFlag(r)}>{flagBusy ? 'Saving…' : flagged ? 'Update flag' : 'Flag quote'}</Button>
                        {flagged && <Button variant="ghost" small disabled={flagBusy} onClick={() => removeFlag(r)}>Remove flag</Button>}
                        <Button variant="ghost" small disabled={flagBusy} onClick={closeFlag}>Cancel</Button>
                        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>Saves right away — separate from the board’s Save.</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 'var(--sp-3)' }}>
            <Button variant="secondary" small onClick={add}>+ Add row</Button>
          </div>
        </>
      )}
    </Card>
  )
}
