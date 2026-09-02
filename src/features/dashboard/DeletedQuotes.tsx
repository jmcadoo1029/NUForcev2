import { useEffect, useState } from 'react'
import { Modal, useToast } from '../../components'
import { money, fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { getSessionEmail } from '../../lib/auth'
import { fetchDeletedQuotes, restoreQuote, type DeletedQuote } from '../../lib/quoteActions'

// Approver-only restore view for soft-deleted quotes. Lists everything with a
// non-null deleted_at (restFetch normally hides these) and lets an approver put
// one back. Reached from the dashboard ⋯ menu → Deleted quotes.
export function DeletedQuotes({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [rows, setRows] = useState<DeletedQuote[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchDeletedQuotes()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
    return () => { alive = false }
  }, [])

  const restore = async (q: DeletedQuote) => {
    if (busyId) return
    setBusyId(q.id)
    try {
      await restoreQuote(q.id, me)
      setRows((cur) => (cur ? cur.filter((x) => x.id !== q.id) : cur))
      showToast(`Restored ${q.opportunity || 'quote'}`, 'success')
    } catch (e) {
      showToast('Restore failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal title="Deleted quotes" onClose={onClose} width={640}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        Deleted quotes are hidden from every list but not erased. Restore one to bring it back exactly as it was.
      </div>
      {rows === null ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4) 0', textAlign: 'center' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4) 0', textAlign: 'center' }}>No deleted quotes.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', maxHeight: 440, overflowY: 'auto' }}>
          {rows.map((q) => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text)' }}>
                  {q.opportunity || '(no number)'}{q.customer ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {q.customer}</span> : null}
                </div>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', marginTop: 2 }}>
                  {q.total != null ? money(q.total) : '—'}
                  {q.stage ? ` · ${q.stage}` : ''}
                  {q.deleted_at ? ` · deleted ${fmtDate(q.deleted_at)}` : ''}
                  {q.deleted_by ? ` by ${prettifyEmail(q.deleted_by)}` : ''}
                </div>
              </div>
              <button
                onClick={() => restore(q)}
                disabled={busyId === q.id}
                style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 16px', cursor: busyId === q.id ? 'default' : 'pointer', flexShrink: 0 }}
              >{busyId === q.id ? 'Restoring…' : 'Restore'}</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
