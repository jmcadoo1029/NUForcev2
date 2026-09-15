import { useEffect, useRef, useState } from 'react'
import { Modal, Button } from '../../components'
import { money } from '../../lib/format'
import { fetchCrrWorkup, fetchCrrWorkupExact, searchCrrWorkups, type CrrWorkup, type CrrSummary } from '../../lib/crr'
import { buildDraftFromCrr } from '../../lib/crrImport'

// "Populate from CRR" — pull a Workspace CRR (Customer Requirements Review) workup
// into the open quote. Two ways in: it auto-matches the workup for THIS quote's
// number on open, and there's a search box to grab a different one (handy on a new
// quote, where picking a workup also fills the quote number). Everything is a
// PREVIEW — Apply fills only empty fields, appends the line items / budget, and
// appends a labeled notes block. Nothing here writes to the DB or overwrites work.

const box: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }
const capLabel: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }

export function CrrImport({ currentOpp, onClose, onApply }: { currentOpp: string; onClose: () => void; onApply: (w: CrrWorkup) => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CrrSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<CrrWorkup | null>(null)
  const [loadingSel, setLoadingSel] = useState(false)
  const [autoTried, setAutoTried] = useState(false)
  const [note, setNote] = useState('')
  const searchSeq = useRef(0)

  // Auto-match the workup for this quote's number on open.
  useEffect(() => {
    let alive = true
    const opp = (currentOpp || '').trim()
    if (!opp) { setAutoTried(true); return }
    setLoadingSel(true)
    fetchCrrWorkup(opp).then((w) => {
      if (!alive) return
      setLoadingSel(false)
      setAutoTried(true)
      if (w) { setSelected(w); setNote(`Matched the CRR workup for ${w.quote_number}.`) }
      else setNote(`No CRR workup filed under ${opp} — search for one below.`)
    })
    return () => { alive = false }
  }, [currentOpp])

  // Live search (debounced) once the user types, or an empty box → recent workups.
  useEffect(() => {
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      setSearching(true)
      const rows = await searchCrrWorkups(term)
      if (searchSeq.current === seq) { setResults(rows); setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [term])

  const pick = async (qn: string) => {
    setLoadingSel(true)
    const w = await fetchCrrWorkupExact(qn)
    setLoadingSel(false)
    if (w) { setSelected(w); setNote('') }
    else setNote(`Couldn’t load the workup for ${qn}.`)
  }

  const draft = selected ? buildDraftFromCrr(selected) : null
  const ti = draft?.testItem
  const lines = draft?.lineItems || []
  const budget = draft?.budget || []
  const notesBlock = ti?.notes || ''

  return (
    <Modal title="Populate from CRR" onClose={onClose} width={680}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 'var(--sp-3)' }}>
        Pull a Workspace CRR workup into this quote. Only <b>empty</b> fields are filled, the EMI / Power Quality / DC&nbsp;Magnetics line items and any budget items are <b>added</b>, and the requirements text is <b>appended</b> to Notes. Nothing already on the quote is overwritten — review the preview, then Apply.
      </div>

      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={capLabel}>Find a workup</div>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by quote number or customer…" style={box} autoFocus={!currentOpp} />
      </div>

      {(term.trim() || !selected) && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 190, overflowY: 'auto', marginBottom: 'var(--sp-3)' }}>
          {searching && <div style={{ padding: '10px 12px', fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>Searching…</div>}
          {!searching && results.length === 0 && <div style={{ padding: '10px 12px', fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>No workups found.</div>}
          {!searching && results.map((r) => {
            const isSel = selected?.quote_number?.toUpperCase() === r.quote_number.toUpperCase()
            return (
              <button
                key={r.quote_number}
                onClick={() => pick(r.quote_number)}
                style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 'var(--sp-3)', alignItems: 'baseline', padding: '8px 12px', background: isSel ? 'var(--bg)' : '#fff', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 72 }}>{r.quote_number}</span>
                <span style={{ fontSize: 'var(--fs-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_company || '—'}</span>
                {r.ready_to_quote && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--ok, #2f855a)' }}>Ready</span>}
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{r.status}</span>
              </button>
            )
          })}
        </div>
      )}

      {note && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>{note}</div>}
      {loadingSel && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', marginBottom: 'var(--sp-3)' }}>Loading workup…</div>}

      {draft && selected && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'var(--sp-2)' }}>
            Preview — {selected.quote_number}{draft.account ? ` · ${draft.account}` : ''}
          </div>

          {ti && (ti.item || ti.dimL || ti.wt || ti.volt) && (
            <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
              <b>Test item:</b>{' '}
              {[ti.item, (ti.dimL || ti.dimW || ti.dimH) && `${[ti.dimL, ti.dimW, ti.dimH].filter(Boolean).join(' × ')} in`, ti.wt && `${ti.wt} lbs`, ti.volt && `${ti.volt}V ${ti.pwrType || ''} ${ti.phase ? ti.phase + 'ph' : ''} ${ti.hz ? ti.hz + 'Hz' : ''}`.trim(), ti.amps && `${ti.amps}A`].filter(Boolean).join(' · ')}
            </div>
          )}

          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, margin: '8px 0 4px' }}>{lines.length} line item{lines.length !== 1 ? 's' : ''}</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--sp-3)', padding: '3px 0', fontSize: 'var(--fs-sm)', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 26 }}>{l.code || '—'}</span>
              <span style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
              <span style={{ color: (l.price || 0) > 0 ? 'var(--text)' : 'var(--dim)', whiteSpace: 'nowrap' }}>{(l.price || 0) > 0 ? money(l.price || 0) : 'you price'}</span>
            </div>
          ))}

          {budget.length > 0 && (
            <>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, margin: '8px 0 4px' }}>{budget.length} budget item{budget.length !== 1 ? 's' : ''} <span style={{ fontWeight: 400, color: 'var(--dim)' }}>(raw cost, +markup applied in Budget)</span></div>
              {budget.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--sp-3)', padding: '3px 0', fontSize: 'var(--fs-sm)', alignItems: 'baseline' }}>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.desc}</span>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{b.qty && Number(b.qty) > 1 ? `${b.qty} × ` : ''}{money(Number(b.unitCost) || 0)}</span>
                </div>
              ))}
            </>
          )}

          {notesBlock && (
            <>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, margin: '8px 0 4px' }}>Notes to append</div>
              <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-2) var(--sp-3)', fontSize: 'var(--fs-caption)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{notesBlock}</pre>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
        <Button variant="ghost" small onClick={onClose}>Cancel</Button>
        <Button small onClick={() => { if (selected) { onApply(selected); onClose() } }} disabled={!selected}>Apply to quote</Button>
      </div>
    </Modal>
  )
}
