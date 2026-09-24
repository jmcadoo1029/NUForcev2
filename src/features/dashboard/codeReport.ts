import { restFetch } from '../../lib/restFetch'
import { sf } from '../../lib/format'
import { yearOfOpp, baseOpp } from '../../lib/opp'
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

// ── Test-type search (powers the global search bar) ───────────────────────────
// Natural-language test terms → product code(s), so typing a test name finds the
// quotes that have it — and several names AND together ("noise temperature"). A
// quote satisfies a term if it has ANY code in that term's set (bare "shock" =
// medium OR light OR other). Tunable: adjust a phrase list to change what a word
// matches. Longest phrases win, so "salt fog" beats "salt", "mw shock" beats "shock".
const TEST_ALIASES: Array<{ phrases: string[]; codes: string[] }> = [
  { phrases: ['ab/sb noise', 'structureborne', 'structure borne', 'airborne noise'], codes: ['12'] },
  { phrases: ['noise'], codes: ['11'] },
  { phrases: ['power quality', 'dc magnetics', 'dc mag', 'susceptibility', 'emissions', 'emi', 'pq', 'emc'], codes: ['51'] },
  { phrases: ['temperature', 'thermal', 'humidity', 't&h', 'temp'], codes: ['53'] },
  { phrases: ['environmental stress', 'ess'], codes: ['54'] },
  { phrases: ['salt fog', 'salt spray', 'salt'], codes: ['55'] },
  { phrases: ['altitude'], codes: ['56'] },
  { phrases: ['acceleration'], codes: ['57'] },
  { phrases: ['submersion', 'immersion', 'drip', 'spray'], codes: ['58'] },
  { phrases: ['insulation resistance', 'insulation'], codes: ['59'] },
  { phrases: ['medium weight shock', 'mw shock'], codes: ['91'] },
  { phrases: ['lightweight shock', 'light weight shock', 'lw shock'], codes: ['92'] },
  { phrases: ['shock'], codes: ['91', '92', '52'] },
  { phrases: ['inclination'], codes: ['93'] },
  { phrases: ['high frequency vibration', 'vibration', 'vibe', 'hfv'], codes: ['94'] },
  { phrases: ['hydrostatic'], codes: ['95'] },
  { phrases: ['high speed video'], codes: ['32'] },
  { phrases: ['instrumentation'], codes: ['33'] },
]

export interface TestQuery {
  codeSets: string[][] // each set: the term is met by ANY code in it; ALL sets must be met (AND)
  labels: string[] // friendly names of what matched, for the results header
  leftover: string[] // remaining word tokens (≥2 chars) → matched against customer / quote number
}

/** Parse a raw search string into test-code requirements + leftover text tokens. */
export function parseTestQuery(term: string): TestQuery {
  let s = ' ' + String(term || '').toLowerCase().replace(/[,/]/g, ' ').replace(/\b(and|with|plus|both)\b/g, ' ').replace(/\s+/g, ' ') + ' '
  const codeSets: string[][] = []
  const labels: string[] = []
  const phrases = TEST_ALIASES.flatMap((a) => a.phrases.map((p) => ({ p, codes: a.codes }))).sort((x, y) => y.p.length - x.p.length)
  for (const { p, codes } of phrases) {
    const pad = ' ' + p + ' '
    if (s.includes(pad)) { codeSets.push(codes); labels.push(codeReportLabel(codes[0]) || p); s = s.replace(pad, ' ') }
  }
  for (const m of String(term || '').matchAll(/\b(\d{2})\b/g)) {
    if (CODE_REPORT_LABELS[m[1]]) { codeSets.push([m[1]]); labels.push(codeReportLabel(m[1])) }
  }
  const leftover = s.trim().split(/\s+/).filter((t) => t.length >= 2)
  return { codeSets, labels, leftover }
}

function revRankOfOpp(opp: string): number {
  const s = (opp || '').toUpperCase().match(/[A-Z]+$/)?.[0] || ''
  let n = 0
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 65 || c > 90) return 0; n = n * 26 + (c - 64) }
  return n
}

export interface TestQuoteHit { id: string; opp: string }

/** Quotes (latest revision per family) whose line-item codes satisfy every code set,
 *  and whose customer/number contains each leftover token. Newest quote number first. */
export function quotesMatchingTests(entries: CodeEntry[], tq: TestQuery): TestQuoteHit[] {
  if (!tq.codeSets.length) return []
  const byQuote = new Map<string, { id: string; opp: string; customer: string; codes: Set<string> }>()
  for (const e of entries) {
    const g = byQuote.get(e.quoteId) || { id: e.quoteId, opp: e.opp, customer: e.customer, codes: new Set<string>() }
    g.codes.add(e.code)
    byQuote.set(e.quoteId, g)
  }
  const byFamily = new Map<string, { id: string; opp: string; customer: string; codes: Set<string> }>()
  for (const g of byQuote.values()) {
    const base = baseOpp(g.opp) || g.opp
    const cur = byFamily.get(base)
    if (!cur || revRankOfOpp(g.opp) > revRankOfOpp(cur.opp)) byFamily.set(base, g)
  }
  return Array.from(byFamily.values())
    .filter((g) => tq.codeSets.every((set) => set.some((c) => g.codes.has(c))))
    .filter((g) => tq.leftover.every((t) => (g.customer + ' ' + g.opp).toLowerCase().includes(t)))
    .sort((a, b) => (b.opp || '').localeCompare(a.opp || '', undefined, { numeric: true }))
    .map((g) => ({ id: g.id, opp: g.opp }))
}

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
