import { useState } from 'react'
import { Card, CardLabel, Button } from '../../../components'
import { money, sf } from '../../../lib/format'
import { PCODE_OPTS } from '../../../data/constants'
import { resolveLine } from '../../../data/catalog'
import type { LineItem } from '../../../data/quoteDefaults'
import { regInput } from './fields'

// A "!" shown next to a line whose product is dormant (retired) — a cue to swap it
// for an active equivalent when the quote is revised. When the retired product has
// an alias (e.g. Wind/Rain → Spray), the tooltip names the active replacement.
const DORMANT_TITLE = 'Retired product — replace it with an active item if you revise this quote.'
const dormantTitle = (alias?: string) => (alias ? `Retired product — maps to “${alias}”. Replace it on revision.` : DORMANT_TITLE)
function DormantFlag({ alias }: { alias?: string }) {
  return (
    <span title={dormantTitle(alias)} aria-label="Retired product" style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--warn)', color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1, verticalAlign: 'middle', flexShrink: 0, cursor: 'help' }}>!</span>
  )
}

// Line items — read-only Salesforce-style table (view) or an editable, drag-to-
// sort list (edit). Drag state is local UI; the list itself is owned by the page.
export function LineItemsCard({
  lineItems,
  editing,
  lineEditing,
  locked,
  onToggleLineEditing,
  onUpdateLine,
  onRemoveLine,
  onReorder,
  onOpenCalc,
  onOpenPicker,
  needsConversion = false,
  onConvert,
}: {
  lineItems: LineItem[]
  editing: boolean
  lineEditing: boolean
  locked: boolean
  onToggleLineEditing: () => void
  onUpdateLine: (key: number, patch: Partial<LineItem>) => void
  onRemoveLine: (key: number) => void
  onReorder: (fromKey: number, toKey: number) => void
  onOpenCalc: () => void
  onOpenPicker: () => void
  // Unconverted Salesforce import: editing is blocked until Convert-to-picker runs.
  needsConversion?: boolean
  onConvert?: () => void
}) {
  const [dragKey, setDragKey] = useState<number | null>(null)
  // Two read-only views over ONE set of data: Standard (as today) and Quantity (adds
  // Qty + Amount columns). Nothing about the data differs — only what's shown.
  const [qtyView, setQtyView] = useState(false)
  const qtyOf = (l: LineItem) => Math.max(1, Math.round(l.qty || 1))
  const lineTotal = lineItems.reduce((a, l) => a + l.price * qtyOf(l), 0)

  return (
    <Card pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-5) var(--sp-5) var(--sp-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <CardLabel>Line items ({lineItems.length})</CardLabel>
          {lineItems.length > 0 && !(editing || lineEditing) && (
            <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 20, overflow: 'hidden' }}>
              {([['Standard', false], ['Quantity', true]] as const).map(([lbl, v]) => (
                <button
                  key={lbl}
                  onClick={() => setQtyView(v)}
                  style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '3px 12px', cursor: 'pointer', border: 'none', background: qtyView === v ? 'var(--accent)' : '#fff', color: qtyView === v ? '#fff' : 'var(--muted)' }}
                >{lbl}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          {needsConversion && <Button variant="primary" small onClick={onConvert}>Convert to picker</Button>}
          {locked ? (
            // A locked (approved/won) quote is read-only for line items — Save is
            // hidden too, so editing here would dead-end. Point to the reopen path.
            <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>Locked — reopen the quote to edit line items</span>
          ) : (
            <>
              <Button variant="secondary" small disabled={needsConversion} title={needsConversion ? 'Convert this imported quote to picker line items first' : undefined} onClick={onOpenCalc}>Pricing Calculator</Button>
              <Button variant="secondary" small disabled={needsConversion} title={needsConversion ? 'Convert this imported quote to picker line items first' : undefined} onClick={onOpenPicker}>+ Add line items</Button>
              {!editing && <Button variant={lineEditing ? 'primary' : 'secondary'} small disabled={needsConversion} title={needsConversion ? 'Convert this imported quote to picker line items first' : undefined} onClick={onToggleLineEditing}>{lineEditing ? 'Save' : 'Edit'}</Button>}
            </>
          )}
        </div>
      </div>

      {needsConversion && (
        <div style={{ margin: '0 var(--sp-5) var(--sp-3)', background: 'var(--warn-soft)', border: '1px solid var(--warn-border)', borderRadius: 'var(--radius-sm)', padding: '9px 13px', fontSize: 'var(--fs-sm)', color: 'var(--warn)' }}>
          This is a Salesforce-imported quote in the legacy line-item format. Convert it to picker line items to add, edit, or reprice — nothing changes until you Save.
        </div>
      )}

      {lineItems.length === 0 ? (
        <div style={{ padding: '0 var(--sp-5) var(--sp-5)', color: 'var(--muted)' }}>No line items yet — use the Pricing Calculator or Add line items.</div>
      ) : !(editing || lineEditing) ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '10px var(--sp-5)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Code</th>
              <th style={{ textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Item</th>
              <th style={{ textAlign: 'left', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Description</th>
              {qtyView && <th style={{ textAlign: 'center', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Qty</th>}
              <th style={{ textAlign: 'right', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{qtyView ? 'Unit' : 'Price'}</th>
              {qtyView && <th style={{ textAlign: 'right', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '10px var(--sp-5)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Amount</th>}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((l) => (
              <tr key={l.key}>
                <td style={{ padding: '10px var(--sp-5)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{l.code || '—'}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600, verticalAlign: 'top' }}>
                  {l.label}
                  {(() => { const r = resolveLine(l.code, l.label); return r.status === 'dormant' ? <DormantFlag alias={r.aliasLabel} /> : null })()}
                  {l.added && <span style={{ marginLeft: 8, fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 7px', borderRadius: 20, verticalAlign: 'middle' }}>NEW</span>}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', verticalAlign: 'top' }}>{l.desc || '—'}</td>
                {qtyView && <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>{qtyOf(l)}</td>}
                <td style={{ padding: qtyView ? '10px 8px' : '10px var(--sp-5)', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>{money(l.price)}</td>
                {qtyView && <td style={{ padding: '10px var(--sp-5)', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, verticalAlign: 'top' }}>{money(l.price * qtyOf(l))}</td>}
              </tr>
            ))}
            <tr>
              <td />
              <td />
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }} colSpan={qtyView ? 2 : 1}>Total</td>
              {qtyView && <td />}
              <td style={{ padding: '12px var(--sp-5)', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(lineTotal)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '0 var(--sp-5) var(--sp-5)' }}>
          {lineItems.map((l) => {
            const r = resolveLine(l.code, l.label)
            const dormant = r.status === 'dormant'
            const dTitle = dormantTitle(r.aliasLabel)
            return (
            <div
              key={l.key}
              onDragOver={(e) => { e.preventDefault(); if (dragKey != null && dragKey !== l.key) onReorder(dragKey, l.key) }}
              title={dormant ? dTitle : undefined}
              style={{ display: 'grid', gridTemplateColumns: '26px 130px 0.9fr 1.1fr 52px 96px 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', opacity: dragKey === l.key ? 0.4 : 1, background: dormant ? 'var(--warn-soft)' : undefined, borderLeft: dormant ? '3px solid var(--warn)' : '3px solid transparent', paddingLeft: 4 }}
            >
              <div
                draggable
                onDragStart={() => setDragKey(l.key)}
                onDragEnd={() => setDragKey(null)}
                title={dormant ? dTitle : 'Drag to reorder'}
                aria-label="Drag to reorder"
                style={{ cursor: 'grab', color: dormant ? 'var(--warn)' : 'var(--dim)', fontSize: 15, textAlign: 'center', userSelect: 'none', lineHeight: 1 }}
              >
                {dormant ? '!' : '⠿'}
              </div>
              <select value={l.code} onChange={(e) => onUpdateLine(l.key, { code: e.target.value })} style={regInput}>
                <option value="">—</option>
                {PCODE_OPTS.map((p) => <option key={p.code + '-' + p.label} value={p.code}>{p.code} — {p.label}</option>)}
              </select>
              <input value={l.label} onChange={(e) => onUpdateLine(l.key, { label: e.target.value })} placeholder="Item" style={regInput} />
              <input value={l.desc} onChange={(e) => onUpdateLine(l.key, { desc: e.target.value })} placeholder="Description" style={regInput} />
              <input value={String(qtyOf(l))} onChange={(e) => onUpdateLine(l.key, { qty: Math.max(1, Math.round(sf(e.target.value, 1))) })} inputMode="numeric" title="Quantity" style={{ ...regInput, textAlign: 'center' }} />
              <input value={String(l.price)} onChange={(e) => onUpdateLine(l.key, { price: sf(e.target.value) })} inputMode="decimal" style={{ ...regInput, textAlign: 'right' }} />
              <button onClick={() => onRemoveLine(l.key)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-4)', paddingTop: 'var(--sp-3)', marginTop: 'var(--sp-2)', borderTop: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontWeight: 700 }}>Total {money(lineTotal)}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
