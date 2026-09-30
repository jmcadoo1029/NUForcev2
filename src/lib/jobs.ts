// Job-centric reads for the Job Search view. A "job number" is assigned when a
// quote is won; it lives in the top-level `job_number` column and, for some rows,
// only inside the data blob at data.wonInfo.jobNum. Several quotes/opportunities
// can share one job number, so these helpers group quotes by that number.
//
// Read-only (GET). restFetch auto-hides soft-deleted quotes, so deleted rows never
// appear here. Each sub-query fails soft where noted so one bad JSON-path filter
// doesn't blank the whole view.

import { restFetch } from './restFetch'
import { cleanSpecText } from './specText'
import { baseOpp, revRank } from './opp'

export interface JobQuote {
  id: string
  opportunity: string | null
  customer: string | null
  revision: string | null
  stage: string | null
  total: number | null
  updated_at: string | null
  created_at: string | null
  /** Cleaned Specifications text for this quote (column first, test-item specs as fallback). */
  spec: string
  /** The job number this quote resolved to. */
  jobNumber: string
}

export interface JobSummary {
  jobNumber: string
  /** Distinct customer name(s) across the job's quotes (first one shown; rest counted). */
  customer: string | null
  customerCount: number
  quoteCount: number
  latest: string | null
  /** Sum of the quotes' totals (rough — includes revisions, so treat as indicative). */
  value: number
}

// Columns for a quote row in a job context. Aliases pull the two blob paths:
//   jn = data.wonInfo.jobNum   (job number when only stored in the blob)
//   ts = data.ti.tiSpecs       (test-item specifications, fallback description)
const JOB_COLS =
  'id,opportunity,customer,revision,stage,total,updated_at,created_at,specifications,job_number,rfq,jn:data->wonInfo->>jobNum,ts:data->ti->>tiSpecs'

interface RawRow {
  id: string
  opportunity: string | null
  customer: string | null
  revision: string | null
  stage: string | null
  total: number | null
  updated_at: string | null
  created_at: string | null
  specifications: string | null
  job_number: string | null
  rfq: string | null
  jn: string | null
  ts: string | null
}

