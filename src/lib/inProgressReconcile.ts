import { restFetch } from './restFetch'
import { baseOpp } from './opp'

// Reconcile the shared "In progress" board (open_quotes) when a quote is approved.
// The board is a manually-typed reminder list keyed by a free-text opportunity
// number; an approved quote usually means that line can come off the board. We
// match on the opportunity FAMILY (revision-insensitive, via baseOpp) so "26-257"
// on the board matches an approved "26-257B". The approver is always prompted —
// nothing is removed without a confirm — so matching can be generous.

export interface BoardMatch {
  id: string // open_quotes row id
  opportunity: string | null
  account: string | null
  description: string | null
  matchedOpp: string // the approved-quote opportunity that matched (for the prompt)
}

interface BoardRow {
  id: string
  opportunity: string | null
  account: string | null
  description: string | null
}

// Normalize to a comparable family key: trim, upper-case, strip trailing revision
// letters. Empty when there's nothing to compare.
const normOpp = (s?: string | null): string => baseOpp(String(s || '').trim().toUpperCase())

/**
 * Find In-Progress board rows whose opportunity family matches any of the given
 * (just-approved) opportunities. One board row is returned once, tagged with the
 * first approved opp that matched it. Fails soft — a read error yields no matches
 * so reconciliation never blocks or breaks an approval.
 */
export async function findBoardMatches(opportunities: Array<string | null | undefined>): Promise<BoardMatch[]> {
  const wanted = new Map<string, string>() // family key -> original approved opp label
  for (const o of opportunities) {
    const key = normOpp(o)
    if (key && !wanted.has(key)) wanted.set(key, String(o || '').trim())
  }
  if (!wanted.size) return []

  let rows: BoardRow[] = []
  try {
    rows = (await restFetch<BoardRow[]>('GET', 'open_quotes?select=id,opportunity,account,description')) || []
  } catch {
    return []
  }

  const matches: BoardMatch[] = []
  for (const r of rows) {
    const key = normOpp(r.opportunity)
    if (key && wanted.has(key)) {
      matches.push({ id: r.id, opportunity: r.opportunity, account: r.account, description: r.description, matchedOpp: wanted.get(key) as string })
    }
  }
  return matches
}

/** Remove the given board rows (by id) from the shared In-Progress list. Best-effort
 *  per row so one failure doesn't strand the rest; throws only if every delete fails. */
export async function removeBoardRows(ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return
  let ok = 0
  let lastErr: unknown = null
  for (const id of unique) {
    try {
      await restFetch('DELETE', `open_quotes?id=eq.${encodeURIComponent(id)}`)
      ok++
    } catch (e) {
      lastErr = e
    }
  }
  if (ok === 0 && lastErr) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
