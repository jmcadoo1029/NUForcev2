// Draft-import contract. A local, offline tool (the future "read a test plan →
// candidate line items" program) produces a JSON file in THIS shape; NUForce reads
// it entirely in the browser (nothing uploads) and opens a prefilled, UNPRICED
// draft quote the user reviews and prices. Keeping the shape here means the app and
// the local tool share one definition. Everything is optional and string-coerced —
// a partial extraction still yields a useful head start.

import { buildCatalog } from '../data/catalog'

export interface DraftLineItem {
  code?: string // NUForce product code, e.g. "51" (EMI). Optional — label alone is fine.
  label: string // Short test name, e.g. "EMI", "Salt Fog"
  desc?: string // Free text, e.g. the standard/method: "MIL-STD-461G RE102"
  price?: number // Usually 0 — the user prices it in NUForce
  qty?: number // Quantity (defaults to 1). The reader sets this for grouped multi-unit lines.
}

export interface DraftTestItem {
  item?: string
  qty?: string
  model?: string
  drawing?: string
  dimL?: string
  dimW?: string
  dimH?: string
  wt?: string
  volt?: string
  pwrType?: string // "AC" | "DC"
  phase?: string
  hz?: string
  amps?: string
  mounting?: string
  pressureFlow?: string
  loads?: string
  // Regulatory block
  gsi?: string
  witness?: string
  docRestriction?: string
  dpas?: string
  specs?: string // → the Specifications text field
  notes?: string // → the Notes text field
}

export interface DraftSetup {
  holes?: string
  cables?: string
  fabHours?: string
  techRate?: string
  drillTap?: boolean
}

// An internal Budget line (raw cost — the Budget list applies its own markup). The
// reader emits these for the noise compressor and EMI amp/power-source rentals.
export interface DraftBudgetRow {
  desc: string
  qty?: string
  unitCost: string
}

// A per-unit breakdown for a multi-unit quote — seeds the calculator's per-unit setup
// table (name / mounting holes / weight), so the estimator confirms instead of retyping.
export interface DraftUnit {
  name?: string
  holes?: string
  weight?: string
}

export interface DraftImport {
  account?: string // Account/customer name (links later at close-won)
  rfqDate?: string // Date of the customer's original RFQ email — used to build the RFQ field
  quoteNumber?: string // Quote number (e.g. "26-123"), from the quote-folder name → qi.opp
  relatedOpps?: string // Sibling quote numbers from a multi-quote batch → qi.relatedOpps
  setup?: DraftSetup // Setup inputs (holes/cables/fab) for pricing
  budget?: DraftBudgetRow[] // Internal Budget add-ons (noise compressor, EMI rentals)
  testItem?: DraftTestItem
  lineItems?: DraftLineItem[]
  units?: DraftUnit[] // Per-unit breakdown (name/holes/weight) for the calculator's per-unit setup table
  notes?: string // Falls back into Notes if testItem.notes is absent
}

const TI_STR_KEYS: (keyof DraftTestItem)[] = [
  'item', 'qty', 'model', 'drawing', 'dimL', 'dimW', 'dimH', 'wt',
  'volt', 'pwrType', 'phase', 'hz', 'amps', 'mounting', 'pressureFlow', 'loads',
  'gsi', 'witness', 'docRestriction', 'dpas', 'specs', 'notes',
]

/** Parse + validate a draft-import JSON string. Coerces every field to the form's
 *  shape (strings for inputs, number for price) and rejects anything unusable. */
