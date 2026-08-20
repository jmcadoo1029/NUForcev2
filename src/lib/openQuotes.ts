import { restFetch } from './restFetch'

// Write layer for the shared "In progress" board (open_quotes). The board is a
// small, manually-ordered, team-wide list, so Save reconciles the whole board in
// one pass: delete rows the user removed, insert new ones, and update the rest
// with their new position (sort_order = row index). Callers gate on
// WRITES_ENABLED. Only the known columns are written (opportunity, account,
// description, sort_order) so it stays robust to the table's exact schema.

export interface BoardInput {
  id?: string // present = existing row; absent = new
  opportunity: string
  account: string
  description: string
}

const clean = (r: BoardInput) => ({
  opportunity: r.opportunity.trim() || null,
  account: r.account.trim() || null,
  description: r.description.trim() || null,
})

const isEmpty = (r: BoardInput) => !r.opportunity.trim() && !r.account.trim() && !r.description.trim()

/**
 * Persist the board to match `rows` exactly. `originalIds` is the set of row ids
 * that were loaded, so anything missing from `rows` gets deleted. Empty new rows
 * are skipped (not inserted). Reorder is captured by sort_order = index.
 */
export async function saveBoard(rows: BoardInput[], originalIds: string[]): Promise<void> {
  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string))

  // Deletes first (rows removed in the editor).
  for (const id of originalIds) {
    if (!keptIds.has(id)) await restFetch('DELETE', `open_quotes?id=eq.${encodeURIComponent(id)}`)
  }

  // Upserts, in board order.
  let order = 0
  for (const r of rows) {
    if (!r.id && isEmpty(r)) continue // don't persist blank new rows
    const body = { ...clean(r), sort_order: order }
    if (r.id) await restFetch('PATCH', `open_quotes?id=eq.${encodeURIComponent(r.id)}`, { body })
    else await restFetch('POST', 'open_quotes', { body })
    order++
  }
}
