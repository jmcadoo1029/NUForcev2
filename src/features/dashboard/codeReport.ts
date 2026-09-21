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
  createdAt: string | null // quotes.created_at — real creation for NUForce quotes; import date for source='salesforce'
  wonDate: string | null // won_date (or data.wonInfo.wonDate) when Closed Won, else null
  source: string | null // 'salesforce' for imported quotes; null/other for NUForce-created
}

interface Raw {
  id: string
  opportunity?: string | null
  customer?: string | null
  stage?: string | null
  won_date?: string | null
  created_at?: string | null
  source?: string | null
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

// Session cache — the all-history pull is heavy and several dashboard widgets
// (deep dive, win-time) want the same data. Memoize the promise so it's fetched
// once; drop it on failure so a later call can retry.
let _entriesCache: Promise<CodeEntry[]> | null = null
export function fetchCodeEntries(): Promise<CodeEntry[]> {
  if (!_entriesCache) {
    _entriesCache = _fetchCodeEntries().catch((e) => { _entriesCache = null; throw e })
  }
  return _entriesCache
}

async function _fetchCodeEntries(): Promise<CodeEntry[]> {
  const cols = 'id,opportunity,customer,total,stage,won_date,created_at,source,data'
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
    const common = {
      quoteId: q.id, opp: q.opportunity || '', customer: q.customer || blob.qi?.account || '(Unknown)', stage, year,
      createdAt: q.created_at || null,
      wonDate: isWon ? (q.won_date || blob.wonInfo?.wonDate || null) : null,
      source: q.source || null,
    }

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