export function parseDraftImport(text: string): { ok: true; draft: DraftImport } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: 'That file isn’t valid JSON: ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Expected a JSON object at the top level.' }
  const r = raw as Record<string, unknown>
  const draft: DraftImport = {}
  if (r.account != null) draft.account = String(r.account)
  if (r.rfqDate != null) draft.rfqDate = String(r.rfqDate)
  if (r.quoteNumber != null) draft.quoteNumber = String(r.quoteNumber)
  if (r.relatedOpps != null) draft.relatedOpps = String(r.relatedOpps)
  if (r.notes != null) draft.notes = String(r.notes)

  if (r.testItem && typeof r.testItem === 'object' && !Array.isArray(r.testItem)) {
    const t = r.testItem as Record<string, unknown>
    const out: DraftTestItem = {}
    for (const k of TI_STR_KEYS) if (t[k] != null) (out as Record<string, string>)[k] = String(t[k])
    if (Object.keys(out).length) draft.testItem = out
  }

  if (r.setup && typeof r.setup === 'object' && !Array.isArray(r.setup)) {
    const s = r.setup as Record<string, unknown>
    const out: DraftSetup = {}
    if (s.holes != null) out.holes = String(s.holes)
    if (s.cables != null) out.cables = String(s.cables)
    if (s.fabHours != null) out.fabHours = String(s.fabHours)
    if (s.techRate != null) out.techRate = String(s.techRate)
    if (s.drillTap != null) out.drillTap = s.drillTap === true || String(s.drillTap).toLowerCase() === 'true'
    if (Object.keys(out).length) draft.setup = out
  }

  if (Array.isArray(r.budget)) {
    const rows = (r.budget as unknown[])
      .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object' && !Array.isArray(b))
      .map((b) => ({ desc: String(b.desc ?? ''), qty: b.qty != null ? String(b.qty) : '1', unitCost: String(b.unitCost ?? b.unit_cost ?? '0') }))
      .filter((b) => b.desc.trim() !== '')
    if (rows.length) draft.budget = rows
  }

  if (Array.isArray(r.units)) {
    const rows = (r.units as unknown[])
      .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object' && !Array.isArray(u))
      .map((u) => ({
        name: u.name != null ? String(u.name) : '',
        holes: u.holes != null ? String(u.holes) : '',
        weight: u.weight != null ? String(u.weight) : (u.wt != null ? String(u.wt) : ''),
      }))
      .filter((u) => u.name || u.holes || u.weight)
    if (rows.length) draft.units = rows
  }

  if (Array.isArray(r.lineItems)) {
    draft.lineItems = (r.lineItems as unknown[])
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && !Array.isArray(l))
      .map((l) => ({
        code: l.code != null ? String(l.code) : undefined,
        label: String(l.label ?? l.name ?? ''),
        desc: l.desc != null ? String(l.desc) : l.description != null ? String(l.description) : undefined,
        price: l.price != null && isFinite(Number(l.price)) ? Number(l.price) : 0,
        qty: l.qty != null && isFinite(Number(l.qty)) ? Math.max(1, Math.round(Number(l.qty))) : 1,
      }))
      .filter((l) => (l.label || l.code))
  }

  if (!draft.testItem && !(draft.lineItems && draft.lineItems.length)) {
    return { ok: false, error: 'Nothing to import — the file has no test item and no line items.' }
  }
  return { ok: true, draft }
}

// A setup line ("Vibration – Setup") — priced from holes/fab in NUForce, so it
// comes in at $0 and the user prices it once holes/cables are confirmed.
const isSetupLabel = (label: string) => /[–-]\s*setup\s*$/i.test(label)
// EMI / Power Quality / DC Magnetics — the SETUP / TESTING / TEARDOWN lines (code 51)
// are calculator-driven (shift rates), so those come in at $0. Their Procedure (code
// 44) and Report (code 43) lines are NOT calculator-driven — they carry a standard
// catalog price, so they must NOT be zeroed. Match only the setup/testing/teardown
// family lines here; "EMI Procedure"/"EMI Report"/"PQ Report"/… fall through to pricing.
const isEmiFamilyLabel = (label: string) => /^\s*(emi|pq|dc\s*mag)\b.*[–—-]\s*(setup|testing|teardown)\s*$/i.test(label)

