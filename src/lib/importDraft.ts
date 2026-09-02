// Draft-import contract. A local, offline tool (the future "read a test plan →
// candidate line items" program) produces a JSON file in THIS shape; NUForce reads
// it entirely in the browser (nothing uploads) and opens a prefilled, UNPRICED
// draft quote the user reviews and prices. Keeping the shape here means the app and
// the local tool share one definition. Everything is optional and string-coerced —
// a partial extraction still yields a useful head start.

export interface DraftLineItem {
  code?: string // NUForce product code, e.g. "51" (EMI). Optional — label alone is fine.
  label: string // Short test name, e.g. "EMI", "Salt Fog"
  desc?: string // Free text, e.g. the standard/method: "MIL-STD-461G RE102"
  price?: number // Usually 0 — the user prices it in NUForce
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
  specs?: string // → the Specifications text field
  notes?: string // → the Notes text field
}

export interface DraftImport {
  account?: string // Account/customer name (links later at close-won)
  rfqDate?: string // Date of the customer's original RFQ email — used to build the RFQ field
  testItem?: DraftTestItem
  lineItems?: DraftLineItem[]
  notes?: string // Falls back into Notes if testItem.notes is absent
}

const TI_STR_KEYS: (keyof DraftTestItem)[] = [
  'item', 'qty', 'model', 'drawing', 'dimL', 'dimW', 'dimH', 'wt',
  'volt', 'pwrType', 'phase', 'hz', 'amps', 'mounting', 'pressureFlow', 'loads', 'specs', 'notes',
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
  if (r.notes != null) draft.notes = String(r.notes)

  if (r.testItem && typeof r.testItem === 'object' && !Array.isArray(r.testItem)) {
    const t = r.testItem as Record<string, unknown>
    const out: DraftTestItem = {}
    for (const k of TI_STR_KEYS) if (t[k] != null) (out as Record<string, string>)[k] = String(t[k])
    if (Object.keys(out).length) draft.testItem = out
  }

  if (Array.isArray(r.lineItems)) {
    draft.lineItems = (r.lineItems as unknown[])
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && !Array.isArray(l))
      .map((l) => ({
        code: l.code != null ? String(l.code) : undefined,
        label: String(l.label ?? l.name ?? ''),
        desc: l.desc != null ? String(l.desc) : l.description != null ? String(l.description) : undefined,
        price: l.price != null && isFinite(Number(l.price)) ? Number(l.price) : 0,
      }))
      .filter((l) => (l.label || l.code))
  }

  if (!draft.testItem && !(draft.lineItems && draft.lineItems.length)) {
    return { ok: false, error: 'Nothing to import — the file has no test item and no line items.' }
  }
  return { ok: true, draft }
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
