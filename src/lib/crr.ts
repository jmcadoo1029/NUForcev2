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
  data?: {
    enabledSpecs?: Record<string, boolean>
    specRows?: Record<string, Array<Array<unknown>>> // key → rows of [testKey, label, time, comments]
  }
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
export function deriveCrrShifts(workup: CrrWorkup | null | undefined, specs: SpecDef[]): CrrShiftSummary {
  const enabled = workup?.data?.enabledSpecs || {}
  const allRows = workup?.data?.specRows || {}
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

// ── Spec Builder from CRR ─────────────────────────────────────────────────────
// Build the Spec Builder payload from the CRR workup — the same shape the
// from-NUForce path produces ({ quote, sections:[{type, rows:[[test,label,comments]]}] })
// but sourced from the workup. Only rows with a clean numeric Time are included
// (blank / "TBD" / "1 day" rows are dropped — the tech hasn't committed a time).
// Ported from Classic's buildSpecBuilderPayloadFromCrr.

export interface SpecSection { type: string; rows: string[][] }
export interface SpecPayload { quote: string; sections: SpecSection[] }

const isNumericTime = (v: unknown) => /^\s*\d+(?:\.\d+)?\s*$/.test(String(v ?? ''))

export function buildSpecPayloadFromCrr(workup: CrrWorkup | null | undefined, quoteNumber: string): SpecPayload {
  const sections: SpecSection[] = []
  const enabled = workup?.data?.enabledSpecs || {}
  const allRows = workup?.data?.specRows || {}

  // EMI / DC Mag: [test, description, time(2), comments] → [test, desc, comments]
  const mapFourCol = (key: string, type: string) => {
    if (!enabled[key]) return
    const rows = (allRows[key] || [])
      .filter((r) => Array.isArray(r) && isNumericTime(r[2]))
      .map((r) => [String(r[0] ?? ''), String(r[1] ?? ''), String(r[3] ?? '')])
    if (rows.length) sections.push({ type, rows })
  }
  // PQ: [requirement, time(1), paragraph(2), testReq(3), tables(4)]
  //   → [test=paragraph, label=requirement, comments=testReq + tables]
  const mapPq = (key: string) => {
    if (!enabled[key]) return
    const rows = (allRows[key] || [])
      .filter((r) => Array.isArray(r) && isNumericTime(r[1]))
      .map((r) => {
        const parts: string[] = []
        if (String(r[3] ?? '')) parts.push(String(r[3]))
        if (String(r[4] ?? '')) parts.push('Tables / Figures: ' + String(r[4]))
        return [String(r[2] ?? ''), String(r[0] ?? ''), parts.join('\n')]
      })
    if (rows.length) sections.push({ type: 'Power Quality', rows })
  }

  mapFourCol('emi461f', 'EMI')
  mapFourCol('emi461g', 'EMI')
  mapPq('pq300b')
  mapPq('pq300p1')
  mapFourCol('dcmag', 'DC Magnetics')

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
