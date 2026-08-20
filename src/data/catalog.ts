// The Product Picker catalog — the predefined list of test line items, ported
// 1:1 from Classic's ProductPicker PRODUCTS array. Each test type has Setup and
// Testing variants; some prices are "smart" (derived from the quote's setup /
// weight / T&H duration) and some are "custom" (price entered by the quoter,
// e.g. EMI/PQ/DC Magnetics, which are calculator-driven).
//
// Label tweaks applied for V2 (per Jordan): "Shock (Other)" → "Shock", and the
// "… Only" labels dropped ("Temperature Only" → "Temperature", etc.).

import { sf } from '../lib/format'

export interface CatalogProduct {
  key: string
  cat: string
  label: string
  code: string
  price: number
  smart?: boolean // price depends on quote setup / weight / duration
  custom?: boolean // price is entered by the quoter (calculator-driven items)
  // Per-entry lifecycle. Omitted / true = active (selectable for new quotes).
  // false = dormant: kept so old & imported lines still resolve (display +
  // analytics), but not offered when building a new quote. Retire per entry, not
  // per code — e.g. code 59 keeps Insulation Resistance active while its old
  // Engineering / Misc uses are dormant.
  active?: boolean
  // For a dormant entry, the catalog key of the active product it maps to (e.g.
  // retired Wind/Rain → Spray). Surfaced as a hint on revision; never auto-applied.
  aliasTo?: string
}

export interface CatalogCtx {
  setup?: { techRate?: number | string; fabHours?: number | string; holes?: number | string; drillTap?: boolean }
  ti?: { wt?: number | string }
  vibs?: Array<{ stdSetup?: number | string }>
  hfvs?: Array<{ on?: boolean }>
  thDur?: string
}

export const TH_PRICES: Record<string, number> = {
  '0 to 1 Day': 1000,
  '3 Days': 1350,
  '5 Days': 1875,
  '7 Days': 2275,
  '10 Days': 2950,
}

