// Build a prefilled quote (DraftImport shape) from a Workspace CRR workup. This is
// the mapping layer: CRR fields → test-item + power, the EMI/PQ/DC-Mag line items with
// their pricing, budget items pulled from the free-text Special Test Requirements, and
// a notes block. The quote page applies it (fresh quote → prefill; existing quote →
// fill-empty + append notes). Nothing here fetches — pass a workup from crr.ts.

import type { CrrWorkup } from './crr'
import { crrEnabled, crrShiftsByFamily, parseCurrentAmps, firstInt, parseSpecialReq } from './crr'
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
  const en = crrEnabled(w)
  const sh = crrShiftsByFamily(w)
  const catalog = buildCatalog({})
  const catPrice = (label: string): number => {
    const p = catalog.find((c) => c.label.toLowerCase() === label.toLowerCase())
    return p ? Math.round(p.price) : 0
  }
  const procs: DraftLineItem[] = []
  const bodies: DraftLineItem[] = []
  const reps: DraftLineItem[] = []
  for (const f of FAMILIES) {
    if (!en[f.key]) continue
    const shifts = sh[f.key]
    procs.push({ code: '44', label: f.proc, price: catPrice(f.proc), qty: 1 })
    bodies.push({ code: '51', label: f.setup, price: 0, qty: 1 })
    bodies.push({ code: '51', label: f.test, price: shifts * f.sr, qty: 1 })
    bodies.push({ code: '51', label: f.td, price: f.teardown, qty: 1 })
    reps.push({ code: '43', label: f.rep, price: catPrice(f.rep), qty: 1 })
  }
  return [...procs, ...bodies, ...reps]
}

/** The labeled notes block appended to the quote: quoteReq + the non-$ Special Test
 *  Requirements text, under a header naming the enabled families. '' if empty. */
export function crrNotesBlock(w: CrrWorkup | null | undefined): string {
  const en = crrEnabled(w)
  const f = (w?.data?.fields || {}) as Record<string, any>
  const fams = [en.emi && 'EMI', en.pq && 'Power Quality', en.dcm && 'DC Magnetics'].filter(Boolean) as string[]
  const header = (fams.length ? fams.join(' / ') : 'EMI') + ' Notes:'
  const special = parseSpecialReq(f.specialReq)
  const body = [String(f.quoteReq || '').trim(), special.leftover].filter(Boolean).join('\n\n')
  return body ? `${header}\n${body}` : ''
}

/** Full CRR → quote mapping. The EMI-family line items carry deliberate prices
 *  (Testing = shifts × rate, Teardown = fixed, Procedure/Report = catalog); the quote
 *  page applies them as-is and must NOT run them back through priceDraftLines. */
export function buildDraftFromCrr(w: CrrWorkup): DraftImport {
  const f = (w.data?.fields || {}) as Record<string, any>
  const c = (w.data?.checks || {}) as Record<string, any>
  const special = parseSpecialReq(f.specialReq)
  const testItem: DraftImport['testItem'] = {
    item: String(f.eqUnitName || ''),
    dimL: num(f.eqSizeL),
    dimW: num(f.eqSizeW),
    dimH: num(f.eqSizeH),
    wt: num(f.eqWeight),
    volt: num(f.eqVoltage),
    pwrType: c.pwrDC ? 'DC' : 'AC',
    phase: c.pwr3ph ? '3' : c.pwr1ph ? '1' : '',
    hz: c.pwr400 ? '400' : c.pwr60 ? '60' : c.pwr50 ? '50' : '',
    amps: parseCurrentAmps(f.eqCurrent),
    docRestriction: c.cuiReq ? 'CUI/Other' : '',
    witness: c.govWitness ? 'Yes' : 'Unknown',
    notes: crrNotesBlock(w),
  }
  const draft: DraftImport = {
    account: String(f.custCompany || ''),
    quoteNumber: String(w.quote_number || f.quoteNo || ''),
    rfqDate: String(f.quoteDate || ''),
    testItem,
    lineItems: buildCrrLineItems(w),
    budget: special.budget,
  }
  const cables = firstInt(f.eqCables)
  if (cables) draft.setup = { cables }
  return draft
}
