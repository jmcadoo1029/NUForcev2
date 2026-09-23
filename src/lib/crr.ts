import { useEffect, useState } from 'react'
import { restFetch } from './restFetch'

// CRR (Customer Requirements Review) workups live in public.crr_workups, written
// by NUWorkspace and keyed by quote_number. Each holds per-test spec rows with a
// Time column; NUForce derives shift counts from it (hours ÷ 8) as an alternative
// to computing shifts from the test matrix. This module is the read-only link:
// fetch the matching workup for a quote, and derive the EMI/PQ shift summary.
// Ported from Classic's CRR fetch + EmiCrrView/PqCrrView shift logic.

export interface CrrWorkup {
  quote_number: string
  customer_company?: string
  status?: string
  ready_to_quote?: boolean
  updated_at?: string
  data?: {
    enabledSpecs?: Record<string, boolean>
    specRows?: Record<string, Array<Array<unknown>>> // key → rows of [testKey, label, time, comments]
    fields?: Record<string, any> // the CRR form fields (custCompany, eqUnitName, eqCurrent, specialReq, quoteReq, …)
    checks?: Record<string, any> // the CRR checkboxes (pwrAC/pwrDC, pwr1ph/pwr3ph, cuiReq, govWitness, …)
    // Multi-unit workups (new): per-unit Section III / IV-specs / VI live here. Global
    // sections (I / II / V / VII) stay in `fields`/`checks` above. Absent on legacy
    // single-unit workups, which keep their specs in the top-level enabledSpecs/specRows.
    units?: Array<{ fields?: Record<string, any>; checks?: Record<string, any>; enabledSpecs?: Record<string, boolean>; specRows?: Record<string, Array<Array<unknown>>> }>
  }
}

// A single unit's slice of a workup: its Section III fields + checks (power chars live
// here, per Workspace), test-spec selection, and spec tables. A legacy single-unit
// workup normalizes to one implicit unit (its checks are the top-level checks).
export interface CrrUnit {
  name: string
  fields: Record<string, any>
  checks: Record<string, any>
  enabledSpecs: Record<string, boolean>
  specRows: Record<string, Array<Array<unknown>>>
}

/** Normalize a workup to its unit list. Multi-unit workups carry data.units[]; every
 *  existing flat workup becomes one implicit unit — so old CRRs keep working untouched. */
export function crrUnits(w: CrrWorkup | null | undefined): CrrUnit[] {
  const d = (w?.data || {}) as NonNullable<CrrWorkup['data']>
  const arr = Array.isArray(d.units) ? d.units : []
  if (arr.length) {
    return arr.map((u, i) => ({
      name: String(u?.fields?.eqUnitName || `Unit ${i + 1}`), // no separate units[i].name — Workspace uses eqUnitName
      fields: (u?.fields || {}) as Record<string, any>,
      checks: (u?.checks || {}) as Record<string, any>,
      enabledSpecs: (u?.enabledSpecs || {}) as Record<string, boolean>,
      specRows: (u?.specRows || {}) as Record<string, Array<Array<unknown>>>,
    }))
  }
  return [{
    name: String(d.fields?.eqUnitName || ''),
    fields: (d.fields || {}) as Record<string, any>,
    checks: (d.checks || {}) as Record<string, any>, // legacy: the single unit's checks are the top-level checks
    enabledSpecs: (d.enabledSpecs || {}) as Record<string, boolean>,
    specRows: (d.specRows || {}) as Record<string, Array<Array<unknown>>>,
  }]
}

/** Merge every unit's enabled specs + spec rows into one view (union enabled, rows
 *  concatenated) — lets the calculator-facing shift helpers show a combined picture for
 *  a multi-unit workup without the calc tabs needing to know about units. */
