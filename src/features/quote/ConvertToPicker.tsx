import { useState } from 'react'
import { Modal, Button } from '../../components'
import { money } from '../../lib/format'
import { buildCatalog, sortCatalog, isActive, resolveLine } from '../../data/catalog'

// Convert-to-picker — migrate a Salesforce-imported quote's raw line items into
// true picker line items. Each imported line is assigned to a catalog product (or
// kept as a custom line); the catalog's code+label replace the raw ones while the
// line's specifics survive as its description, and the price carries over 1:1 so
// the total never drifts. Preview only — nothing persists until the quote is Saved.
// Safety: every line must be assigned before Convert is enabled.

const CUSTOM = '__custom__'

export interface ConvertLine { key: number; code: string; label: string; desc: string; price: number }
export interface ConvertedLine { code: string; label: string; desc: string; price: number }

// Pull the specifics off an imported label ("Vibration Testing — 8\" Valve" → "8\" Valve").
function specificsOf(label: string, desc: string): string {
  const parts = label.split(/\s[—–-]\s/)
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : (desc || '')
}

export function ConvertToPicker({ lines, onConvert, onClose }: { lines: ConvertLine[]; onConvert: (converted: ConvertedLine[]) => void; onClose: () => void }) {
  const active = sortCatalog(buildCatalog(), 'code').filter(isActive)
  const byKey = new Map(active.map((p) => [p.key, p]))

  // Pre-fill each line: confident active match → it; dormant with active alias →
  // the alias; otherwise leave unassigned so the user must choose.
  const [assign, setAssign] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const l of lines) {
      const r = resolveLine(l.code, l.label)
      if (r.entry && isActive(r.entry)) init[l.key] = r.entry.key
      else if (r.entry && r.entry.aliasTo && byKey.has(r.entry.aliasTo)) init[l.key] = r.entry.aliasTo
      else init[l.key] = ''
    }
    return init
  })

  const resultOf = (l: ConvertLine): ConvertedLine | null => {
    const a = assign[l.key]
    if (!a) return null
    if (a === CUSTOM) return { code: l.code, label: l.label, desc: l.desc, price: l.price }
    const p = byKey.get(a)
    if (!p) return null
    return { code: p.code, label: p.label, desc: specificsOf(l.label, l.desc), price: l.price }
  }

  const assignedCount = lines.filter((l) => assign[l.key]).length
  const allAssigned = assignedCount === lines.length
  const origTotal = lines.reduce((a, l) => a + l.price, 0)
  const newTotal = lines.reduce((a, l) => a + (resultOf(l)?.price ?? 0), 0)

  const sel: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '6px 9px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

  const doConvert = () => {
    if (!allAssigned) return
    const converted = lines.map((l) => resultOf(l)).filter((x): x is ConvertedLine => x != null)
    onConvert(converted)
    onClose()
  }

  return (
    <Modal title="Convert to picker line items" onClose={onClose} width={900}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-4)' }}>
        Assign each imported line to a catalog product, or keep it as a custom line. The catalog name replaces the imported one; the line’s specifics move to its description and the price carries over. Preview — nothing changes until you Save the quote.
      </div>

      <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 260px 1.1fr 84px', gap: 'var(--sp-3)', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '0 2px 8px', position: 'sticky', top: 0, background: 'var(--card)' }}>
          <div>Imported line</div>
          <div>Assign to</div>
          <div>Result</div>
          <div style={{ textAlign: 'right' }}>Price</div>
        </div>

        {lines.map((l) => {
          const res = resultOf(l)
          const unassigned = !assign[l.key]
          return (
            <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr 260px 1.1fr 84px', gap: 'var(--sp-3)', alignItems: 'center', padding: '8px 2px', borderBottom: '1px solid var(--border)', background: unassigned ? 'var(--warn-soft)' : undefined }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)' }}>{l.label}</div>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>code {l.code || '—'}</div>
              </div>
              <select value={assign[l.key]} onChange={(e) => setAssign((a) => ({ ...a, [l.key]: e.target.value }))} style={{ ...sel, borderColor: unassigned ? 'var(--warn)' : 'var(--border-strong)' }}>
                <option value="">— Choose —</option>
                <option value={CUSTOM}>Keep as custom line</option>
                {active.map((p) => (
                  <option key={p.key} value={p.key}>{p.code} — {p.label}</option>
                ))}
              </select>
              <div style={{ minWidth: 0, fontSize: 'var(--fs-sm)' }}>
                {res ? (
                  <>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{res.label}{assign[l.key] === CUSTOM && <span style={{ marginLeft: 6, fontSize: 'var(--fs-caption)', color: 'var(--dim)', textTransform: 'uppercase' }}>custom</span>}</div>
                    {res.desc && <div style={{ color: 'var(--muted)' }}>{res.desc}</div>}
                  </>
                ) : (
                  <span style={{ color: 'var(--warn)', fontStyle: 'italic' }}>Needs assignment</span>
                )}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.price)}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--border)', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: allAssigned ? 'var(--muted)' : 'var(--warn)', fontWeight: allAssigned ? 400 : 700 }}>
          {assignedCount} of {lines.length} assigned
          <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 'var(--sp-3)' }}>
            Total {money(origTotal)} → <b style={{ color: newTotal === origTotal ? 'var(--pos)' : 'var(--accent)' }}>{money(newTotal)}</b>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <Button variant="secondary" small onClick={onClose}>Cancel</Button>
          <Button variant="primary" small disabled={!allAssigned} onClick={doConvert}>{allAssigned ? 'Convert' : `Assign all ${lines.length}`}</Button>
        </div>
      </div>
    </Modal>
  )
}
