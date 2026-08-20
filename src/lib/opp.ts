// Opportunity-number helpers, shared across the dashboard net-of-revisions math,
// the account view, and the revision-history view so every screen buckets a
// quote family identically.
//
// An opportunity like "26-257" identifies a family; revisions append a trailing
// letter ("26-257A", "26-257B", …). The base is the number with any trailing
// revision letters stripped. (Earlier there were two implementations — one
// stripping a single letter, one stripping all — which could bucket a
// multi-letter revision differently between views. This is the single source.)

/** Base opportunity for a family — the number with trailing revision letters removed. */
export function baseOpp(opp?: string | null): string {
  if (!opp) return ''
  return String(opp).replace(/[A-Z]+$/, '')
}

/** Rank a revision letter for "latest revision" picks: '' → -1, A → 1, B → 2, … */
export function revRank(rev?: string | null): number {
  const s = String(rev || '').trim().toUpperCase()
  return s.length === 0 ? -1 : s.charCodeAt(0) - 64
}

/** Four-digit year from an opp's "YY-" prefix (e.g. "26-257" → "2026"), else the fallback. */
export function yearOfOpp(opp?: string | null, fallback = 'Unknown'): string {
  const m = String(opp || '').match(/^(\d{2})-/)
  return m ? '20' + m[1] : fallback
}
