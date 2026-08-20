import { restFetch } from '../../lib/restFetch'
import { sf } from '../../lib/format'
import { yearOfOpp } from '../../lib/opp'
import type { QuoteData } from '../../data/quoteModel'

// Product-code report entries — one per code-bearing line item across ALL
// quotes. Ported from Classic's loadCodeReport: sources are pickerLines,
// custom.rows, and summary.lines (deduped against custom), bucketed by year
// (won quotes by won-year, everything else by opportunity prefix).

export interface CodeEntry {
  quoteId: string
  opp: string
  customer: string
  stage: string
  year: string
  code: string
  price: number
}

interface Raw {
  id: string
  opportunity?: string | null
  customer?: string | null
  stage?: string | null
  won_date?: string | null
  data?: QuoteData & {
    qi?: { account?: string; stage?: string }
    wonInfo?: { wonDate?: string }
    custom?: { rows?: { pcode?: string; code?: string; label?: string; price?: string | number }[] }
    summary?: { lines?: { code?: string; label?: string; val?: string | number }[] }
    pickerLines?: { code?: string; label?: string; price?: string | number }[]
  }
}

export const CODE_REPORT_LABELS: Record<string, string> = {
  '11': 'Noise', '12': 'AB/SB Noise', '32': 'High Speed Video', '33': 'Instrumentation',
  '41': 'Report/CoC', '42': 'Procedure', '43': 'EMI/DC Mag/PQ Report', '44': 'EMI/DC Mag/PQ Procedure',
  '51': 'EMI / PQ / DC Magnetics', '52': 'HFV/Shock Other', '53': 'T&H', '54': 'ESS', '55': 'Salt Fog',
  '56': 'Altitude', '57': 'Acceleration', '58': 'Drip/Sub/Spray', '59': 'Insulation Resistance',
  '91': 'MW Shock', '92': 'LW Shock', '93': 'Inclination', '94': 'Vibration', '95': 'Hydrostatic',
  '96': 'Tear Down', '98': 'Subcontract',
}
export const codeReportLabel = (code: string): string => CODE_REPORT_LABELS[code] || ''

const yearFromOpp = (opp?: string | null) => yearOfOpp(opp, 'unknown')
function yearFromDate(s?: string | null): string | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-\d{2}-\d{2}/)
  if (m) {
    const y = parseInt(m[1], 10)
    if (y >= 2000 && y <= 2099) return String(y)
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear()
    if (y >= 2000 && y <= 2099) return String(y)
  }
  return null
}

export async function fetchCodeEntries(): Promise<CodeEntry[]> {
  const cols = 'id,opportunity,customer,total,stage,won_date,data'
  let all: Raw[] = []
  let offset = 0
  const batch = 500
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = (await restFetch<Raw[]>('GET', `quotes?select=${cols}&order=opportunity.desc&limit=${batch}&offset=${offset}`)) || []
    all = all.concat(rows)
    if (rows.length < batch) break
    offset += batch
  }

  const entries: CodeEntry[] = []
  for (const q of all) {
    const blob = q.data || {}
    const stage = q.stage || blob.qi?.stage || ''
    const isWon = stage === 'Closed Won'
    const year = isWon ? yearFromDate(q.won_date) || yearFromDate(blob.wonInfo?.wonDate) || yearFromOpp(q.opportunity) : yearFromOpp(q.opportunity)
    const common = { quoteId: q.id, opp: q.opportunity || '', customer: q.customer || blob.qi?.account || '(Unknown)', stage, year }

    ;(blob.pickerLines || []).forEach((l) => {
      const code = String(l.code || '').trim()
      if (code) entries.push({ ...common, code, price: sf(l.price) })
    })
    ;(blob.custom?.rows || []).forEach((l) => {
      const code = String(l.pcode || l.code || '').trim()
      if (code) entries.push({ ...common, code, price: sf(l.price) })
    })
    const customSet = new Set(
      (blob.custom?.rows || []).map((r) => `${String(r.pcode || r.code || '').trim()}|${String(r.label || '').trim()}|${sf(r.price)}`),
    )
    ;(blob.summary?.lines || []).forEach((l) => {
      const code = String(l.code || '').trim()
      if (!code) return
      const key = `${code}|${String(l.label || '').trim()}|${sf(l.val)}`
      if (customSet.has(key)) return // mirror of a custom row — skip
      entries.push({ ...common, code, price: sf(l.val) })
    })
  }
  return entries
}
