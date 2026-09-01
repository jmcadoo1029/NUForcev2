import { restFetchAll } from './restFetch'
import { codeLabel } from '../data/constants'

// Standards → product-code miner. Learns the mapping from NUForce's OWN history:
// for every quote, the product codes on its line items are the "answer key" and the
// specifications/notes text is the "question." We pull the standard references out
// of the text (MIL-STD-461, ASTM B117, …) and tally which codes each standard tends
// to appear alongside. The result is a table weighted by how often you've actually
// made each call — no manual entry — and it's what the offline test-plan reader will
// use to turn a customer's cited standards into candidate line items.

export interface CodeTally { code: string; label: string; count: number; confidence: number }
export interface StandardRow { standard: string; quotes: number; codes: CodeTally[] }
export interface MinerResult {
  generatedAt: string
  quotesScanned: number
  quotesWithStandards: number
  standards: StandardRow[]
}

// Raw reference patterns. Case-insensitive; each capture is normalized below.
const PATTERNS: RegExp[] = [
  /MIL-(?:STD|DTL|PRF|HDBK|C|S|W|T|F|A|I|G|P|R|B|L)-\d+[A-Z]?/gi, // MIL-STD-461G, MIL-DTL-38999
  /ASTM\s+[A-Z]\d+(?:-\d+)?/gi, // ASTM B117, ASTM B117-19
  /(?:RTCA\s+)?DO-160[A-Z]?/gi, // DO-160G
  /IEC\s+\d{4,5}(?:-\d+)?/gi, // IEC 60068-2-6
  /ISO\s+\d{3,6}/gi,
  /SAE\s+(?:J|AS|ARP)\d+/gi,
  /IEEE\s+\d+/gi,
  /DEF\s*STAN\s*\d+-\d+/gi,
  /NAVMAT\s*P?-?\d+/gi,
  /\b[RC][ES]\d{3}\b/gi, // EMI emission/susceptibility: RE102, CE102, RS103, CS114
  /Method\s+\d{3}(?:\.\d)?/gi, // MIL-STD-810 methods: Method 514.8
]

/** Canonicalize a raw reference to a stable token: uppercase, single-spaced, with
 *  the trailing revision letter and ASTM year suffix stripped so revisions fold
 *  together (MIL-STD-461G and MIL-STD-461F both become MIL-STD-461). */
function normStandard(tok: string): string {
  let s = tok.toUpperCase().replace(/\s+/g, ' ').trim()
  s = s.replace(/^RTCA DO/, 'DO') // fold "RTCA DO-160" → "DO-160"
  s = s.replace(/^(ASTM [A-Z]\d+)-\d+$/, '$1') // drop ASTM year suffix
  s = s.replace(/(\d)[A-Z]$/, '$1') // drop a trailing revision letter after a digit
  return s
}

/** Pull every distinct standard token out of a blob of specification/notes text. */
export function extractStandards(text: string): Set<string> {
  const out = new Set<string>()
  if (!text) return out
  for (const re of PATTERNS) {
    const matches = text.match(re)
    if (matches) for (const m of matches) { const n = normStandard(m); if (n) out.add(n) }
  }
  return out
}

/** Distinct product codes on a quote's line items (picker lines preferred, legacy
 *  summary lines as fallback; union to be inclusive). */
function extractCodes(pl: unknown, sl: unknown): Set<string> {
  const out = new Set<string>()
  const take = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const el of arr) {
      const c = (el as { code?: unknown })?.code
      if (c != null && String(c).trim()) out.add(String(c).trim())
    }
  }
  take(pl)
  take(sl)
  return out
}

interface Row {
  id: string
  specifications: string | null
  sp: string | null // data.ti.tiSpecs
  nt: string | null // data.ti.tiNotes
  pl: unknown // data.pickerLines
  sl: unknown // data.summary.lines
}

/**
 * Scan every quote and build the standards→code correlation table. `onProgress`
 * (optional) is called with the running count of quotes scanned. Reads are paged
 * past the 1000-row cap. Runs against the live DB with the user's session.
 */
export async function mineStandards(onProgress?: (n: number) => void): Promise<MinerResult> {
  const rows = await restFetchAll<Row>(
    'quotes?select=id,specifications,sp:data->ti->>tiSpecs,nt:data->ti->>tiNotes,pl:data->pickerLines,sl:data->summary->lines&order=id',
  )
  const stdCodes = new Map<string, Map<string, number>>() // standard → (code → co-occurrence count)
  const stdQuotes = new Map<string, number>() // standard → # quotes it appears in
  let withStandards = 0

  rows.forEach((r, i) => {
    const text = [r.specifications, r.sp, r.nt].filter(Boolean).join('\n')
    const stds = extractStandards(text)
    if (stds.size === 0) return
    const codes = extractCodes(r.pl, r.sl)
    withStandards++
    for (const s of stds) {
      stdQuotes.set(s, (stdQuotes.get(s) || 0) + 1)
      const m = stdCodes.get(s) || new Map<string, number>()
      for (const c of codes) m.set(c, (m.get(c) || 0) + 1)
      stdCodes.set(s, m)
    }
    if (onProgress && i % 200 === 0) onProgress(i)
  })
  if (onProgress) onProgress(rows.length)

  const standards: StandardRow[] = Array.from(stdQuotes.entries())
    .map(([standard, quotes]) => {
      const codes: CodeTally[] = Array.from((stdCodes.get(standard) || new Map()).entries())
        .map(([code, count]) => ({ code, label: codeLabel(code) || `Code ${code}`, count, confidence: quotes ? Math.round((count / quotes) * 100) / 100 : 0 }))
        .sort((a, b) => b.count - a.count)
      return { standard, quotes, codes }
    })
    .sort((a, b) => b.quotes - a.quotes || a.standard.localeCompare(b.standard))

  return { generatedAt: new Date().toISOString(), quotesScanned: rows.length, quotesWithStandards: withStandards, standards }
}
