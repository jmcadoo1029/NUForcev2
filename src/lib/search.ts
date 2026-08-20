import { restFetch } from './restFetch'

// Comprehensive dashboard search over quotes: quote numbers, accounts, contacts,
// and emails. Quote-number input is normalized so "23-123" and "23123" match the
// same opportunity. Read-only. Each sub-query fails soft (→ []) and results are
// merged + de-duped, so if the backend rejects a JSON-path filter the rest still
// returns.

export interface SearchQuote {
  id: string
  opportunity: string | null
  customer: string | null
  stage: string | null
  total: number | null
  rfq: string | null
}

export interface SearchResults {
  quotes: SearchQuote[]
  accounts: string[]
}

const COLS = 'id,opportunity,customer,stage,total,rfq'
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

export async function globalSearch(term: string): Promise<SearchResults> {
  const t = term.trim()
  if (t.length < 2) return { quotes: [], accounts: [] }
  const L = like(t)

  const batches: Promise<SearchQuote[]>[] = [
    // Top-level text columns — the reliable path.
    q(`quotes?select=${COLS}&or=(opportunity.ilike.${L},customer.ilike.${L},rfq.ilike.${L})&order=updated_at.desc&limit=40`),
    // People / email / account inside the quote data blob — fails soft.
    q(`quotes?select=${COLS}&or=(data->qi->>email.ilike.${L},data->qi->>contact.ilike.${L},data->qi->>account.ilike.${L})&order=updated_at.desc&limit=40`),
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

  // Distinct accounts among the matches whose name actually contains the term,
  // so typing an account name surfaces the account link (not every customer of
  // an opportunity match).
  const lc = t.toLowerCase()
  const accSet = new Set<string>()
  quotes.forEach((r) => {
    if (r.customer && r.customer.toLowerCase().includes(lc)) accSet.add(r.customer)
  })

  return { quotes: quotes.slice(0, 30), accounts: Array.from(accSet).sort().slice(0, 6) }
}
