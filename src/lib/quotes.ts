// Read-only quote data access. All reads go through the direct-PostgREST client
// (restFetch). No writes during the V2 verification phase.

import { restFetch } from './restFetch'
import { baseOpp } from './opp'
import type { QuoteData } from '../data/quoteModel'

export interface QuoteRow {
  id: string
  opportunity: string | null
  customer: string | null
  rfq?: string | null
  revision: string | null
  stage: string | null
  total: number | null
  approval_status?: string | null
  won_approval_status?: string | null
  source?: string | null
  updated_at?: string | null
  created_at?: string | null
  // Canonical free-text columns (shared with Classic). The data blob also carries
  // copies under data.ti, but the columns are the source of truth on load — the
  // shared backend can normalize the blob copies away.
  notes?: string | null
  specifications?: string | null
  data?: QuoteData
}

const LIST_COLS = 'id,opportunity,customer,revision,stage,total,updated_at'
const FULL_COLS =
  'id,opportunity,customer,rfq,revision,stage,total,approval_status,won_approval_status,source,updated_at,created_at,notes,specifications,data'

/** Most recently updated quotes (for the dashboard list). */
export async function fetchRecentQuotes(limit = 15): Promise<QuoteRow[]> {
  return restFetch<QuoteRow[]>(
    'GET',
    `quotes?select=${LIST_COLS}&order=updated_at.desc&limit=${limit}`,
  )
}

/** One full quote by row id, or null if not found. */
export async function fetchQuoteById(id: string): Promise<QuoteRow | null> {
  const rows = await restFetch<QuoteRow[]>(
    'GET',
    `quotes?select=${FULL_COLS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  return rows[0] || null
}

export interface RevisionRow {
  id: string
  opportunity: string | null
  revision: string | null
  stage: string | null
  total: number | null
  updated_at?: string | null
  created_at?: string | null
  approval_status?: string | null
  won_approval_status?: string | null
  // Approval decision time, pulled from the data blob (data.approval.decidedAt)
  // via a PostgREST JSON-path alias — used to detect an inherited approval.
  decidedAt?: string | null
}

/**
 * All revisions in a quote's family. Revisions share a base opportunity number
 * and differ by a trailing rev letter (26-257, 26-257A, 26-257B…), so we match
 * the base as a prefix and keep only the exact base or base+letters.
 */
export async function fetchRevisions(opportunity: string): Promise<RevisionRow[]> {
  const base = baseOpp(opportunity)
  if (!base) return []
  const rows = await restFetch<RevisionRow[]>(
    'GET',
    `quotes?select=id,opportunity,revision,stage,total,updated_at,created_at,approval_status,won_approval_status,decidedAt:data->approval->>decidedAt&opportunity=like.${encodeURIComponent(base)}*&order=opportunity.asc&limit=100`,
  )
  return rows.filter((r) => {
    const o = r.opportunity || ''
    if (o === base) return true
    const suffix = o.slice(base.length)
    return /^[A-Z]+$/.test(suffix)
  })
}

/** Just the `data` blob for one revision, by row id (for revision diffing). */
export async function fetchQuoteData(id: string): Promise<QuoteData | null> {
  const rows = await restFetch<{ data?: QuoteData }[]>(
    'GET',
    `quotes?select=id,data&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  return rows[0]?.data ?? null
}

/** One full quote by opportunity / quote number (e.g. "26-257"). Newest first. */
export async function fetchQuoteByOpp(opp: string): Promise<QuoteRow | null> {
  const rows = await restFetch<QuoteRow[]>(
    'GET',
    `quotes?select=${FULL_COLS}&opportunity=eq.${encodeURIComponent(opp)}&order=updated_at.desc&limit=1`,
  )
  return rows[0] || null
}

/**
 * Resolve a /quote/:key URL param to a quote. Pure-integer keys are row ids
 * (used by links that only carry a quote_id — approvals, follow-ups); anything
 * else is treated as a quote number so the URL reads like the form (26-257).
 */
export async function fetchQuoteByKey(key: string): Promise<QuoteRow | null> {
  return /^\d+$/.test(key) ? fetchQuoteById(key) : fetchQuoteByOpp(key)
}
