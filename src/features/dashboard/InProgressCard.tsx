import { useEffect, useRef, useState } from 'react'
import { Card, CardLabel, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
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
  const inp: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }

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
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.opportunity || '—'}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{r.account || '—'}</td>
                  <td style={{ ...td, color: 'var(--text)' }}>{r.description || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EDIT MODE (preview) ── */}
      {editing && (
        <>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
            {WRITES_ENABLED
              ? 'Add, edit, and drag to reorder. Save updates the shared board for everyone.'
              : 'Preview — writes are off, so Save won’t sync to other users yet.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr 1.4fr 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '0 0 6px', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>
            <span />
            <span>Opportunity</span>
            <span>Account</span>
            <span>Description</span>
            <span />
          </div>
          <div>
            {rows.map((r) => (
              <div
                key={r.key}
                onDragOver={(e) => { e.preventDefault(); if (dragKey != null && dragKey !== r.key) reorderTo(dragKey, r.key) }}
                style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr 1.4fr 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '4px 0', opacity: dragKey === r.key ? 0.4 : 1 }}
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
                <button onClick={() => remove(r.key)} aria-label="Remove" title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'var(--sp-3)' }}>
            <Button variant="secondary" small onClick={add}>+ Add row</Button>
          </div>
        </>
      )}
    </Card>
  )
}
