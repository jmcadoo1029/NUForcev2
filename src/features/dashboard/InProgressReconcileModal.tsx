import { useState } from 'react'
import { Modal } from '../../components'
import type { BoardMatch } from '../../lib/inProgressReconcile'

// Shown right after an approval when the approved quote(s) match rows on the shared
// "In progress" board. Everything is pre-checked for removal; the approver unchecks
// anything that should stay, then Proceed removes the still-checked rows. "Keep all"
// closes without touching the board.

export function InProgressReconcileModal({
  matches,
  busy = false,
  onCancel,
  onConfirm,
}: {
  matches: BoardMatch[]
  busy?: boolean
  onCancel: () => void
  onConfirm: (ids: string[]) => void
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(matches.map((m) => m.id)))
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const n = checked.size

  const row: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', padding: '10px 0', borderBottom: '1px solid var(--border)' }
  const btn = (bg: string, border: string, color: string): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: `1px solid ${border}`, background: bg, color, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 })

  return (
    <Modal title="Remove from In progress?" onClose={() => !busy && onCancel()} width={520}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
        {matches.length === 1
          ? 'This quote was just approved and is on the shared In progress board. Remove it, or uncheck to keep it.'
          : `${matches.length} just-approved quotes are on the shared In progress board. These will be removed — uncheck any you want to keep, then Proceed.`}
      </div>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        {matches.map((m) => (
          <label key={m.id} style={{ ...row, cursor: busy ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={checked.has(m.id)} disabled={busy} onChange={() => toggle(m.id)} style={{ marginTop: 3, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 700 }}>{m.opportunity || '(no opportunity #)'}</span>
              {m.account ? <span style={{ color: 'var(--muted)' }}> · {m.account}</span> : null}
              {m.description ? <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 2 }}>{m.description}</div> : null}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
        <button onClick={() => !busy && onCancel()} disabled={busy} style={btn('none', 'var(--border-strong)', 'var(--text)')}>Keep all</button>
        <button onClick={() => !busy && onConfirm([...checked])} disabled={busy || n === 0} style={{ ...btn('var(--accent)', 'var(--accent)', '#fff'), opacity: busy || n === 0 ? 0.5 : 1, cursor: busy || n === 0 ? 'default' : 'pointer' }}>
          {busy ? 'Removing…' : n === 0 ? 'Nothing selected' : `Remove ${n}`}
        </button>
      </div>
    </Modal>
  )
}