/**
 * Assisted pricing for an imported draft. Fills in each line's price from the
 * NUForce catalog (which applies manager overrides), so the user opens a mostly-
 * priced quote instead of an all-zero one. Rules agreed with the estimators:
 *   - Setup lines            → $0  (priced from holes/cables/fab in NUForce)
 *   - EMI/PQ/DC-Mag setup/testing/teardown (code 51) → $0  (calculator-driven)
 *   - everything else        → its standard catalog price (regular testing lines,
 *                              Test Procedure / Report / Tear Down, AND the EMI/PQ/
 *                              DC-Mag Procedure (44) / Report (43) lines)
 *   - shock testing is weight-based — the catalog derives it from `weightLbs`.
 * Any line whose label doesn't resolve to a catalog entry stays $0.
 */
export function priceDraftLines(lines: DraftLineItem[], weightLbs: number): DraftLineItem[] {
  const catalog = buildCatalog({ ti: { wt: weightLbs } })
  const byLabel = new Map<string, number>()
  for (const p of catalog) {
    const k = p.label.toLowerCase()
    if (!byLabel.has(k)) byLabel.set(k, p.price)
  }
  return lines.map((l) => {
    const label = String(l.label || '')
    let price = 0
    if (!isSetupLabel(label) && !isEmiFamilyLabel(label)) {
      const base = byLabel.get(label.toLowerCase())
      if (base != null && isFinite(base)) price = Math.round(base)
    }
    return { ...l, price }
  })
}

// ── Ambiguous test-type resolution ──────────────────────────────────────────
// The reader can only see the words on the page, so "shock" and "vibration" arrive
// ambiguous: shock is 3 tests (Medium Weight 91 / Lightweight 92 / generic 52) and
// plain vibration is really Vibration (94), HF Vibration (52), or — for Type II —
// Structureborne Noise (12). We resolve them at import, where the unit weights and a
// reviewing human both exist, rather than letting the reader guess a code.
//
// Shock class is a weight question, so it's derived, not asked: with per-unit weights
// we split into Medium/Lightweight by the 250 lb line the calculator already uses;
// with one overall weight we pick a class; with no weight we ask. Vibration isn't
// weight-based — Type I → 94, Type II → Structureborne Noise (12), plain → default 94.

export const SHOCK_WEIGHT_THRESHOLD_LBS = 250

