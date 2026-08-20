import { useState, type CSSProperties } from 'react'
import { PCODE_OPTS, codeLabel } from '../../data/constants'
import { buildCatalog, sortCatalog, isActive, TH_PRICES, type CatalogCtx } from '../../data/catalog'
import { sf, money } from '../../lib/format'

// The Product Picker — a checkbox catalog of predefined line items (Setup /
// Testing per test type), ported from Classic. Pick as many as you like, set a
// qty on each, and add them all at once. Calculator-driven items (EMI/PQ/DC
// Magnetics, Subcontracting) take a typed price. Below the catalog is the
// repeatable custom-line slot (multiple lines, each with its own code).

export interface PickerLine {
  code: string
  label: string
  desc: string
  price: number
}

interface CustomRow {
  key: number
  code: string
  label: string
  desc: string
  price: string
}

let seq = 1
const newCustom = (): CustomRow => ({ key: seq++, code: '94', label: '', desc: '', price: '' })

export function ProductPicker({
  onAdd,
  onClose,
  initialCustom,
  initialSelected,
  ...ctx
}: {
  onAdd: (lines: PickerLine[]) => void
  onClose: () => void
  initialCustom?: { code: string; label: string; desc?: string; price: number }[]
  // Pre-check these catalog items with a price override (e.g. handed from the
  // Pricing Calculator so it lands on the real line item, not a custom line).
  initialSelected?: { key: string; price: number }[]
  } & CatalogCtx) {
  const [selected, setSelected] = useState<Record<string, number>>(() => Object.fromEntries((initialSelected || []).map((s) => [s.key, 1]))) // key -> qty
  // Price overrides — used both for calculator-driven catalog items and for the
  // custom-priced (EMI/PQ/DCM/Subcontracting) items.
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries((initialSelected || []).map((s) => [s.key, String(s.price)])))
  // Optional per-catalog-item descriptions, carried into the line item.
  const [descs, setDescs] = useState<Record<string, string>>({})
  const [sortMode, setSortMode] = useState<'code' | 'name'>('name')
  const [showDormant, setShowDormant] = useState(false)
  const [thDur, setThDur] = useState('0 to 1 Day')
  // Pre-filled custom rows (handed over so the quoter can pick the code before
  // adding). Plain snapshots — no live link back to wherever they came from.
  const [customRows, setCustomRows] = useState<CustomRow[]>(() => (initialCustom || []).map((l) => ({ key: seq++, code: l.code, label: l.label, desc: l.desc || '', price: String(l.price ?? '') })))

  const catalog = buildCatalog({ ...ctx, thDur })
  const byKey = new Map(catalog.map((p) => [p.key, p]))
  const sorted = sortCatalog(catalog, sortMode)
  // Only active items are selectable for a new quote; dormant (retired) items are
  // listed separately, greyed and non-selectable, so they're discoverable but
  // can't be added.
  const activeProducts = sorted.filter(isActive)
  const dormantProducts = sorted.filter((p) => !isActive(p))
  const priceOf = (key: string) => {
    const p = byKey.get(key)
    if (!p) return 0
    // A price override (calculator-supplied or custom-priced) wins over the catalog default.
    if (prices[key] !== undefined && prices[key] !== '') return sf(prices[key])
    return p.custom ? sf(prices[key]) : p.price
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      if (prev[key]) {
        const n = { ...prev }
        delete n[key]
        return n
      }
      return { ...prev, [key]: 1 }
    })
  const setQty = (key: string, val: string) => setSelected((prev) => ({ ...prev, [key]: Math.max(1, parseInt(val) || 1) }))

  const validCustom = customRows.filter((r) => r.label.trim() || r.desc.trim() || sf(r.price))
  const selectedTotal = Object.entries(selected).reduce((a, [key, qty]) => a + priceOf(key) * qty, 0)
  const customTotal = validCustom.reduce((a, r) => a + sf(r.price), 0)
  const total = selectedTotal + customTotal
  const selCount = Object.keys(selected).length + validCustom.length
  const thShown = Object.keys(selected).some((k) => k.startsWith('th_') || k.startsWith('to_') || k.startsWith('hu_'))

  const handleAdd = () => {
    const lines: PickerLine[] = []
    Object.entries(selected).forEach(([key, qty]) => {
      const p = byKey.get(key)
      if (!p) return
      for (let i = 0; i < qty; i++) lines.push({ label: p.label, code: p.code, price: priceOf(key), desc: (descs[key] || '').trim() })
    })
    validCustom.forEach((r) => lines.push({ code: r.code, label: r.label.trim() || codeLabel(r.code) || 'Custom item', desc: r.desc.trim(), price: sf(r.price) }))
    if (lines.length) onAdd(lines)
    onClose()
  }

  const cInput: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '6px 9px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

  const sortBtn = (key: 'code' | 'name', label: string) => (
    <button
      onClick={() => setSortMode(key)}
      style={{ background: sortMode === key ? 'var(--accent-soft)' : '#fff', color: sortMode === key ? 'var(--accent)' : 'var(--muted)', border: 'none', padding: '5px 13px', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer', letterSpacing: '.03em' }}
    >
      {label}
    </button>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', overflowY: 'auto', padding: '24px 0' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 12, width: 'min(720px, 96vw)', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card)', borderBottom: '1px solid var(--border)', borderRadius: '12px 12px 0 0' }}>
          <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 'var(--fs-md)' }}>Add line items</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--dim)', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em' }}>SORT</span>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-strong)' }}>
                {sortBtn('name', 'NAME')}
                {sortBtn('code', 'CODE')}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 24, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* T&H duration selector */}
        {thShown && (
          <div style={{ padding: '10px 20px', background: 'var(--bg-subtle, #f8f9fb)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', fontWeight: 600 }}>T&amp;H Duration</span>
            <select value={thDur} onChange={(e) => setThDur(e.target.value)} style={{ ...cInput, width: 'auto' }}>
              {Object.entries(TH_PRICES).map(([k, v]) => (
                <option key={k} value={k}>{k} — {money(v)}</option>
              ))}
            </select>
          </div>
        )}

        {initialSelected && initialSelected.length > 0 && (
          <div style={{ padding: '9px 20px', background: 'var(--accent-soft)', borderBottom: '1px solid var(--border)', fontSize: 'var(--fs-sm)', color: 'var(--accent)' }}>
            From the Pricing Calculator — the matching line items are checked with the suggested price. Adjust or add more, then add to the quote.
          </div>
        )}

        {/* Catalog */}
        <div style={{ padding: '12px 20px', maxHeight: '56vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeProducts.map((prod) => {
              const isSel = !!selected[prod.key]
              return (
                <div
                  key={prod.key}
                  onClick={() => toggle(prod.key)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '9px 11px', borderRadius: 8, background: isSel ? 'var(--accent-soft)' : 'var(--bg-subtle, #f8f9fb)', border: '1px solid ' + (isSel ? 'var(--accent)' : 'var(--border)'), cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid ' + (isSel ? 'var(--accent)' : 'var(--border-strong)'), background: isSel ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isSel && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', minWidth: 26, fontVariantNumeric: 'tabular-nums' }}>{prod.code}</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-base)', color: 'var(--text)', fontWeight: isSel ? 600 : 400 }}>{prod.label}</span>
                    {!isSel && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{prod.custom ? 'TBD' : money(prod.price)}</span>}
                    {isSel && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        {(prod.custom || prices[prod.key] !== undefined) && (
                          <>
                            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>$</span>
                            <input value={prices[prod.key] || ''} onChange={(e) => setPrices((p) => ({ ...p, [prod.key]: e.target.value }))} placeholder="0" inputMode="decimal" style={{ ...cInput, width: 78, textAlign: 'right' }} />
                          </>
                        )}
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>qty</span>
                        <input type="number" min="1" max="99" value={selected[prod.key]} onChange={(e) => setQty(prod.key, e.target.value)} style={{ ...cInput, width: 52, textAlign: 'center' }} />
                      </div>
                    )}
                  </div>
                  {isSel && (
                    <input value={descs[prod.key] || ''} onChange={(e) => setDescs((d) => ({ ...d, [prod.key]: e.target.value }))} onClick={(e) => e.stopPropagation()} placeholder="Description (optional) — shows in the line item" style={{ ...cInput, marginLeft: 28 }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Retired (dormant) items — collapsed by default, shown for reference, not selectable */}
          {dormantProducts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowDormant((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                <span style={{ fontSize: 11 }}>{showDormant ? '▾' : '▸'}</span>
                Retired — not for new quotes ({dormantProducts.length})
              </button>
              {showDormant && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {dormantProducts.map((prod) => (
                  <div key={prod.key} title="Retired product — kept for historical quotes; not selectable for new ones." style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 8, background: 'var(--bg-subtle, #f8f9fb)', border: '1px dashed var(--border)', opacity: 0.75, cursor: 'not-allowed' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--warn)', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>!</span>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', minWidth: 26, fontVariantNumeric: 'tabular-nums' }}>{prod.code}</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-base)', color: 'var(--muted)' }}>{prod.label}</span>
                    <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Retired</span>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* Repeatable custom lines */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--border-strong)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: customRows.length ? 8 : 0 }}>
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>Custom lines{initialCustom && initialCustom.length ? ' · from calculator' : ''}</span>
              <button onClick={() => setCustomRows((r) => [...r, newCustom()])} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer' }}>+ Add custom line</button>
            </div>
            {initialCustom && initialCustom.length > 0 && (
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 8 }}>Prefilled from the Pricing Calculator — pick the code for each line, then add.</div>
            )}
            {customRows.map((r) => (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '130px 0.8fr 1.1fr 84px 26px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <select value={r.code} onChange={(e) => setCustomRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, code: e.target.value } : x)))} style={cInput}>
                  {PCODE_OPTS.map((p) => (
                    <option key={p.code + '-' + p.label} value={p.code}>{p.code} — {p.label}</option>
                  ))}
                </select>
                <input value={r.label} onChange={(e) => setCustomRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))} placeholder="Item" style={cInput} />
                <input value={r.desc} onChange={(e) => setCustomRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, desc: e.target.value } : x)))} placeholder="Description" style={cInput} />
                <input value={r.price} onChange={(e) => setCustomRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, price: e.target.value } : x)))} placeholder="0" inputMode="decimal" style={{ ...cInput, textAlign: 'right' }} />
                <button onClick={() => setCustomRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '13px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-subtle, #f8f9fb)', borderRadius: '0 0 12px 12px' }}>
          <span style={{ fontSize: 'var(--fs-base)', color: 'var(--muted)' }}>
            {selCount} item{selCount !== 1 ? 's' : ''} selected{total > 0 ? ' · ' : ''}
            {total > 0 && <b style={{ color: 'var(--text)' }}>{money(total)}</b>}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ fontFamily: 'inherit', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 18px', fontSize: 'var(--fs-base)', cursor: 'pointer', color: 'var(--muted)' }}>Cancel</button>
            <button onClick={handleAdd} disabled={selCount === 0} style={{ fontFamily: 'inherit', background: selCount === 0 ? 'var(--border)' : 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 22px', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: selCount === 0 ? 'default' : 'pointer', color: selCount === 0 ? 'var(--dim)' : '#fff' }}>
              Add {selCount > 0 ? selCount + ' ' : ''}{selCount === 1 ? 'Item' : 'Items'} to Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