// Recognize a NU Labs job number written into the RFQ free-text. Deliberately strict
// so it doesn't grab unrelated RFQ numbers — it fires ONLY on:
//   • "NU Labs Job #12345" or "NU Labs Job 12345"  (the # is optional after "NU Labs Job")
//   • "Job#12345" or "Job #12345"                   (the # is REQUIRED without the NU Labs prefix)
// A bare "Job 12345" (no NU Labs, no #) is NOT treated as a job number. Digits are
// 3+. Used so historical quotes (whose only record of the job is this text) still
// show in Job Search before/without a data backfill.
const RFQ_JOB_RE = /(?:nu\s*labs\s*job\s*#?\s*|\bjob\s*#\s*)(\d{3,})/i
export function parseJobFromRfq(rfq?: string | null): string {
  const m = String(rfq || '').match(RFQ_JOB_RE)
  return m ? m[1] : ''
}

/** The job number a row belongs to: the column wins, else the blob copy, else the
 *  number written into the RFQ text (historical quotes). Trimmed. */
function resolveJob(r: { job_number?: string | null; jn?: string | null; rfq?: string | null }): string {
  return String(r.job_number || r.jn || '').trim() || parseJobFromRfq(r.rfq)
}

/** A short spec description for a quote: the Specifications column, else test-item specs. */
function specOf(r: RawRow): string {
  const raw = (r.specifications || '').trim() || (r.ts || '').trim()
  return raw ? cleanSpecText(raw) : ''
}

async function getRows(path: string): Promise<RawRow[]> {
  try {
    return (await restFetch<RawRow[]>('GET', path)) || []
  } catch {
    return []
  }
}

/** Order quotes within a job: by opportunity family, then revision letter, newest family first. */
function sortJobQuotes(a: JobQuote, b: JobQuote): number {
  const ba = baseOpp(a.opportunity), bb = baseOpp(b.opportunity)
  if (ba !== bb) return bb.localeCompare(ba) // newer opportunity numbers first
  return revRank(a.revision) - revRank(b.revision) // base, then A, B, …
}

/** Every quote on a given job number (exact, case-insensitive), with cleaned spec text. */
export async function fetchJobQuotes(jobNumber: string): Promise<JobQuote[]> {
  const j = jobNumber.trim()
  if (!j) return []
  const enc = encodeURIComponent(j) // ilike with no wildcards = case-insensitive exact match
  const encLike = encodeURIComponent('*' + j + '*')
  // Match the column, the blob copy, or the job number written into the RFQ text.
  // Three queries (one per source) merged + de-duped, so a rejected JSON-path filter
  // still returns the column matches. The RFQ query is a loose contains-match, so we
  // re-check each row below (resolveJob must equal j) to drop coincidental hits.
  const [byCol, byBlob, byRfq] = await Promise.all([
    getRows(`quotes?select=${JOB_COLS}&job_number=ilike.${enc}&order=opportunity.desc&limit=300`),
    getRows(`quotes?select=${JOB_COLS}&data->wonInfo->>jobNum=ilike.${enc}&order=opportunity.desc&limit=300`),
    getRows(`quotes?select=${JOB_COLS}&rfq=ilike.${encLike}&order=opportunity.desc&limit=300`),
  ])
  const want = j.toLowerCase()
  const seen = new Set<string>()
  const out: JobQuote[] = []
  for (const r of [...byCol, ...byBlob, ...byRfq]) {
    if (!r?.id || seen.has(r.id)) continue
    // Keep only rows that truly resolve to this job (guards RFQ contains-matches).
    if (resolveJob(r).toLowerCase() !== want) continue
    seen.add(r.id)
    out.push({
      id: r.id,
      opportunity: r.opportunity,
      customer: r.customer,
      revision: r.revision,
      stage: r.stage,
      total: r.total,
      updated_at: r.updated_at,
      created_at: r.created_at,
      spec: specOf(r),
      jobNumber: resolveJob(r) || j,
    })
  }
  return out.sort(sortJobQuotes)
}

// Group raw rows into per-job summaries (customer, counts, latest date, rough value).
function summarize(rows: RawRow[]): JobSummary[] {
  const map = new Map<string, { customers: Set<string>; count: number; latest: string | null; value: number; firstCustomer: string | null }>()
  for (const r of rows) {
    const job = resolveJob(r)
    if (!job) continue
    let g = map.get(job)
    if (!g) { g = { customers: new Set(), count: 0, latest: null, value: 0, firstCustomer: null }; map.set(job, g) }
    g.count += 1
    g.value += Number(r.total) || 0
    const c = (r.customer || '').trim()
    if (c) { g.customers.add(c); if (!g.firstCustomer) g.firstCustomer = c }
    const t = r.updated_at || r.created_at || null
    if (t && (!g.latest || t > g.latest)) g.latest = t
  }
  return Array.from(map.entries())
    .map(([jobNumber, g]) => ({
      jobNumber,
      customer: g.firstCustomer,
      customerCount: g.customers.size,
      quoteCount: g.count,
      latest: g.latest,
      value: g.value,
    }))
    .sort((a, b) => (b.latest || '').localeCompare(a.latest || ''))
}

/** Most recently touched jobs (for the default browse list). */
export async function fetchRecentJobs(limit = 30): Promise<JobSummary[]> {
  // Pull recent rows that carry a job number from the column, the blob copy, or the
  // RFQ text ("…Job #NNN…"), then group. The RFQ source brings in historical quotes
  // that were never close-won, so open/lost jobs show up too. summarize() drops any
  // row whose RFQ doesn't actually resolve to a job number.
  const jobLike = encodeURIComponent('*job*')
  const [byCol, byBlob, byRfq] = await Promise.all([
    getRows(`quotes?select=${JOB_COLS}&job_number=not.is.null&order=updated_at.desc&limit=400`),
    getRows(`quotes?select=${JOB_COLS}&data->wonInfo->>jobNum=not.is.null&order=updated_at.desc&limit=400`),
    getRows(`quotes?select=${JOB_COLS}&rfq=ilike.${jobLike}&order=updated_at.desc&limit=400`),
  ])
  const seen = new Set<string>()
  const merged = [...byCol, ...byBlob, ...byRfq].filter((r) => r?.id && !seen.has(r.id) && seen.add(r.id))
  // Show the highest job numbers first (newest work). Natural/numeric compare so
  // "1200" sorts above "999", and any alphanumeric prefixes still order sensibly.
  return summarize(merged)
    .sort((a, b) => b.jobNumber.localeCompare(a.jobNumber, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, limit)
}

/** Jobs matching a term — by job number, customer, or opportunity/quote number. Grouped. */
export async function searchJobs(term: string): Promise<JobSummary[]> {
  const t = term.trim()
  if (t.length < 1) return []
  const like = encodeURIComponent('*' + t + '*')
  // Any row whose job number (column, blob, or RFQ text), customer, or opportunity
  // matches; then group by job number so a customer/opportunity hit still surfaces the
  // whole job. summarize() keeps only rows that actually resolve to a job number.
  const rows = await getRows(
    `quotes?select=${JOB_COLS}&or=(job_number.ilike.${like},data->wonInfo->>jobNum.ilike.${like},rfq.ilike.${like},customer.ilike.${like},opportunity.ilike.${like})&order=updated_at.desc&limit=400`,
  )
  return summarize(rows.filter((r) => resolveJob(r)))
}