const numOf = (s: unknown): number => { const n = Number(String(s ?? '').replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0 }

/** Numeric per-unit weights present in the draft (only units that actually have one). */
export function draftUnitWeights(draft: DraftImport): number[] {
  return (draft.units || []).map((u) => numOf(u.weight)).filter((w) => w > 0)
}

// Split a label into its base and the trailing " – Setup/Testing/Teardown" phase, so a
// rename keeps the phase ("Shock – Setup" → "Medium Weight Shock – Setup").
// Not anchored to end, so a trailing marker like "(Type II)" after the phase word
// doesn't hide it ("Vibration – Testing (Type II)" still yields " – Testing").
const PHASE_RE = /[–—-]\s*(setup|testing|teardown)\b/i
function splitPhase(label: string): { suffix: string } {
  const m = label.match(PHASE_RE)
  if (!m) return { suffix: '' }
  const word = m[1].toLowerCase()
  return { suffix: ' – ' + word.charAt(0).toUpperCase() + word.slice(1) }
}

type AmbKind = 'shock' | 'vibration'
// Classify from the LABEL only — the test type lives there ("Shock", "Vibration").
// The description is free text ("Pre-shock hydrostatic test", "post-shock…") and would
// throw false positives, so it's deliberately excluded here.
function classifyLine(label: string, _desc?: string): AmbKind | null {
  const t = label.toLowerCase()
  if (/instrumentation|contact monitoring/.test(t)) return null // code 33 — not a test type
  if (/hydrostatic/.test(t)) return null // code 95 — a "pre-shock/post-shock" hydro is NOT a shock line
  if (/\bshock\b/.test(t) && !/medium\s*weight|light\s*weight|lightweight|\bmws\b|\blws\b/.test(t)) return 'shock'
  if (/\bvibration\b|\bvibe\b/.test(t) && !/hf\s*vibration|high\s*frequency/.test(t)) return 'vibration'
  return null
}
function vibType(label: string, desc?: string): 'I' | 'II' | '' {
  const t = `${label} ${desc || ''}`.toLowerCase()
  if (/type\s*(ii|2)\b/.test(t)) return 'II'
  if (/type\s*(i|1)\b/.test(t)) return 'I'
  return ''
}

export interface TypeAmbiguity {
  index: number // position in draft.lineItems
  kind: AmbKind
  label: string // the original line label, for display
  options: { value: string; label: string }[]
  defaultValue: string // '' = the user must choose (shock with no weight anywhere)
  note: string
}

/** Find the shock/vibration lines that need resolving, with a suggested default each. */
export function analyzeTestTypes(draft: DraftImport): { ambiguities: TypeAmbiguity[]; unitWeights: number[]; singleWeight: number } {
  const unitWeights = draftUnitWeights(draft)
  const singleWeight = numOf(draft.testItem?.wt)
  const lines = draft.lineItems || []
  const ambiguities: TypeAmbiguity[] = []
  lines.forEach((l, index) => {
    const kind = classifyLine(l.label, l.desc)
    if (!kind) return
    if (kind === 'shock') {
      if (unitWeights.length) {
        const heavy = unitWeights.filter((w) => w > SHOCK_WEIGHT_THRESHOLD_LBS).length
        const light = unitWeights.length - heavy
        ambiguities.push({
          index, kind, label: l.label,
          options: [
            { value: 'auto', label: `Auto by weight — ${heavy} Medium, ${light} Lightweight` },
            { value: '91', label: 'All Medium Weight (91)' },
            { value: '92', label: 'All Lightweight (92)' },
            { value: '52', label: 'Generic Shock (52)' },
          ],
          defaultValue: 'auto',
          note: `${unitWeights.length} units with weights → ${heavy} over ${SHOCK_WEIGHT_THRESHOLD_LBS} lb (Medium), ${light} at/under (Lightweight).`,
        })
      } else if (singleWeight > 0) {
        const mws = singleWeight > SHOCK_WEIGHT_THRESHOLD_LBS
        ambiguities.push({
          index, kind, label: l.label,
          options: [
            { value: 'auto', label: `Auto by weight — ${mws ? 'Medium Weight' : 'Lightweight'}` },
            { value: '91', label: 'Medium Weight (91)' },
            { value: '92', label: 'Lightweight (92)' },
            { value: '52', label: 'Generic Shock (52)' },
          ],
          defaultValue: 'auto',
          note: `Item weight ${singleWeight} lb → ${mws ? 'Medium Weight' : 'Lightweight'} suggested.`,
        })
      } else {
        ambiguities.push({
          index, kind, label: l.label,
          options: [
            { value: '91', label: 'Medium Weight (91)' },
            { value: '92', label: 'Lightweight (92)' },
            { value: '52', label: 'Generic Shock (52)' },
          ],
          defaultValue: '',
          note: 'No weight found in the file — choose a shock class.',
        })
      }
    } else {
      const vt = vibType(l.label, l.desc)
      ambiguities.push({
        index, kind, label: l.label,
        options: [
          { value: '94', label: 'Vibration (94)' },
          { value: '12', label: 'Structureborne Noise (12)' },
          { value: '52', label: 'HF Vibration (52)' },
        ],
        defaultValue: vt === 'II' ? '12' : '94',
        note: vt === 'II' ? 'Detected Type II → Structureborne Noise.' : vt === 'I' ? 'Detected Type I → Vibration.' : 'Plain vibration → defaulting to Vibration (94).',
      })
    }
  })
  return { ambiguities, unitWeights, singleWeight }
}

const qtyOf = (l: DraftLineItem) => Math.max(1, Math.round(Number(l.qty) || 1))

// Turn one ambiguous line into its concrete catalog line(s) given the chosen value.
function resolveLine(l: DraftLineItem, kind: AmbKind, choice: string, unitWeights: number[], singleWeight: number): DraftLineItem[] {
  const { suffix } = splitPhase(l.label)
  const N = unitWeights.length
  if (kind === 'shock') {
    if (choice === 'auto') {
      if (N) {
        const heavy = unitWeights.filter((w) => w > SHOCK_WEIGHT_THRESHOLD_LBS).length
        const light = N - heavy
        const out: DraftLineItem[] = []
        if (heavy) out.push({ ...l, code: '91', label: 'Medium Weight Shock' + suffix, qty: heavy })
        if (light) out.push({ ...l, code: '92', label: 'Lightweight Shock' + suffix, qty: light })
        return out.length ? out : [{ ...l, code: '52', label: 'Shock' + suffix }]
      }
      const mws = singleWeight > SHOCK_WEIGHT_THRESHOLD_LBS
      return [{ ...l, code: mws ? '91' : '92', label: (mws ? 'Medium Weight Shock' : 'Lightweight Shock') + suffix }]
    }
    if (choice === '91') return [{ ...l, code: '91', label: 'Medium Weight Shock' + suffix, qty: N || qtyOf(l) }]
    if (choice === '92') return [{ ...l, code: '92', label: 'Lightweight Shock' + suffix, qty: N || qtyOf(l) }]
    return [{ ...l, code: '52', label: 'Shock' + suffix, qty: N || qtyOf(l) }]
  }
  // vibration
  if (choice === '12') return [{ ...l, code: '12', label: 'Structureborne Noise' + suffix }]
  if (choice === '52') return [{ ...l, code: '52', label: 'HF Vibration' + suffix }]
  return [{ ...l, code: '94', label: 'Vibration' + suffix }]
}

/** Rewrite the draft's line items, substituting each ambiguous shock/vibration line
 *  with its resolved catalog line(s). `choices` is keyed by the line's index; a missing
 *  choice falls back to the ambiguity's default. Non-ambiguous lines pass through. */
export function applyTypeChoices(draft: DraftImport, choices: Record<number, string>): DraftImport {
  const { ambiguities, unitWeights, singleWeight } = analyzeTestTypes(draft)
  if (!ambiguities.length) return draft
  const byIndex = new Map(ambiguities.map((a) => [a.index, a]))
  const lines = draft.lineItems || []
  const out: DraftLineItem[] = []
  lines.forEach((l, i) => {
    const amb = byIndex.get(i)
    if (!amb) { out.push(l); return }
    const choice = choices[i] || amb.defaultValue
    if (!choice) { out.push(l); return } // unresolved (no-weight shock) — leave as-is; UI blocks this
    out.push(...resolveLine(l, amb.kind, choice, unitWeights, singleWeight))
  })
  return { ...draft, lineItems: out }
}

/** A minimal example of the format, shown in the import dialog and usable as a
 *  template for the local extraction tool. */
export const EXAMPLE_DRAFT = `{
  "account": "Acme Defense Corp",
  "testItem": {
    "item": "Power Supply Unit",
    "qty": "2",
    "model": "PSU-4200",
    "drawing": "DWG-88123 Rev C",
    "dimL": "12.5", "dimW": "8.0", "dimH": "4.25",
    "wt": "18",
    "volt": "115", "pwrType": "AC", "phase": "1", "hz": "60", "amps": "6",
    "specs": "Unit shall be tested per the referenced standards below.",
    "notes": "Customer will provide fixturing."
  },
  "lineItems": [
    { "code": "51", "label": "EMI",       "desc": "MIL-STD-461G (RE102, CE102, CS114)", "price": 0 },
    { "code": "52", "label": "Shock",     "desc": "MIL-STD-810H Method 516.8",          "price": 0 },
    { "code": "55", "label": "Salt Fog",  "desc": "ASTM B117, 48 hours",                "price": 0 }
  ]
}`
