import { sf } from '../lib/format'
import type { BudgetRow } from './quoteDefaults'

// Budget-materials math. Marked-up figures always round UP to the nearest $5.
// `mp` is the markup as a fraction (e.g. 25% → 0.25).

export const ceil5 = (n: number) => Math.ceil(n / 5) * 5

/** One row's marked-up cost: qty × unitCost × (1 + markup), rounded up to $5. */
export const budgetRowMarkedUp = (r: BudgetRow, mp: number) => ceil5(sf(r.qty, 1) * sf(r.unitCost, 0) * (1 + mp))

/** Raw (pre-markup) hard cost across all rows. */
export const budgetHardTotal = (rows: BudgetRow[]) => rows.reduce((a, r) => a + sf(r.qty, 1) * sf(r.unitCost, 0), 0)

/** Marked-up total across all rows (each row rounded up to $5). */
export const budgetMarkedUpTotal = (rows: BudgetRow[], mp: number) => rows.reduce((a, r) => a + budgetRowMarkedUp(r, mp), 0)
