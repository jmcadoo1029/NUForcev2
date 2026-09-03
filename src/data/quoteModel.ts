// Quote model + legacy-aware line-item adapter.
//
// V2 reads line items from BOTH sources so old quotes display correctly:
//   - pickerLines  — the V2 source of truth (label/desc/code/price)
//   - summary.lines — legacy Advanced-Mode lines (label/val/code), with
//                     per-index lineOverrides {price, desc, deleted} honored
// New quotes will write picker-only, but this adapter lets us view/print/diff
// every existing quote. Ported from the classic collectQuoteLineItems logic.

import { sf } from '../lib/format'

export interface DisplayLine {
  label: string // item name, e.g. "Vibration - Setup"
  desc: string // longer description, shown in its own column
  code: string | null
  price: number // unit price
  qty: number // quantity (defaults to 1); line amount = price × qty
}

interface PickerLine {
  label?: string
  desc?: string
  code?: string
  price?: string | number
  qty?: string | number
}
interface SummaryLine {
  label?: string
  val?: string | number
  code?: string
}
interface LineOverride {
  price?: string | number
  desc?: string
  deleted?: boolean
}

const s = (v?: string | number): string => (v == null ? '' : String(v).trim())

export interface QuoteData {
  pickerLines?: PickerLine[]
  summary?: { lines?: SummaryLine[] }
  lineOverrides?: Record<number, LineOverride>
  qi?: Record<string, unknown>
  [k: string]: unknown
}

/** All display line items for a quote, from picker + legacy summary lines. */
export function lineItemsFromData(data: QuoteData | null | undefined): DisplayLine[] {
  const items: DisplayLine[] = []
  if (!data) return items

  ;(data.pickerLines || []).forEach((l) => {
    if (!l.label && !l.desc && !l.price) return
    items.push({
      label: s(l.label) || 'Line Item',
      desc: s(l.desc),
      code: l.code || null,
      price: sf(l.price),
      qty: Math.max(1, Math.round(sf(l.qty, 1))), // default 1; whole-number quantity
    })
  })

  const overrides = data.lineOverrides || {}
  ;(data.summary?.lines || []).forEach((l, i) => {
    const ov = overrides[i] || {}
    if (ov.deleted) return
    if (!l.label && !l.val) return
    items.push({
      label: s(l.label) || 'Line Item',
      desc: s(ov.desc),
      code: l.code || null,
      price: ov.price !== undefined ? sf(ov.price) : sf(l.val),
      qty: 1, // legacy summary lines have no quantity
    })
  })

  return items
}
