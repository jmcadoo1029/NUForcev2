import { restFetch } from './restFetch'
import { baseOpp, revRank } from './opp'

// Comprehensive dashboard search over quotes: quote numbers, accounts, contacts,
// emails, and job numbers. Quote-number input is normalized so "23-123" and
// "23123" match the same opportunity. Read-only. Each sub-query fails soft (→ [])
// and results are merged + de-duped, so if the backend rejects a JSON-path filter
// the rest still returns.

export interface SearchQuote {
  id: string
  opportunity: string | null
  customer: string | null
  stage: string | null
  total: number | null
  rfq: string | null
  job_number: string | null
  po_number: string | null
}

export interface SearchResults {
  quotes: SearchQuote[]
  accounts: string[]
}

const COLS = 'id,opportunity,customer,stage,total,rfq,job_number,po_number'
const like = (term: string) => encodeURIComponent('*' + term + '*')

/**
 * Turn a bare quote-number query into the canonical "YY-NNN" form so 23123
 * finds 23-123. Only when there's no dash already and enough digits to split.
 */
export function normalizeOpp(term: string): string | null {
  if (term.includes('-')) return null
  const digits = term.replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 8) return null
  return digits.slice(0, 2) + '-' + digits.slice(2)
}

async function q(path: string): Promise<SearchQuote[]> {
  try {
    return (await restFetch<SearchQuote[]>('GET', path)) || []
  } catch {
    return []
  }
}

/** Fetch full search rows for a set of quote ids (for the test-type search results,
 *  whose candidate ids come from the code-report data). Preserves no order. */
export async function fetchQuotesByIds(ids: string[]): Promise<SearchQuote[]> {
  if (!ids.length) return []
  const inList = ids.slice(0, 50).map((i) => encodeURIComponent(i)).join(',')
  return q(`quotes?select=${COLS}&id=in.(${inList})&limit=50`)
}

export async function globalSearch(term: string): Promise<SearchResults> {
  const t = term.trim()
  if (t.length < 2) return { quotes: [], accounts: [] }
  const L = like(t)

  const batches: Promise<SearchQuote[]>[] = [
    // Top-level text columns — the reliable path (incl. Closed-Won job & PO numbers).
    q(`quotes?select=${COLS}&or=(opportunity.ilike.${L},customer.ilike.${L},rfq.ilike.${L},job_number.ilike.${L},po_number.ilike.${L})&order=updated_at.desc&limit=40`),
    // People / email / account / job & PO number inside the quote data blob — fails soft.
    q(`quotes?select=${COLS}&or=(data->qi->>email.ilike.${L},data->qi->>contact.ilike.${L},data->qi->>account.ilike.${L},data->wonInfo->>jobNum.ilike.${L},data->wonInfo->>poNum.ilike.${L})&order=updated_at.desc&limit=40`),
  ]
  // Quote-number normalization (23123 → 23-123).
  const norm = normalizeOpp(t)
  if (norm) batches.push(q(`quotes?select=${COLS}&opportunity=ilike.${like(norm)}&order=opportunity.desc&limit=40`))

  const rows = (await Promise.all(batches)).flat()

  const seen = new Set<string>()
  const quotes: SearchQuote[] = []
  rows.forEach((r) => {
    if (r && r.id && !seen.has(r.id)) {
      seen.add(r.id)
      quotes.push(r)
    }
  })

  // Collapse each opportunity family to its latest revision only, so the results
  // never tempt someone into opening (and close-winning) a superseded revision —
  // older revisions live in the quote's Revision History instead. Rank by the
  // trailing revision letter (base < A < B < …); ties keep the first (already
  // ordered updated_at.desc). A hard close-won guard on the quote page is the
  // real safety net; this just keeps the list clean.
  const revRankOf = (opp: string | null) => revRank((opp || '').slice(baseOpp(opp).length))
  const latestByFamily = new Map<string, SearchQuote>()
  quotes.forEach((r) => {
    const fam = baseOpp(r.opportunity)
    const cur = latestByFamily.get(fam)
    if (!cur || revRankOf(r.opportunity) > revRankOf(cur.opportunity)) latestByFamily.set(fam, r)
  })
  const keepIds = new Set(Array.from(latestByFamily.values()).map((r) => r.id))
  const collapsed = quotes.filter((r) => keepIds.has(r.id))

  // Distinct accounts among the matches whose name actually contains the term,
  // so typing an account name surfaces the account link (not every customer of
  // an opportunity match).
  const lc = t.toLowerCase()
  const accSet = new Set<string>()
  collapsed.forEach((r) => {
    if (r.customer && r.customer.toLowerCase().includes(lc)) accSet.add(r.customer)
  })

  return { quotes: collapsed.slice(0, 30), accounts: Array.from(accSet).sort().slice(0, 6) }
}
