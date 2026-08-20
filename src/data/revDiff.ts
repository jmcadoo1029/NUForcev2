// Revision diff — compares two quote `data` snapshots (a revision vs. the one
// before it) and reports what changed: line items added / removed / re-priced,
// scalar field changes, and word-level diffs for the long free-text fields
// (Specifications, Notes, Loads). Pure + read-only; no network here.

import { lineItemsFromData, type QuoteData, type DisplayLine } from './quoteModel'

const s = (v: unknown): string => (v == null ? '' : String(v).trim())

// ── Word-level diff (LCS over whitespace-preserving tokens) ──────────────────
export type DiffTok = { t: 'same' | 'add' | 'del'; s: string }

export function wordDiff(before: string, after: string): DiffTok[] {
  const a = (before || '').split(/(\s+)/)
  const b = (after || '').split(/(\s+)/)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffTok[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'same', s: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', s: a[i] }); i++ }
    else { out.push({ t: 'add', s: b[j] }); j++ }
  }
  while (i < n) { out.push({ t: 'del', s: a[i] }); i++ }
  while (j < m) { out.push({ t: 'add', s: b[j] }); j++ }
  return out
}

// ── Field specs ──────────────────────────────────────────────────────────────
interface FieldSpec { key: string; label: string; long?: boolean }

const QI_FIELDS: FieldSpec[] = [
  { key: 'account', label: 'Account' },
  { key: 'type', label: 'Business type' },
  { key: 'rfq', label: 'RFQ' },
  { key: 'date', label: 'Date' },
  { key: 'rev', label: 'Revision' },
  { key: 'revDate', label: 'Revision date' },
  { key: 'prepby', label: 'Prepared by' },
  { key: 'relatedOpps', label: 'Related opportunities' },
  { key: 'billTo', label: 'Address' },
  { key: 'billToCity', label: 'City / State / Zip' },
  { key: 'contact', label: 'Contact' },
  { key: 'email', label: 'Email' },
  { key: 'stage', label: 'Stage' },
]

const TI_FIELDS: FieldSpec[] = [
  { key: 'item', label: 'Item' },
  { key: 'qty', label: 'Qty' },
  { key: 'model', label: 'Model No.' },
  { key: 'drawing', label: 'Drawing No.' },
  { key: 'wt', label: 'Weight' },
  { key: 'volt', label: 'Voltage' },
  { key: 'pwrType', label: 'Power type' },
  { key: 'phase', label: 'Phase' },
  { key: 'hz', label: 'Hz' },
  { key: 'inrush', label: 'Inrush' },
  { key: 'amps', label: 'Op. Amps' },
  { key: 'mounting', label: 'Mounting' },
  { key: 'pressureFlow', label: 'Pressure / Flow' },
  { key: 'gsi', label: 'GSI' },
  { key: 'witness', label: 'Cust. witness' },
  { key: 'docRestriction', label: 'Doc restriction' },
  { key: 'dpas', label: 'DPAS' },
  { key: 'loads', label: 'Loads', long: true },
  { key: 'tiSpecs', label: 'Specifications', long: true },
  { key: 'tiNotes', label: 'Notes', long: true },
]

export interface FieldChange { label: string; before: string; after: string; long: boolean }

export interface LineChange {
  added: DisplayLine[]
  removed: DisplayLine[]
  changed: { before: DisplayLine; after: DisplayLine }[]
}

export interface RevDiff {
  fields: FieldChange[]
  lines: LineChange
  totalBefore: number
  totalAfter: number
  empty: boolean
}

const lineKey = (l: DisplayLine): string => `${s(l.code).toLowerCase()}|${s(l.label).toLowerCase()}`

function diffLines(before: DisplayLine[], after: DisplayLine[]): LineChange {
  const oldMap = new Map<string, DisplayLine[]>()
  before.forEach((l) => { const k = lineKey(l); (oldMap.get(k) || oldMap.set(k, []).get(k)!).push(l) })
  const newMap = new Map<string, DisplayLine[]>()
  after.forEach((l) => { const k = lineKey(l); (newMap.get(k) || newMap.set(k, []).get(k)!).push(l) })

  const added: DisplayLine[] = []
  const removed: DisplayLine[] = []
  const changed: { before: DisplayLine; after: DisplayLine }[] = []
  const keys = new Set([...oldMap.keys(), ...newMap.keys()])
  keys.forEach((k) => {
    const olds = oldMap.get(k) || []
    const news = newMap.get(k) || []
    const paired = Math.min(olds.length, news.length)
    for (let i = 0; i < paired; i++) {
      const b = olds[i]
      const a = news[i]
      if (b.price !== a.price || s(b.desc) !== s(a.desc)) changed.push({ before: b, after: a })
    }
    for (let i = paired; i < olds.length; i++) removed.push(olds[i])
    for (let i = paired; i < news.length; i++) added.push(news[i])
  })
  return { added, removed, changed }
}

/** Diff a revision's data (`after`) against the prior revision's data (`before`). */
export function revDiff(before: QuoteData | null | undefined, after: QuoteData | null | undefined): RevDiff {
  const bQi = (before?.qi || {}) as Record<string, unknown>
  const aQi = (after?.qi || {}) as Record<string, unknown>
  const bTi = ((before as any)?.ti || {}) as Record<string, unknown>
  const aTi = ((after as any)?.ti || {}) as Record<string, unknown>

  const fields: FieldChange[] = []
  const pushIf = (label: string, bv: string, av: string, long = false) => {
    if (s(bv) !== s(av)) fields.push({ label, before: s(bv), after: s(av), long })
  }

  QI_FIELDS.forEach((f) => pushIf(f.label, String(bQi[f.key] ?? ''), String(aQi[f.key] ?? ''), f.long))
  // Derived dimensions (L × W × H).
  const dims = (t: Record<string, unknown>) => {
    const l = s(t.dimL); const w = s(t.dimW); const h = s(t.dimH)
    return l || w || h ? `${l || '?'} × ${w || '?'} × ${h || '?'} in` : ''
  }
  pushIf('Dimensions', dims(bTi), dims(aTi))
  TI_FIELDS.forEach((f) => pushIf(f.label, String(bTi[f.key] ?? ''), String(aTi[f.key] ?? ''), f.long))

  const beforeLines = lineItemsFromData(before)
  const afterLines = lineItemsFromData(after)
  const lines = diffLines(beforeLines, afterLines)
  const sum = (arr: DisplayLine[]) => arr.reduce((a, l) => a + (l.price || 0), 0)

  const empty = fields.length === 0 && lines.added.length === 0 && lines.removed.length === 0 && lines.changed.length === 0
  return { fields, lines, totalBefore: sum(beforeLines), totalAfter: sum(afterLines), empty }
}