function mergedSpecSource(w: CrrWorkup | null | undefined): { enabled: Record<string, boolean>; rows: Record<string, Array<Array<unknown>>> } {
  const units = crrUnits(w)
  if (units.length <= 1) {
    const u = units[0]
    return { enabled: u?.enabledSpecs || {}, rows: u?.specRows || {} }
  }
  const enabled: Record<string, boolean> = {}
  const rows: Record<string, Array<Array<unknown>>> = {}
  for (const u of units) {
    for (const k in u.enabledSpecs) if (u.enabledSpecs[k]) enabled[k] = true
    for (const k in u.specRows) rows[k] = [...(rows[k] || []), ...(u.specRows[k] || [])]
  }
  return { enabled, rows }
}

// A spec section for a calc tab. Column indices differ per standard because the
// CRR workup stores each family's rows in its own shape:
//   EMI  (emi461f/g): [testKey, label, time, comments]        → time at col 2
//   PQ   (pq300b/p1) : [requirement, time, paragraph, …]       → time at col 1
//   DCMag(dcmag)     : [test, description, time, comments]      → time at col 2
export interface SpecDef {
  key: string // specRows key
  rev: string // display label
  timeCol: number
  keyCol: number // the test identifier column
  altKeyCol?: number // fallback identifier column (PQ: requirement)
  labelCol: number
}

export const EMI_SPECS: SpecDef[] = [
  { key: 'emi461f', rev: 'F', keyCol: 0, labelCol: 1, timeCol: 2 },
  { key: 'emi461g', rev: 'G', keyCol: 0, labelCol: 1, timeCol: 2 },
]
export const PQ_SPECS: SpecDef[] = [
  { key: 'pq300b', rev: '300B', keyCol: 2, altKeyCol: 0, labelCol: 0, timeCol: 1 },
  { key: 'pq300p1', rev: '300P1', keyCol: 2, altKeyCol: 0, labelCol: 0, timeCol: 1 },
]
export const DCM_SPECS: SpecDef[] = [
  { key: 'dcmag', rev: 'DCM', keyCol: 0, labelCol: 1, timeCol: 2 },
]

/**
 * Fetch the CRR workup for a quote number. Matches on the BASE opportunity
 * (strips a single trailing revision letter) so a revised quote (26-224A) still
 * finds a workup filed under the base (26-224), then picks the workup revision at
 * or below the quote's, preferring an exact match. Returns null if none / on error.
 */
export async function fetchCrrWorkup(opp: string): Promise<CrrWorkup | null> {
  const quoteNum = (opp || '').trim()
  if (!quoteNum) return null
  const m = quoteNum.match(/^(.*?)([A-Za-z])?$/)
  const base = (m ? m[1] : quoteNum).trim()
  const baseU = base.toUpperCase()
  try {
    const rows = (await restFetch<CrrWorkup[]>('GET', `crr_workups?quote_number=ilike.${encodeURIComponent(base + '*')}&select=*`)) || []
    const revRank = (qn: unknown) => {
      const s = String(qn || '').toUpperCase()
      const suffix = s.length === baseU.length + 1 ? s.slice(-1) : ''
      return /[A-Z]/.test(suffix) ? suffix.charCodeAt(0) - 64 : 0 // base=0, A=1, …
    }
    const variants = rows.filter((r) => {
      const qn = String(r.quote_number || '').toUpperCase()
      if (qn === baseU) return true
      return qn.length === baseU.length + 1 && qn.startsWith(baseU) && /[A-Z]/.test(qn.slice(-1))
    })
    if (!variants.length) return null
    const currentRank = revRank(quoteNum)
    const exact = variants.find((r) => String(r.quote_number || '').toUpperCase() === quoteNum.toUpperCase())
    const atOrBelow = variants.filter((r) => revRank(r.quote_number) <= currentRank)
    const pool = atOrBelow.length ? atOrBelow : variants
    const chosen = exact || pool.slice().sort((a, b) => revRank(b.quote_number) - revRank(a.quote_number))[0]
    return chosen || null
  } catch {
    return null
  }
}

/** A lightweight CRR row for the import picker (no heavy `data` blob). */
export interface CrrSummary {
  quote_number: string
  customer_company: string
  status: string
  ready_to_quote: boolean
  updated_at: string
}