// Build the base (code-defined) catalog against a pricing context. With no
// context, Classic's defaults apply (techRate 175, fabHours 4, no holes), so
// prices still make sense in the read-only preview before the calculator is
// wired (Phase 4). buildCatalog() (below) layers manager overrides on top.
export function buildCatalogRaw(ctx: CatalogCtx = {}): CatalogProduct[] {
  const techRate = sf(ctx.setup?.techRate, 175)
  const fabHours = sf(ctx.setup?.fabHours, 4)
  const holes = sf(ctx.setup?.holes, 0)
  const drillTap = ctx.setup?.drillTap || false
  const drillCost = holes * 0.5 * techRate * (drillTap ? 1.5 : 1)
  const fabCost = fabHours * techRate
  const smartSetup = Math.round(900 + drillCost + fabCost)
  const hfvOn = ctx.hfvs?.some((s) => s.on) || false
  const wt = sf(ctx.ti?.wt, 0)
  const mwsTest = wt > 0 ? (wt <= 200 ? 3975 : wt <= 500 ? 4575 : wt <= 1000 ? 5275 : 5975) : 4575
  const thDur = ctx.thDur || '0 to 1 Day'
  const th = TH_PRICES[thDur] || 1000

  return [
    // Vibration
    { key: 'vib_setup', cat: 'Vibration', label: 'Vibration – Setup', code: '94', price: smartSetup, smart: true },
    { key: 'vib_test', cat: 'Vibration', label: 'Vibration – Testing', code: '94', price: 3250 },
    // Medium Weight Shock
    { key: 'mws_setup', cat: 'Medium Weight Shock', label: 'Medium Weight Shock – Setup', code: '91', price: Math.round(1500 + drillCost + fabCost), smart: true },
    { key: 'mws_test', cat: 'Medium Weight Shock', label: 'Medium Weight Shock – Testing', code: '91', price: mwsTest, smart: wt > 0 },
    // Lightweight Shock
    { key: 'lws_setup', cat: 'Lightweight Shock', label: 'Lightweight Shock – Setup', code: '92', price: Math.round(900 + drillCost + fabCost), smart: true },
    { key: 'lws_test', cat: 'Lightweight Shock', label: 'Lightweight Shock – Testing', code: '92', price: 1450 },
    // HF Vibration
    { key: 'hfv_setup', cat: 'HF Vibration', label: 'HF Vibration – Setup', code: '52', price: Math.round(500 + drillCost + fabCost), smart: true },
    { key: 'hfv_test', cat: 'HF Vibration', label: 'HF Vibration – Testing', code: '52', price: 1225 },
    // Shock (renamed from "Shock (Other)")
    { key: 'sho_setup', cat: 'Shock', label: 'Shock – Setup', code: '52', price: hfvOn ? Math.round((500 + drillCost + fabCost) * 0.75) : Math.round(500 + drillCost + fabCost), smart: true },
    { key: 'sho_test', cat: 'Shock', label: 'Shock – Testing', code: '52', price: 1250 },
    // Temp & Humidity
    { key: 'th_setup', cat: 'Temp & Humidity', label: 'Temperature & Humidity – Setup', code: '53', price: 500 },
    { key: 'th_test', cat: 'Temp & Humidity', label: 'Temperature & Humidity – Testing', code: '53', price: th, smart: true },
    { key: 'to_setup', cat: 'Temp & Humidity', label: 'Temperature – Setup', code: '53', price: 500 },
    { key: 'to_test', cat: 'Temp & Humidity', label: 'Temperature – Testing', code: '53', price: th, smart: true },
    { key: 'hu_setup', cat: 'Temp & Humidity', label: 'Humidity – Setup', code: '53', price: 500 },
    { key: 'hu_test', cat: 'Temp & Humidity', label: 'Humidity – Testing', code: '53', price: th, smart: true },
    // ESS
    { key: 'ess_setup', cat: 'ESS', label: 'ESS – Setup', code: '54', price: 500 },
    { key: 'ess_test', cat: 'ESS', label: 'ESS – Testing', code: '54', price: 1000 },
    // Salt Fog
    { key: 'sf_setup', cat: 'Salt Fog', label: 'Salt Fog – Setup', code: '55', price: 500 },
    { key: 'sf_test', cat: 'Salt Fog', label: 'Salt Fog – Testing', code: '55', price: 1750 },
    // Altitude
    { key: 'alt_setup', cat: 'Altitude', label: 'Altitude – Setup', code: '56', price: 500 },
    { key: 'alt_test', cat: 'Altitude', label: 'Altitude – Testing', code: '56', price: 1000 },
    // Rapid Decompression
    { key: 'rd_setup', cat: 'Rapid Decompression', label: 'Rapid Decompression – Setup', code: '56', price: 1000 },
    { key: 'rd_test', cat: 'Rapid Decompression', label: 'Rapid Decompression – Testing', code: '56', price: 2275 },
    // Explosive Decompression
    { key: 'ed_setup', cat: 'Explosive Decompression', label: 'Explosive Decompression – Setup', code: '56', price: 1250 },
    { key: 'ed_test', cat: 'Explosive Decompression', label: 'Explosive Decompression – Testing', code: '56', price: 2450 },
    // Acceleration
    { key: 'acc_setup', cat: 'Acceleration', label: 'Acceleration – Setup', code: '57', price: 2000 },
    { key: 'acc_test', cat: 'Acceleration', label: 'Acceleration – Testing', code: '57', price: 1950 },
    // Inclination
    { key: 'incl_setup', cat: 'Inclination', label: 'Inclination – Setup', code: '93', price: 1250 },
    { key: 'incl_test', cat: 'Inclination', label: 'Inclination – Testing', code: '93', price: 1750 },
    // Drip
    { key: 'drip_setup', cat: 'Drip Test', label: 'Drip Test – Setup', code: '58', price: 500 },
    { key: 'drip_test', cat: 'Drip Test', label: 'Drip Test – Testing', code: '58', price: 750 },
    // Submergence
    { key: 'sub_setup', cat: 'Submergence', label: 'Submergence – Setup', code: '58', price: 500 },
    { key: 'sub_test', cat: 'Submergence', label: 'Submergence – Testing', code: '58', price: 750 },
    // Spray
    { key: 'spray_setup', cat: 'Spray Test', label: 'Spray Test – Setup', code: '58', price: 1250 },
    { key: 'spray_test', cat: 'Spray Test', label: 'Spray Test – Testing', code: '58', price: 1250 },
    // Insulation Resistance
    { key: 'insres', cat: 'Insulation Resistance', label: 'Insulation Resistance & Dielectric Strength', code: '59', price: 500 },
    // Noise
    { key: 'noise_setup', cat: 'Noise Susceptibility', label: 'Noise Susceptibility – Setup', code: '11', price: 1000 },
    { key: 'noise_test', cat: 'Noise Susceptibility', label: 'Noise Susceptibility – Testing', code: '11', price: 3950 },
    // Airborne
    { key: 'ab_setup', cat: 'Airborne Noise', label: 'Airborne Noise – Setup', code: '12', price: Math.round(1000 + drillCost + fabCost), smart: true },
    { key: 'ab_test', cat: 'Airborne Noise', label: 'Airborne Noise – Testing', code: '12', price: 2850 },
    // Structureborne
    { key: 'sb_setup', cat: 'Structureborne Noise', label: 'Structureborne Noise – Setup', code: '12', price: Math.round(850 + drillCost + fabCost), smart: true },
    { key: 'sb_test', cat: 'Structureborne Noise', label: 'Structureborne Noise – Testing', code: '12', price: 2650 },
    // Hydrostatic
    { key: 'hydro_test', cat: 'Hydrostatic', label: 'Hydrostatic Testing', code: '95', price: 500 },
    { key: 'hydro_pre', cat: 'Hydrostatic', label: 'Pre-Test Hydrostatic', code: '95', price: 500 },
    { key: 'hydro_post', cat: 'Hydrostatic', label: 'Post-Test Hydrostatic', code: '95', price: 500 },
    { key: 'hydro_both', cat: 'Hydrostatic', label: 'Post & Pre-Test Hydrostatic', code: '95', price: 1000 },
    // Procedures & Reports
    { key: 'proc', cat: 'Procedures & Reports', label: 'Test Procedure', code: '42', price: 1750 },
    { key: 'rep', cat: 'Procedures & Reports', label: 'Test Report', code: '41', price: 1050 },
    { key: 'coc', cat: 'Procedures & Reports', label: 'Certificate of Compliance', code: '41', price: 250 },
    { key: 'modal_analysis', cat: 'Procedures & Reports', label: 'Modal Analysis', code: '67', price: 6750 },
    { key: 'fixture_drawing', cat: 'Procedures & Reports', label: 'Test Fixture Drawings', code: '42', price: 2950 },
    // Instrumentation
    { key: 'shock_inst', cat: 'Instrumentation', label: 'Instrumentation (Shock)', code: '33', price: 525 },
    { key: 'cm_shock', cat: 'Instrumentation', label: 'Contact Monitoring (Shock)', code: '33', price: 350 },
    { key: 'vib_ch', cat: 'Instrumentation', label: 'Instrumentation (Vibration)', code: '33', price: 325 },
    { key: 'cm_vib', cat: 'Instrumentation', label: 'Contact Monitoring (Vibe)', code: '33', price: 750 },
    { key: 'hsv', cat: 'Instrumentation', label: 'High Speed Video', code: '32', price: 1950 },
    // Tear Down
    { key: 'td', cat: 'Other', label: 'Tear Down', code: '96', price: 750 },
    // EMI
    { key: 'emi_setup', cat: 'EMI', label: 'EMI – Setup', code: '51', price: 0, custom: true },
    { key: 'emi_test', cat: 'EMI', label: 'EMI – Testing', code: '51', price: 0, custom: true },
    { key: 'emi_td', cat: 'EMI', label: 'EMI – Teardown', code: '51', price: 0, custom: true },
    { key: 'emi_proc', cat: 'EMI', label: 'EMI Procedure', code: '44', price: 3425 },
    { key: 'emi_rep', cat: 'EMI', label: 'EMI Report', code: '43', price: 2850 },
    // Power Quality
    { key: 'pq_setup', cat: 'Power Quality', label: 'PQ – Setup', code: '51', price: 0, custom: true },
    { key: 'pq_test', cat: 'Power Quality', label: 'PQ – Testing', code: '51', price: 0, custom: true },
    { key: 'pq_td', cat: 'Power Quality', label: 'PQ – Teardown', code: '51', price: 0, custom: true },
    { key: 'pq_proc', cat: 'Power Quality', label: 'PQ Procedure', code: '44', price: 2925 },
    { key: 'pq_rep', cat: 'Power Quality', label: 'PQ Report', code: '43', price: 2450 },
    // DC Magnetics
    { key: 'dcm_setup', cat: 'DC Magnetics', label: 'DC Magnetics – Setup', code: '51', price: 0, custom: true },
    { key: 'dcm_test', cat: 'DC Magnetics', label: 'DC Magnetics – Testing', code: '51', price: 0, custom: true },
    { key: 'dcm_td', cat: 'DC Magnetics', label: 'DC Magnetics – Teardown', code: '51', price: 0, custom: true },
    { key: 'dcm_proc', cat: 'DC Magnetics', label: 'DC Mag Procedure', code: '44', price: 1950 },
    { key: 'dcm_rep', cat: 'DC Magnetics', label: 'DC Mag Report', code: '43', price: 1500 },
    // Subcontracting
    { key: 'sub_item', cat: 'Other', label: 'Subcontracting', code: '98', price: 0, custom: true },
    // ── Dormant (retired) ────────────────────────────────────────────────────
    // Kept so historical / imported lines that used these codes still resolve to
    // a name + category (display + analytics), but not offered for new quotes.
    { key: 'eng_services', cat: 'Engineering Services', label: 'Engineering Services', code: '59', price: 0, custom: true, active: false },
    { key: 'misc_test', cat: 'Misc. Testing', label: 'Misc. Testing', code: '59', price: 0, custom: true, active: false },
    { key: 'generic_setup', cat: 'Other', label: 'Setup and Prepare for Test', code: '90', price: 0, custom: true, active: false },
    // Historical test types kept dormant so imported / old lines resolve (display +
    // analytics), but not offered for new quotes. Price left as custom/0 since
    // dormant items are never selectable; give one a real price + active:true to revive.
    { key: 'enc_setup', cat: 'Enclosure Effectiveness', label: 'Enclosure Effectiveness – Setup', code: '58', price: 0, custom: true, active: false },
    { key: 'enc_test', cat: 'Enclosure Effectiveness', label: 'Enclosure Effectiveness – Testing', code: '58', price: 0, custom: true, active: false },
    { key: 'wr_setup', cat: 'Wind/Rain', label: 'Wind/Rain – Setup', code: '58', price: 0, custom: true, active: false, aliasTo: 'spray_setup' },
    { key: 'wr_test', cat: 'Wind/Rain', label: 'Wind/Rain – Testing', code: '58', price: 0, custom: true, active: false, aliasTo: 'spray_test' },
    { key: 'flow_setup', cat: 'Flow', label: 'Flow Testing – Setup', code: '59', price: 0, custom: true, active: false },
    { key: 'flow_test', cat: 'Flow', label: 'Flow Testing – Testing', code: '59', price: 0, custom: true, active: false },
    { key: 'chamber_setup', cat: 'Chamber', label: 'Chamber Testing – Setup', code: '53', price: 0, custom: true, active: false },
    { key: 'chamber_test', cat: 'Chamber', label: 'Chamber Testing – Testing', code: '53', price: 0, custom: true, active: false },
  ]
}

