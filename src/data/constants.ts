// Shared constants — the start of the single-source-of-truth data bucket.
// Pricing tables and the full product-code catalog get consolidated here as the
// Pricing Calculator is ported (Phase 4). Keeping them in one module means the
// calculator, the picker, and any future automation share the same numbers.

// Shift rates (from classic App.jsx).
export const EMI_SR = 1600
export const PQ_SR = 1450
export const DCM_SR = 1600

// Product-code options for the Product Picker's custom line, ported from the
// classic PCODE_OPTS. In V2 the custom-line slot becomes repeatable (add several
// at once, each with its own code) — see docs/OPEN_ITEMS.md.
export interface ProductCode {
  code: string
  label: string
}

export const PCODE_OPTS: ProductCode[] = [
  { code: '11', label: 'Noise' },
  { code: '12', label: 'AB/SB Noise' },
  { code: '32', label: 'High Speed Video' },
  { code: '33', label: 'Instrumentation' },
  { code: '41', label: 'Report/CoC' },
  { code: '42', label: 'Procedure' },
  { code: '43', label: 'EMI Report' },
  { code: '43', label: 'DC Mag Report' },
  { code: '43', label: 'PQ Report' },
  { code: '44', label: 'EMI Procedure' },
  { code: '44', label: 'DC Mag Procedure' },
  { code: '44', label: 'PQ Procedure' },
  { code: '51', label: 'EMI' },
  { code: '51', label: 'Power Quality' },
  { code: '51', label: 'DC Magnetics' },
  { code: '52', label: 'Shock' },
  { code: '53', label: 'T&H' },
  { code: '54', label: 'ESS' },
  { code: '55', label: 'Salt Fog' },
  { code: '56', label: 'Altitude' },
  { code: '57', label: 'Acceleration' },
  { code: '58', label: 'Drip/Sub/Spray' },
  { code: '59', label: 'Insulation Resistance' },
  { code: '91', label: 'MW Shock' },
  { code: '92', label: 'LW Shock' },
  { code: '93', label: 'Inclination' },
  { code: '94', label: 'Vibration' },
  { code: '95', label: 'Hydrostatic' },
  { code: '96', label: 'Tear Down' },
  { code: '98', label: 'Subcontract' },
]

// Best-effort human label for a product code (first match in the catalog).
export const codeLabel = (code: string): string =>
  PCODE_OPTS.find((p) => p.code === code)?.label || ''