/**
 * Search CRR workups for the import picker. Matches `term` against quote number OR
 * customer company (case-insensitive substring). Empty term → the most recent
 * workups. Returns summary rows only (the full workup is fetched on selection).
 */
export async function searchCrrWorkups(term: string): Promise<CrrSummary[]> {
  const t = (term || '').trim()
  const cols = 'quote_number,customer_company,status,ready_to_quote,updated_at'
  let q = `crr_workups?select=${cols}&order=updated_at.desc&limit=30`
  if (t) {
    const esc = encodeURIComponent(`*${t}*`)
    q += `&or=(quote_number.ilike.${esc},customer_company.ilike.${esc})`
  }
  try {
    const rows = (await restFetch<any[]>('GET', q)) || []
    return rows.map((r) => ({
      quote_number: String(r.quote_number ?? ''),
      customer_company: String(r.customer_company ?? ''),
      status: String(r.status ?? ''),
      ready_to_quote: !!r.ready_to_quote,
      updated_at: String(r.updated_at ?? ''),
    }))
  } catch {
    return []
  }
}

/** Fetch a single CRR workup by exact quote number (full row incl. `data`). */
export async function fetchCrrWorkupExact(quoteNumber: string): Promise<CrrWorkup | null> {
  const qn = (quoteNumber || '').trim()
  if (!qn) return null
  try {
    const rows = (await restFetch<CrrWorkup[]>('GET', `crr_workups?quote_number=eq.${encodeURIComponent(qn)}&select=*&limit=1`)) || []
    return rows[0] || null
  } catch {
    return null
  }
}

export interface CrrTest {
  rev: string
  testKey: string
  label: string
  timeRaw: string
  comments: string
  computedShifts: number | null
  ovKey: string
  skipped: boolean
}

export interface CrrShiftSummary {
  tests: CrrTest[]
  countedCount: number
  totalHours: number
  totalShifts: number // sum of computed shifts (2-dp)
  suggestedShifts: number // total rounded up to a whole shift once
}

const parseHours = (timeStr: unknown): number | null => {
  const s = String(timeStr ?? '').trim()
  const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/)
  return m ? parseFloat(m[1]) : null
}

/**
 * Derive the shift summary for a set of spec sections (EMI or PQ) from a workup.
 * Pure — pricing (rate × shifts, setup/teardown, rentals) is applied by the
 * calculator, since those inputs live in calc state.
 */
function deriveShiftsFrom(enabled: Record<string, boolean>, allRows: Record<string, Array<Array<unknown>>>, specs: SpecDef[]): CrrShiftSummary {
  const tests: CrrTest[] = []
  for (const spec of specs) {
    if (!enabled[spec.key]) continue
    const rows = allRows[spec.key] || []
    rows.forEach((row, idx) => {
      const testKey = String(row?.[spec.keyCol] ?? '').trim() || (spec.altKeyCol != null ? String(row?.[spec.altKeyCol] ?? '').trim() : '')
      if (!testKey) return
      const hours = parseHours(row?.[spec.timeCol])
      const computedShifts = hours !== null ? Math.round((hours / 8) * 100) / 100 : null
      tests.push({
        rev: spec.rev,
        testKey,
        label: String(row?.[spec.labelCol] ?? ''),
        timeRaw: String(row?.[spec.timeCol] ?? ''),
        comments: '',
        computedShifts,
        ovKey: `${spec.rev}:${testKey}:${idx}`,
        skipped: computedShifts === null,
      })
    })
  }
  const counted = tests.filter((t) => !t.skipped)
  const totalShifts = Math.round(counted.reduce((a, t) => a + (t.computedShifts || 0), 0) * 100) / 100
  const totalHours = counted.reduce((a, t) => a + (parseHours(t.timeRaw) || 0), 0)
  return {
    tests,
    countedCount: counted.length,
    totalHours,
    totalShifts,
    suggestedShifts: Math.ceil(totalShifts),
  }
}

/** Shift summary across the WHOLE workup (all units merged) — the calculator-facing entry. */
export function deriveCrrShifts(workup: CrrWorkup | null | undefined, specs: SpecDef[]): CrrShiftSummary {
  const s = mergedSpecSource(workup)
  return deriveShiftsFrom(s.enabled, s.rows, specs)
}