// ── Manager overrides (persisted deltas over the base catalog) ───────────────
// Loaded once at startup from the product_overrides table into this module cache,
// then merged by buildCatalog(). Keeping the cache module-level lets buildCatalog
// stay synchronous (used in many render paths); call setCatalogOverrides() after
// a load or a manager edit to refresh it.
export interface ProductOverride {
  id?: string
  base_key?: string | null // catalog key it overrides; null for a manager-added product
  code?: string | null
  label?: string | null
  price?: number | null // null = inherit base
  active?: boolean | null // null = inherit base
  removed?: boolean | null
  custom?: boolean | null
}

let _overrides: ProductOverride[] = []
export function setCatalogOverrides(rows: ProductOverride[]): void {
  _overrides = rows || []
  _metaCache = null // status lookups must reflect the new overrides
}

function applyOverrides(base: CatalogProduct[]): CatalogProduct[] {
  if (!_overrides.length) return base
  const byKey = new Map(_overrides.filter((o) => o.base_key).map((o) => [o.base_key as string, o]))
  const merged: CatalogProduct[] = []
  for (const p of base) {
    const ov = byKey.get(p.key)
    if (!ov) { merged.push(p); continue }
    if (ov.removed) continue // dropped from the catalog entirely
    merged.push({
      ...p,
      code: ov.code ?? p.code,
      label: ov.label ?? p.label,
      price: ov.price != null ? ov.price : p.price,
      active: ov.active != null ? ov.active : p.active,
    })
  }
  // Manager-added products (no base_key).
  for (const o of _overrides) {
    if (o.base_key || o.removed) continue
    merged.push({ key: 'ov_' + (o.id || `${o.code}_${o.label}`), cat: 'Custom', code: o.code || '', label: o.label || '', price: o.price || 0, active: o.active !== false, custom: !!o.custom })
  }
  return merged
}

