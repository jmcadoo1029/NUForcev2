// Build a prefilled quote (DraftImport shape) from a Workspace CRR workup. This is
// the mapping layer: CRR fields → test-item + power, the EMI/PQ/DC-Mag line items with
// their pricing, budget items pulled from the free-text Special Test Requirements, and
// a notes block. The quote page applies it (fresh quote → prefill; existing quote →
// fill-empty + append notes). Nothing here fetches — pass a workup from crr.ts.

import type { CrrWorkup, CrrUnit } from './crr'
import { crrUnits, crrEnabled, crrEnabledForUnit, crrShiftsForUnit, EMI_SPECS, PQ_SPECS, DCM_SPECS, parseCurrentAmps, firstInt, parseSpecialReq } from './crr'
import { EMI_SR, PQ_SR, DCM_SR } from '../data/calcPricing'
import { buildCatalog } from '../data/catalog'
import type { DraftImport, DraftLineItem } from './importDraft'

const num = (v: unknown): string => {
  const m = String(v ?? '').match(/-?\d+(?:\.\d+)?/)
  return m ? m[0] : ''
}

interface Family {
  key: 'emi' | 'pq' | 'dcm'
  name: string
  sr: number // shift rate ($/shift), from the calculator
  teardown: number // fixed teardown price
  setup: string
  test: string
  td: string
  proc: string
  rep: string
}

// Order matters: procedures first (EMI, PQ, DC Mag), families' setup/test/teardown in
// the same order, reports last in the same order.
const FAMILIES: Family[] = [
  { key: 'emi', name: 'EMI', sr: EMI_SR, teardown: 2000, setup: 'EMI – Setup', test: 'EMI – Testing', td: 'EMI – Teardown', proc: 'EMI Procedure', rep: 'EMI Report' },
  { key: 'pq', name: 'Power Quality', sr: PQ_SR, teardown: 1500, setup: 'PQ – Setup', test: 'PQ – Testing', td: 'PQ – Teardown', proc: 'PQ Procedure', rep: 'PQ Report' },
  { key: 'dcm', name: 'DC Magnetics', sr: DCM_SR, teardown: 1000, setup: 'DC Magnetics – Setup', test: 'DC Magnetics – Testing', td: 'DC Magnetics – Teardown', proc: 'DC Mag Procedure', rep: 'DC Mag Report' },
]

/**
 * The EMI/PQ/DC-Mag line items for the enabled families, priced per Jordan's rules:
 *   - Procedure & Report → catalog standard price
 *   - Setup             → $0 (estimator prices it)
 *   - Testing           → ceil(family shifts) × shift rate
 *   - Teardown          → fixed ($2000 EMI / $1500 PQ / $1000 DC Mag)
 * Codes: procedure 44, report 43, setup/test/teardown 51.
 */
export function buildCrrLineItems(w: CrrWorkup | null | undefined): DraftLineItem[] {
  const units = crrUnits(w)
  const multi = units.length > 1
  const catalog = buildCatalog({})
  const catPrice = (label: string): number => {
    const p = catalog.find((c) => c.label.toLowerCase() === label.toLowerCase())
    return p ? Math.round(p.price) : 0
  }
  // Per-unit full stack: every unit gets its own procedure / setup / testing / teardown /
  // report for its enabled families. Ordered by NU's line rules ACROSS all units — every
  // procedure (44) first, then setup/testing/teardown (51), then every report (43) — with
  // units kept in order within each tier. The unit is carried in the line DESCRIPTION (not
  // the label), so labels stay clean and identical while the desc tells the units apart.
  const procs: DraftLineItem[] = []
  const bodies: DraftLineItem[] = []
  const reps: DraftLineItem[] = []
  for (const unit of units) {
    const en = crrEnabledForUnit(unit)
    const sh = {
      emi: crrShiftsForUnit(unit, EMI_SPECS).suggestedShifts,
      pq: crrShiftsForUnit(unit, PQ_SPECS).suggestedShifts,
      dcm: crrShiftsForUnit(unit, DCM_SPECS).suggestedShifts,
    }
    const desc = multi ? (unit.name || '') : ''
    for (const f of FAMILIES) {
      if (!en[f.key]) continue
      const shifts = sh[f.key]
      procs.push({ code: '44', label: f.proc, desc, price: catPrice(f.proc), qty: 1 })
      bodies.push({ code: '51', label: f.setup, desc, price: 0, qty: 1 })
      bodies.push({ code: '51', label: f.test, desc, price: shifts * f.sr, qty: 1 })
      bodies.push({ code: '51', label: f.td, desc, price: f.teardown, qty: 1 })
      reps.push({ code: '43', label: f.rep, desc, price: catPrice(f.rep), qty: 1 })
    }
  }
  return [...procs, ...bodies, ...reps]
}

