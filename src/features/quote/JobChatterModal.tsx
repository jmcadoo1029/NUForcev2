import { useState } from 'react'
import { Modal, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { appendChatter } from '../../lib/quoteActions'
import { setBusinessType } from '../../lib/quoteActions'
import { postJobChatter, additionalChargesMessage, EXISTING_BIZ_REASONS, type ExistingBizReason } from '../../lib/workspace'

// Additional-charges → Workspace job chatter.
// When an Existing-Business quote is sent (or on demand from the quote form), the
// sender picks why the quote was generated; we post a chatter entry onto the matching
// Workspace JOB (linked by Job #), Workspace notifies its configured group, and we
// drop a matching note in the NUForce chatter. "Actually New Business" reclassifies
// the quote instead of posting (for an accidental Existing-Business mark).
//
//   cancelable=false (post-send): the sender MUST pick a reason or reclassify.
//   cancelable=true  (manual launch from the form): a Close button is offered too.

const REASON_LABELS: Record<ExistingBizReason, string> = {
  additional_scope: 'Additional Scope',
  immediate_testing: 'Immediate Testing',
  future_retest: 'Future Retest',
}
const REASON_ORDER: ExistingBizReason[] = ['additional_scope', 'immediate_testing', 'future_retest']

export function JobChatterModal({
  quoteId, opportunity, initialJobNum, me, cancelable,
  onPosted, onReclassified, onClose,
}: {
  quoteId: string
  opportunity: string
  initialJobNum: string
  me: string
  cancelable: boolean
  onPosted?: () => void
  onReclassified?: () => void
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [jobNum, setJobNum] = useState(initialJobNum || '')
  const [busy, setBusy] = useState<ExistingBizReason | 'reclassify' | null>(null)

  const post = async (reason: ExistingBizReason) => {
    if (!WRITES_ENABLED) { showToast('Writes are off — nothing posted.', 'warn'); return }
    const jn = jobNum.trim()
    if (!jn) { showToast('Enter the Job # so the chatter lands on the right Workspace job.', 'warn', 4000); return }
    setBusy(reason)
    try {
      const message = additionalChargesMessage(opportunity, reason)
      await postJobChatter(jn, message) // throws on failure — the sender needs to know
      // Mirror it in NUForce so the quote shows the Workspace note happened.
      try {
        await appendChatter(quoteId, {
          by: me, at: new Date().toISOString(), auto: true,
          msg: `Workspace chatter posted to Job #${jn} — additional charges (${EXISTING_BIZ_REASONS[reason]}); notified the contracting group.`,
        })
      } catch { /* NUForce mirror is best-effort */ }
      showToast(`Posted to Workspace Job #${jn} and notified the group.`, 'success', 5000)
      onPosted?.()
      onClose()
    } catch (e) {
      showToast('Couldn’t post to Workspace: ' + (e instanceof Error ? e.message : String(e)), 'error', 8000)
      setBusy(null)
    }
  }

  const reclassify = async () => {
    if (!WRITES_ENABLED) { showToast('Writes are off — nothing changed.', 'warn'); return }
    setBusy('reclassify')
    try {
      await setBusinessType(quoteId, 'New Business')
      showToast('Changed to New Business — no Workspace chatter posted.', 'success', 5000)
      onReclassified?.()
      onClose()
    } catch (e) {
      showToast('Couldn’t change the business type: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
      setBusy(null)
    }
  }

  const label = { fontSize: 'var(--fs-caption)', fontWeight: 700 as const, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'var(--dim)', marginBottom: 6 }
  const input = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' as const }

  return (
    // Not dismissable by backdrop/X on the post-send path — a choice is required.
    <Modal title="Additional charges — notify Workspace" onClose={cancelable ? onClose : () => {}} width={480}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
        This is an <b>Existing Business</b> quote (<b>#{opportunity}</b>). Post a note to its Workspace job so the team knows it went out for additional charges. Pick the reason:
      </div>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <div style={label}>Workspace Job #</div>
        <input value={jobNum} onChange={(e) => setJobNum(e.target.value)} placeholder="e.g. 12345" style={input} />
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 4 }}>This links the chatter to the right job. Prefilled from the quote when available.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
        {REASON_ORDER.map((r) => (
          <button
            key={r}
            onClick={() => post(r)}
            disabled={busy !== null}
            style={{ fontFamily: 'inherit', fontSize: 'var(--fs-base)', fontWeight: 700, textAlign: 'left', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: busy ? 'default' : 'pointer' }}
          >
            {busy === r ? 'Posting…' : REASON_LABELS[r]}
            <span style={{ display: 'block', fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
              “…This quote is for {EXISTING_BIZ_REASONS[r]}.”
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' }}>
        <button
          onClick={reclassify}
          disabled={busy !== null}
          title="Mark this quote as New Business — no Workspace chatter is posted"
          style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy === 'reclassify' ? 'Changing…' : 'This was actually New Business'}
        </button>
        {cancelable && <Button variant="ghost" small onClick={onClose} disabled={busy !== null}>Close</Button>}
      </div>
    </Modal>
  )
}