// The catalog the app uses everywhere — base + manager overrides.
export function buildCatalog(ctx: CatalogCtx = {}): CatalogProduct[] {
  return applyOverrides(buildCatalogRaw(ctx))
}

// Static catalog metadata (code / label / active), independent of pricing —
// memoized so line-status lookups don't rebuild the priced catalog each call.
let _metaCache: CatalogProduct[] | null = null
function catalogMeta(): CatalogProduct[] {
  return _metaCache ?? (_metaCache = buildCatalog())
}

/** True when a catalog entry is active (selectable for new quotes). */
export const isActive = (p: CatalogProduct): boolean => p.active !== false

/**
 * Resolve a quote line (esp. an imported one, whose label carries specifics) to a
 * catalog entry. CODE is the key: candidates are the entries with that code, then
 * we disambiguate a shared code by matching the line's label to a candidate's
 * category + setup/test role. This is how a code-58 "Wind/Rain" line lands on the
 * dormant Wind/Rain entry while a code-58 "Spray" line lands on active Spray.
 * Read-only — it never rewrites the line.
 */
export function resolveCatalogEntry(code: string, label: string): CatalogProduct | undefined {
  const c = (code || '').trim()
  const all = catalogMeta()
  const candidates = c ? all.filter((p) => p.code === c) : []
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) {
    // No code, or a code not in the catalog: fall back to an exact label match so a
    // clearly-named line (e.g. "Setup and Prepare for Test", stored with no code) is
    // still recognized. Conservative — only an exact label hit, never a fuzzy guess.
    const lx = (label || '').trim().toLowerCase()
    return lx ? all.find((p) => p.label.toLowerCase() === lx) : undefined
  }
  const l = (label || '').toLowerCase()
  // Exact label wins outright.
  const exact = candidates.find((p) => p.label === label)
  if (exact) return exact
  const lineRole = /set ?up/i.test(label) ? 'setup' : /test/i.test(label) ? 'test' : ''
  // Pre/post modifier (word-boundary, dash/space after — so "prepare"/"pressure"
  // don't match). Distinguishes hydrostatic Pre / Post / Both, which share a category.
  const hasPre = (s: string) => /\bpre[-\s]/.test(s)
  const hasPost = (s: string) => /\bpost[-\s]/.test(s)
  const linePre = hasPre(l)
  const linePost = hasPost(l)
  let best: CatalogProduct | undefined
  let bestScore = 0
  for (const p of candidates) {
    let score = 0
    const cat = p.cat.toLowerCase()
    const pl = p.label.toLowerCase()
    const prefix = p.label.split('–')[0].trim().toLowerCase() // "wind/rain", "spray test", …
    const firstWord = cat.split(/[\s/]+/)[0]
    if (cat && l.includes(cat)) score += 3
    else if (prefix && l.includes(prefix)) score += 3
    else if (firstWord.length > 2 && l.includes(firstWord)) score += 2
    const pRole = /set ?up/i.test(p.label) ? 'setup' : /test/i.test(p.label) ? 'test' : ''
    if (lineRole && pRole === lineRole) score += 1
    // Prefer the candidate whose pre/post pattern matches the line's — including
    // "neither", so a plain "Hydrostatic Testing" lands on the plain entry rather
    // than defaulting to Pre.
    if (hasPre(pl) === linePre && hasPost(pl) === linePost) score += 3
    if (score > bestScore) { bestScore = score; best = p }
  }
  // No category match → prefer an active candidate (don't false-flag as dormant).
  return bestScore > 0 ? best : candidates.find(isActive) || candidates[0]
}