/** Shift summary for a SINGLE unit's spec sections — used for per-unit line items. */
export function crrShiftsForUnit(unit: CrrUnit, specs: SpecDef[]): CrrShiftSummary {
  return deriveShiftsFrom(unit.enabledSpecs || {}, unit.specRows || {}, specs)
}

// ── CRR → quote helpers ───────────────────────────────────────────────────────

/** Which test families a workup has enabled (any spec revision counts, any unit). */
export function crrEnabled(w: CrrWorkup | null | undefined): { emi: boolean; pq: boolean; dcm: boolean } {
  const e = mergedSpecSource(w).enabled
  return { emi: !!(e.emi461f || e.emi461g), pq: !!(e.pq300b || e.pq300p1), dcm: !!e.dcmag }
}

/** Same, for a single unit (multi-unit per-unit line items). */
export function crrEnabledForUnit(u: CrrUnit): { emi: boolean; pq: boolean; dcm: boolean } {
  const e = u.enabledSpecs || {}
  return { emi: !!(e.emi461f || e.emi461g), pq: !!(e.pq300b || e.pq300p1), dcm: !!e.dcmag }
}

/** Suggested (rounded-up) shift count per family, from the workup's spec-row times. */
export function crrShiftsByFamily(w: CrrWorkup | null | undefined): { emi: number; pq: number; dcm: number } {
  return {
    emi: deriveCrrShifts(w, EMI_SPECS).suggestedShifts,
    pq: deriveCrrShifts(w, PQ_SPECS).suggestedShifts,
    dcm: deriveCrrShifts(w, DCM_SPECS).suggestedShifts,
  }
}

/**
 * The current rating as a plain amp number, from the CRR's open-text eqCurrent.
 * Uses the LARGEST amp-denominated value and ignores voltages: "10A" → 10,
 * "<10A (… 120VAC … 8.5A)" → 10, "50A inrush, 100A max" → 100. '' when none.
 */
export function parseCurrentAmps(text: unknown): string {
  const s = String(text ?? '')
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*a(?:mps?)?\b/gi)].map((m) => parseFloat(m[1]))
  if (!nums.length) return ''
  const max = Math.max(...nums)
  return Number.isInteger(max) ? String(max) : String(max)
}

/** First integer in a free-text field (e.g. eqCables "5 including power, one fiber" → "5"). */
export function firstInt(text: unknown): string {
  const m = String(text ?? '').match(/\d+/)
  return m ? m[0] : ''
}

export interface SpecialReqParse {
  budget: Array<{ desc: string; qty: string; unitCost: string }>
  leftover: string // the non-dollar text (goes to notes)
}

/**
 * Pull $-denominated budget items out of the free-text "Special Test Requirements"
 * (eqSpecialReq): each clause with a $amount becomes a budget row (the amount removed
 * from the description), and the clauses WITHOUT a dollar amount are returned as
 * `leftover` for the notes. "$5k" is read as 5000.
 */
export function parseSpecialReq(text: unknown): SpecialReqParse {
  const s = String(text ?? '').trim()
  const budget: SpecialReqParse['budget'] = []
  const leftovers: string[] = []
  if (!s) return { budget, leftover: '' }
  const clauses = s.split(/(?<=[.;])\s+|\n+/)
  for (const c of clauses) {
    const m = c.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k)?/i)
    if (!m) {
      if (c.trim()) leftovers.push(c.trim())
      continue
    }
    let amt = parseFloat(m[1].replace(/,/g, ''))
    if (m[2]) amt *= 1000
    const desc = c
      .replace(/\$\s?[\d,]+(?:\.\d+)?\s*k?/i, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s.,;-]+|[\s.,;-]+$/g, '')
      .trim()
    if (amt > 0) budget.push({ desc: desc || 'Special test requirement', qty: '1', unitCost: String(Math.round(amt)) })
  }
  return { budget, leftover: leftovers.join(' ').replace(/\s{2,}/g, ' ').trim() }
}

