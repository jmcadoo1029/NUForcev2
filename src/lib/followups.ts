import { restFetch } from './restFetch'

// Follow-up + mark-as-sent writes, ported one-to-one from Classic so V2 drives
// the exact same follow-up timeline. Three actions:
//
//   • markQuoteSent  — a send inserts a follow_ups row. That row IS the "sent"
//     record (the Sent badge reads its sent_at) AND it seeds the follow-up
//     timeline: with no followup_again_at, the row first becomes due 30 days
//     after sent_at (see useFollowUps.isDue). Classic did the same on "Mark as
//     Sent"; V2 fires it as the success side effect of an actual send.
//   • rescheduleFollowUp — "I followed up" / the follow-up email went out. Resets
//     the clock: keep followed_up=false but push followup_again_at to +90 days so
//     the row goes dormant and returns then. This is Classic's cadence verbatim.
//   • stopFollowUp — done chasing this one; followed_up=true, clear the reminder.
//
// All callers gate on WRITES_ENABLED.

const FIRST_FOLLOWUP_DAYS = 30 // informational: enforced by useFollowUps, not stored
const RESCHEDULE_DAYS = 90 // each subsequent nudge, per Classic

export interface MarkSentInput {
  quoteId: string
  opportunity: string
  customer: string
  by: string
}

/**
 * Record a send: insert a follow_ups row. Returns its sent_at (server default)
 * so the caller can show the Sent badge immediately. Mirrors Classic's
 * "Mark as Sent" insert exactly (quote_id, opportunity, customer, sent_by).
 */
export async function markQuoteSent(input: MarkSentInput): Promise<{ id: string; sent_at: string | null } | null> {
  const rows = await restFetch<Array<{ id: string; sent_at: string | null }>>(
    'POST',
    'follow_ups?select=id,sent_at',
    {
      body: {
        quote_id: input.quoteId,
        opportunity: input.opportunity,
        customer: input.customer,
        sent_by: input.by,
      },
      returnRepresentation: true,
    },
  )
  return rows?.[0] || null
}

/** The latest non-voided send time for a quote, or null. Drives the Sent badge. */
export async function fetchLastSentAt(quoteId: string): Promise<string | null> {
  try {
    const rows = await restFetch<Array<{ sent_at: string | null }>>(
      'GET',
      `follow_ups?select=sent_at&quote_id=eq.${encodeURIComponent(quoteId)}&sent_by=neq.salesforce_import&or=(voided.is.null,voided.eq.false)&order=sent_at.desc&limit=1`,
    )
    return rows?.[0]?.sent_at || null
  } catch {
    return null
  }
}

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * A follow-up happened (email sent, or manually marked). Resets the clock to
 * +90 days: the row stays followed_up=false but goes dormant until then. Classic
 * markFollowedUp(scheduleAgain=true).
 */
export async function rescheduleFollowUp(fuId: string, by: string): Promise<void> {
  await restFetch('PATCH', `follow_ups?id=eq.${encodeURIComponent(fuId)}`, {
    body: {
      followed_up: false,
      followed_up_at: new Date().toISOString(),
      followed_up_by: by,
      followup_again_at: plusDays(RESCHEDULE_DAYS),
    },
  })
}

/**
 * Stop following up on this quote for good: followed_up=true, clear any future
 * reminder. Classic markFollowedUp(scheduleAgain=false).
 */
export async function stopFollowUp(fuId: string, by: string): Promise<void> {
  await restFetch('PATCH', `follow_ups?id=eq.${encodeURIComponent(fuId)}`, {
    body: {
      followed_up: true,
      followed_up_at: new Date().toISOString(),
      followed_up_by: by,
      followup_again_at: null,
    },
  })
}

export { FIRST_FOLLOWUP_DAYS, RESCHEDULE_DAYS }