export interface ResolvedLine {
  entry?: CatalogProduct
  status: 'active' | 'dormant' | 'unknown'
  aliasLabel?: string // active product a dormant line maps to (Wind/Rain → Spray)
}

/** Resolve a line to its catalog entry, lifecycle status, and any alias target. */
export function resolveLine(code: string, label: string): ResolvedLine {
  const entry = resolveCatalogEntry(code, label)
  if (!entry) return { status: 'unknown' }
  const status = isActive(entry) ? 'active' : 'dormant'
  let aliasLabel: string | undefined
  if (status === 'dormant' && entry.aliasTo) {
    aliasLabel = catalogMeta().find((p) => p.key === entry.aliasTo)?.label
  }
  return { entry, status, aliasLabel }
}

/**
 * Lifecycle of a quote line — 'dormant' means retired (replace on revision),
 * 'unknown' means the code isn't in the catalog (not flagged). Thin wrapper over
 * resolveLine for callers that only need the status.
 */
export function lineStatus(code: string, label: string): 'active' | 'dormant' | 'unknown' {
  return resolveLine(code, label).status
}

// Sort the catalog by code (numeric, then label) or by label (then code).
export function sortCatalog(products: CatalogProduct[], mode: 'code' | 'name'): CatalogProduct[] {
  return [...products].sort((a, b) => {
    const ca = parseInt(a.code) || 0
    const cb = parseInt(b.code) || 0
    if (mode === 'name') {
      const cmp = a.label.localeCompare(b.label)
      return cmp !== 0 ? cmp : ca - cb
    }
    return ca !== cb ? ca - cb : a.label.localeCompare(b.label)
  })
}
