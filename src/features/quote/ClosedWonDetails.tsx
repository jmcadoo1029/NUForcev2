import { useState } from 'react'
import { Card, CardLabel, Button } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'

// Closed-Won details capture (wonInfo = { wonDate, jobNum, poNum }). Appears once
// a quote is won-approved / Closed Won. Internal-only — not on the quote PDF.
// Controlled by QuotePage (which owns the value so Save persists it and the
// Workspace payload uses the live value).
//
// Button swap (matches Classic): "Open in Workspace" shows when the quote is
// already linked, OR when the Job # is unchanged from what loaded (project
// presumably exists). A freshly-typed Job # → first-time "Create project".
//
// Lock: once there's any won info, the fields lock by default and only an
// approver can unlock them to edit.

export interface WonInfo { wonDate: string; jobNum: string; poNum: string }

const FIELDS: [keyof WonInfo, string, string][] = [
  ['wonDate', 'Won Date', 'e.g. 3/18/2026'],
  ['jobNum', 'Job #', 'e.g. J-2025-042'],
  ['poNum', 'PO #', 'e.g. PO-98765'],
]

const label: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }
const hasAny = (w: WonInfo) => !!(w.wonDate?.trim() || w.jobNum?.trim() || w.poNum?.trim())

export function ClosedWonDetails({
  wonInfo,
  onChange,
  projectId,
  isApprover = false,
  busy = false,
  onCreateProject,
  onAddToExisting,
  onOpenInWorkspace,
  onUnlink,
}: {
  wonInfo: WonInfo
  onChange: (next: WonInfo) => void
  projectId?: string | null
  loadedJobNum?: string
  isApprover?: boolean
  busy?: boolean
  onCreateProject: () => void
  onAddToExisting: () => void
  onOpenInWorkspace: () => void
  onUnlink: () => void
}) {
  // Locked by default when the quote already has won info; approvers can unlock.
  const [locked, setLocked] = useState(() => hasAny(wonInfo))
  const linked = !!projectId
  const curJob = wonInfo.jobNum.trim()
  // "Open in Workspace" shows ONLY when actually linked. Previously it also showed
  // when the Job # matched what loaded — but that made a quote that was NEVER linked
  // look linked (masking a failed/ skipped project creation). Not-linked quotes now
  // always show "Create project" (+ a self-heal "Open by Job #" for Classic projects).
  const showOpen = linked
  const notLinked = hasAny(wonInfo) && !linked
  const canUnlock = isApprover

  const inputStyle = (): React.CSSProperties => ({
    width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-strong)', boxSizing: 'border-box',
    background: locked ? 'var(--bg)' : '#fff', color: locked ? 'var(--muted)' : 'var(--text)', cursor: locked ? 'not-allowed' : 'text',
  })

  const set = (k: keyof WonInfo, v: string) => { if (!locked) onChange({ ...wonInfo, [k]: v }) }

  // Toggle: unlocking is approver-only; re-locking is always allowed.
  const toggleLock = () => { if (!locked) { setLocked(true); return } if (canUnlock) setLocked(false) }
  const lockDisabled = locked && !canUnlock

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-1)' }}>
        <CardLabel>Closed-Won details</CardLabel>
        {linked && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)', background: 'var(--pos-soft, #e6f4ea)', borderRadius: 20, padding: '2px 10px' }}>Linked to Workspace</span>}
        {notLinked && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 20, padding: '2px 10px' }}>Not linked to Workspace</span>}
        <Button variant="secondary" small onClick={toggleLock} disabled={lockDisabled} style={{ marginLeft: 'auto' }} title={locked ? (canUnlock ? 'Unlock to edit' : 'Locked — only approvers can unlock') : 'Lock to prevent changes'}>{locked ? 'Locked' : 'Unlocked'}</Button>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
        Internal use only — not included in the quote PDF. Saved with the quote.{locked && !canUnlock ? ' Locked — an approver can unlock to edit.' : ''}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-3)' }}>
        {FIELDS.map(([key, lbl, ph]) => (
          <div key={key} style={{ minWidth: 0 }}>
            <div style={label}>{lbl}</div>
            <input value={wonInfo[key]} onChange={(e) => set(key, e.target.value)} readOnly={locked} placeholder={ph} style={inputStyle()} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', flexWrap: 'wrap' }}>
        {showOpen ? (
          <Button variant="primary" small onClick={onOpenInWorkspace} disabled={busy}>{busy ? 'Working…' : 'Open in Workspace ↗'}</Button>
        ) : (
          <Button variant="primary" small onClick={onCreateProject} disabled={busy || !WRITES_ENABLED}>{busy ? 'Working…' : 'Create Workspace project'}</Button>
        )}
        {!linked && <Button variant="secondary" small onClick={onAddToExisting} disabled={busy || !WRITES_ENABLED}>Add to existing project</Button>}
        {!linked && !!curJob && <Button variant="ghost" small onClick={onOpenInWorkspace} disabled={busy} title="Already built in Workspace (e.g. in Classic)? Look it up by Job # and link it here.">Open by Job #</Button>}
        {linked && <Button variant="ghost" small onClick={onUnlink} disabled={busy}>Unlink</Button>}
        {!WRITES_ENABLED && !showOpen && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--warn)', fontStyle: 'italic' }}>Preview — writes are off, so project creation is disabled.</span>}
      </div>
      <div style={{ fontSize: 'var(--fs-caption)', color: notLinked ? 'var(--accent)' : 'var(--dim)', marginTop: 'var(--sp-3)' }}>
        {showOpen
          ? 'This quote is tied to a Workspace project — Open resolves it by Job #. Change the Job # to create a new project instead.'
          : notLinked
            ? 'This won quote is not yet in Workspace. Click Create Workspace project to build it (needs a linked account). If it already exists — e.g. built in Classic — use Open by Job # to link it here, or Add to existing.'
            : 'Create saves the quote, then builds a Workspace project from its Job #, line items, budget, and contacts. Add to existing appends this quote to a project that already has this Job #.'}
      </div>
    </Card>
  )
}
