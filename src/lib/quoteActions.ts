import { restFetch } from './restFetch'

// Read-only access to a quote's action state — its open flag and its send /
// follow-up history — so the quote page can reflect what the dashboard cards
// (FlaggedQuotes / FollowUps / ReadyToSend) show. Writing these is Phase 7; the
// quote-side toggles are preview. Each read fails soft so a missing/renamed
// table never breaks the quote page.

export interface QuoteFlag {
  id: string
  note: string | null
  flagged_by: string | null
  flagged_at: string | null
}

export interface QuoteSend {
  id: string
  sent_at: string | null
  sent_by: string | null
  followup_again_at: string | null
  followed_up: boolean | null
}

export interface QuoteActionsState {
  flag: QuoteFlag | null
  sends: QuoteSend[]
}

async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return (await p) || []
  } catch {
    return []
  }
}

// ── Writes (Flag pilot) ─────────────────────────────────────────────────────
// The first real write path, ported from Classic. quote_flags has a UNIQUE
// constraint on quote_id, so flagging is an UPSERT (on_conflict=quote_id) that
// re-activates a previously-resolved row; unflagging PATCHes it resolved. Callers
// gate on WRITES_ENABLED — these functions issue the write unconditionally.

export interface FlagInput {
  quoteId: string
  opportunity?: string | null
  customer?: string | null
  note?: string
  by: string
}

/** Flag a quote (insert-or-reactivate). Returns the live flag row, or null. */
export async function flagQuote(input: FlagInput): Promise<QuoteFlag | null> {
  const rows = await restFetch<QuoteFlag[]>('POST', 'quote_flags?on_conflict=quote_id', {
    body: {
      quote_id: input.quoteId,
      opportunity: input.opportunity ?? null,
      customer: input.customer ?? null,
      flagged_by: input.by,
      flagged_at: new Date().toISOString(),
      note: (input.note || '').trim() || null,
      resolved: false,
      resolved_by: null,
      resolved_at: null,
    },
    returnRepresentation: true,
    upsert: true,
  })
  return rows?.[0] || null
}

export interface ChatterEntry { by: string; at: string; msg: string }

/**
 * Append a chatter entry to the quote's data.chatterEntries. Fetches the current
 * data blob, appends, and PATCHes it back — merging so nothing else in the blob
 * is disturbed. Returns the new full entry list. Callers gate on WRITES_ENABLED.
 */
export async function appendChatter(quoteId: string, entry: ChatterEntry): Promise<ChatterEntry[]> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?id=eq.${encodeURIComponent(quoteId)}&select=data&limit=1`)
  const data = rows?.[0]?.data || {}
  const prev: ChatterEntry[] = Array.isArray(data.chatterEntries) ? data.chatterEntries : []
  const next = [...prev, entry]
  await restFetch('PATCH', `quotes?id=eq.${encodeURIComponent(quoteId)}`, { body: { data: { ...data, chatterEntries: next }, updated_at: new Date().toISOString() } })
  return next
}

/** Resolve (remove) an active flag by its row id. */
export async function unflagQuote(flagId: string, by: string): Promise<void> {
  await restFetch('PATCH', `quote_flags?id=eq.${encodeURIComponent(flagId)}`, {
    body: { resolved: true, resolved_by: by, resolved_at: new Date().toISOString() },
  })
}

export async function fetchQuoteActions(quoteId: string): Promise<QuoteActionsState> {
  const id = encodeURIComponent(quoteId)
  const [flags, sends] = await Promise.all([
    safe(restFetch<QuoteFlag[]>('GET', `quote_flags?select=id,note,flagged_by,flagged_at&quote_id=eq.${id}&resolved=eq.false&order=flagged_at.desc&limit=1`)),
    safe(restFetch<QuoteSend[]>('GET', `follow_ups?select=id,sent_at,sent_by,followup_again_at,followed_up&quote_id=eq.${id}&sent_by=neq.manually_dismissed&or=(voided.is.null,voided.eq.false)&order=sent_at.desc`)),
  ])
  return { flag: flags[0] || null, sends }
}