// Each enabled spec (family + the revision picked in Workspace) → the standard it
// names, in NU's Specifications wording. Ordered EMI → PQ → DC Magnetics to match
// the line-item order.
const SPEC_STANDARDS: Array<{ key: string; family: string; std: string }> = [
  { key: 'emi461f', family: 'EMI', std: 'MIL-STD-461F' },
  { key: 'emi461g', family: 'EMI', std: 'MIL-STD-461G' },
  { key: 'pq300b', family: 'Power Quality', std: 'MIL-STD-1399-300B' },
  { key: 'pq300p1', family: 'Power Quality', std: 'MIL-STD-1399-300-1' },
  { key: 'dcmag', family: 'DC Magnetics', std: 'DOD-STD-1399 Section 070' },
]

/** The Specifications text carried over from the CRR: one line per enabled spec across
 *  all units (deduped by spec), "<Family> testing in accordance with <standard>." */
export function crrSpecsText(w: CrrWorkup | null | undefined): string {
  const e: Record<string, boolean> = {}
  for (const u of crrUnits(w)) for (const k in u.enabledSpecs) if (u.enabledSpecs[k]) e[k] = true
  return SPEC_STANDARDS.filter((s) => e[s.key])
    .map((s) => `${s.family} testing in accordance with ${s.std}.`)
    .join('\n')
}

/** The standards a single unit needs, e.g. "EMI (MIL-STD-461G), Power Quality (MIL-STD-1399-300B)". */
function unitStandards(u: CrrUnit): string {
  const e = u.enabledSpecs || {}
  return SPEC_STANDARDS.filter((s) => e[s.key]).map((s) => `${s.family} (${s.std})`).join(', ')
}

/** The labeled notes block appended to the quote. For a multi-unit workup it lists each
 *  unit and its standards (so the quote records which tests belong to which unit — the
 *  reader's convention), then the global Section VII (quoteReq) and the non-$ Special Test
 *  Requirements leftover, under a header naming the enabled families. '' if empty. */
export function crrNotesBlock(w: CrrWorkup | null | undefined): string {
  const units = crrUnits(w)
  const multi = units.length > 1
  const g = (w?.data?.fields || {}) as Record<string, any>
  const en = crrEnabled(w)
  const fams = [en.emi && 'EMI', en.pq && 'Power Quality', en.dcm && 'DC Magnetics'].filter(Boolean) as string[]
  const header = (fams.length ? fams.join(' / ') : 'EMI') + ' Notes:'
  const special = parseSpecialReq(g.specialReq)
  const unitLines = multi
    ? units.map((u) => { const std = unitStandards(u); return `${u.name || 'Unit'}${std ? ': ' + std : ''}` }).join('\n')
    : ''
  const body = [unitLines, String(g.quoteReq || '').trim(), special.leftover].filter(Boolean).join('\n\n')
  return body ? `${header}\n${body}` : ''
}

/** Full CRR → quote mapping. The EMI-family line items carry deliberate prices
 *  (Testing = shifts × rate, Teardown = fixed, Procedure/Report = catalog); the quote
 *  page applies them as-is and must NOT run them back through priceDraftLines. */
export function buildDraftFromCrr(w: CrrWorkup): DraftImport {
  const units = crrUnits(w)
  const u0 = units[0] || { name: '', fields: {}, checks: {}, enabledSpecs: {}, specRows: {} }
  const g = (w.data?.fields || {}) as Record<string, any>   // global — Sections I / II / V / VII
  const c = (w.data?.checks || {}) as Record<string, any>   // global checks — witness / CUI (Section IV bottom band)
  const uf = (u0.fields || {}) as Record<string, any>       // unit 1's Section III fields (for the quote's Test Item)
  const uc = (u0.checks || {}) as Record<string, any>       // unit 1's Section III checks — power characteristics (per-unit)
  const special = parseSpecialReq(g.specialReq)
  const testItem: DraftImport['testItem'] = {
    item: String(uf.eqUnitName || ''),
    dimL: num(uf.eqSizeL),
    dimW: num(uf.eqSizeW),
    dimH: num(uf.eqSizeH),
    wt: num(uf.eqWeight),
    volt: num(uf.eqVoltage),
    pwrType: uc.pwrDC ? 'DC' : 'AC',
    phase: uc.pwr3ph ? '3' : uc.pwr1ph ? '1' : '',
    hz: uc.pwr400 ? '400' : uc.pwr60 ? '60' : uc.pwr50 ? '50' : '',
    amps: parseCurrentAmps(uf.eqCurrent),
    docRestriction: c.cuiReq ? 'CUI/Other' : '',
    witness: c.govWitness ? 'Yes' : 'Unknown',
    specs: crrSpecsText(w),
    notes: crrNotesBlock(w),
  }
  const draft: DraftImport = {
    account: String(g.custCompany || ''),
    quoteNumber: String(w.quote_number || g.quoteNo || ''),
    rfqDate: String(g.quoteDate || ''),
    testItem,
    lineItems: buildCrrLineItems(w),
    budget: special.budget,
  }
  // Multi-unit: seed the calculator's per-unit table with the unit names.
  if (units.length > 1) draft.units = units.map((u) => ({ name: u.name }))
  const cables = firstInt(uf.eqCables)
  if (cables) draft.setup = { cables }
  return draft
}
