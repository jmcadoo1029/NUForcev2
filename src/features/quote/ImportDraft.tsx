import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Button } from '../../components'
import { parseDraftImport, EXAMPLE_DRAFT, type DraftImport } from '../../lib/importDraft'

// Import a draft quote from a structured file (produced by the offline test-plan
// reader). The file is read ENTIRELY in the browser — nothing uploads — then we
// open a prefilled, unpriced quote for review. This is the NUForce end of the
// "read documents → candidate line items" pipeline.

const box: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

export function ImportDraft({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DraftImport | null>(null)
  const [showFormat, setShowFormat] = useState(false)

  const tryParse = (raw: string) => {
    setText(raw)
    if (!raw.trim()) { setDraft(null); setError(''); return }
    const res = parseDraftImport(raw)
    if (res.ok) { setDraft(res.draft); setError('') } else { setDraft(null); setError(res.error) }
  }

  const onFile = (f: File | undefined) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => tryParse(String(reader.result || ''))
    reader.onerror = () => setError('Couldn’t read that file.')
    reader.readAsText(f)
  }

  const create = () => {
    if (!draft) return
    navigate('/quote/new', { state: { prefillDraft: draft } })
    onClose()
  }

  const ti = draft?.testItem
  const lines = draft?.lineItems || []

  return (
    <Modal title="Import a draft quote" onClose={onClose} width={640}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 'var(--sp-3)' }}>
        Load a structured <b>.json</b> file (from the offline test-plan reader) to start a quote with the test item and line items already filled in. The file is read on this device — nothing is uploaded. You review and price everything before it’s saved.
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
        <label style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', cursor: 'pointer' }}>
          Choose file…
          <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>or paste the JSON below</span>
        <button onClick={() => setShowFormat((v) => !v)} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{showFormat ? 'Hide' : 'Show'} expected format</button>
      </div>

      {showFormat && (
        <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3)', fontSize: 'var(--fs-caption)', lineHeight: 1.5, overflowX: 'auto', marginBottom: 'var(--sp-3)', whiteSpace: 'pre' }}>{EXAMPLE_DRAFT}</pre>
      )}

      <textarea value={text} onChange={(e) => tryParse(e.target.value)} rows={7} placeholder="Paste draft JSON here…" style={{ ...box, lineHeight: 1.5, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', marginBottom: 'var(--sp-3)' }} />

      {error && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', marginBottom: 'var(--sp-3)' }}>{error}</div>}

      {draft && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'var(--sp-2)' }}>Preview</div>
          {draft.account && <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}><b>Account:</b> {draft.account} <span style={{ color: 'var(--dim)' }}>(link at close-won)</span></div>}
          {ti && (ti.item || ti.model || ti.drawing) && (
            <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
              <b>Item:</b> {[ti.item, ti.model && `Model ${ti.model}`, ti.drawing && `Dwg ${ti.drawing}`].filter(Boolean).join(' · ')}
              {(ti.dimL || ti.dimW || ti.dimH) && <span> · {[ti.dimL, ti.dimW, ti.dimH].filter(Boolean).join(' × ')} in</span>}
              {ti.wt && <span> · {ti.wt} lbs</span>}
            </div>
          )}
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, margin: '8px 0 4px' }}>{lines.length} line item{lines.length !== 1 ? 's' : ''} (unpriced)</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--sp-3)', padding: '3px 0', fontSize: 'var(--fs-sm)' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 34 }}>{l.code || '—'}</span>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{l.label}</span>
              {l.desc && <span style={{ color: 'var(--muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.desc}</span>}
            </div>
          ))}
          {ti?.specs && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 8 }}>Specifications text: {ti.specs.length} characters</div>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
        <Button variant="ghost" small onClick={onClose}>Cancel</Button>
        <Button small onClick={create} disabled={!draft}>Create draft quote</Button>
      </div>
    </Modal>
  )
}