// Non-test spec rows (setup / teardown / procedure / report) — excluded from the
// Spec Builder, which should carry TESTING rows only.
const NON_TEST_ROW = /setup|tear\s*-?\s*down|teardown|procedure|report/i

// ── Spec Builder from CRR ─────────────────────────────────────────────────────
// Build the Spec Builder payload from the CRR workup — the same shape the
// from-NUForce path produces ({ quote, sections:[{type, rows:[[test,label,comments]]}] })
// but sourced from the workup. Only rows with a clean numeric Time are included
// (blank / "TBD" / "1 day" rows are dropped — the tech hasn't committed a time).
// Ported from Classic's buildSpecBuilderPayloadFromCrr.

export interface SpecSection { type: string; rows: string[][]; intro?: string }
export interface SpecPayload { quote: string; sections: SpecSection[] }

const isNumericTime = (v: unknown) => /^\s*\d+(?:\.\d+)?\s*$/.test(String(v ?? ''))

export function buildSpecPayloadFromCrr(workup: CrrWorkup | null | undefined, quoteNumber: string): SpecPayload {
  const units = crrUnits(workup)
  const multi = units.length > 1
  const sections: SpecSection[] = []

  for (const unit of units) {
    const enabled = unit.enabledSpecs || {}
    const allRows = unit.specRows || {}
    const unitSections: SpecSection[] = []

    // EMI / DC Mag: [test, description, time(2), comments] → [test, desc, comments]
    const mapFourCol = (key: string, type: string) => {
      if (!enabled[key]) return
      const rows = (allRows[key] || [])
        .filter((r) => Array.isArray(r) && isNumericTime(r[2]) && !NON_TEST_ROW.test(String(r[0] ?? '') + ' ' + String(r[1] ?? '')))
        .map((r) => [String(r[0] ?? ''), String(r[1] ?? ''), String(r[3] ?? '')])
      if (rows.length) unitSections.push({ type, rows })
    }
    // PQ: [requirement, time(1), paragraph(2), testReq(3), tables(4)]
    //   → [test=paragraph, label=requirement, comments=testReq + tables]
    const mapPq = (key: string) => {
      if (!enabled[key]) return
      const rows = (allRows[key] || [])
        .filter((r) => Array.isArray(r) && isNumericTime(r[1]) && !NON_TEST_ROW.test(String(r[0] ?? '') + ' ' + String(r[2] ?? '')))
        .map((r) => {
          const parts: string[] = []
          if (String(r[3] ?? '')) parts.push(String(r[3]))
          if (String(r[4] ?? '')) parts.push('Tables / Figures: ' + String(r[4]))
          return [String(r[2] ?? ''), String(r[0] ?? ''), parts.join('\n')]
        })
      if (rows.length) unitSections.push({ type: 'Power Quality', rows })
    }

    mapFourCol('emi461f', 'EMI')
    mapFourCol('emi461g', 'EMI')
    mapPq('pq300b')
    mapPq('pq300p1')
    mapFourCol('dcmag', 'DC Magnetics')

    // Multi-unit: label each table set with its unit so the Spec Builder shows one set
    // per unit. The builder honors a payload-provided `intro` (falls back to the preset).
    if (multi) unitSections.forEach((sec) => { sec.intro = `${unit.name || 'Unit'} — ${sec.type}` })
    sections.push(...unitSections)
  }

  return { quote: quoteNumber || '', sections }
}

/** React hook: the CRR workup for a quote number (null while loading / none). */
export function useCrrWorkup(opp: string | undefined | null): { workup: CrrWorkup | null; loading: boolean } {
  const [workup, setWorkup] = useState<CrrWorkup | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let alive = true
    const key = (opp || '').trim()
    if (!key) { setWorkup(null); return }
    setLoading(true)
    fetchCrrWorkup(key).then((w) => { if (alive) { setWorkup(w); setLoading(false) } })
    return () => { alive = false }
  }, [opp])
  return { workup, loading }
}
