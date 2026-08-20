// Small formatting/parsing helpers, ported from the classic app's utilities.

/** Safe float: parse a value to a number, falling back to `dflt`. */
export function sf(v: unknown, dflt = 0): number {
  if (typeof v === 'number') return isNaN(v) ? dflt : v
  const n = parseFloat(String(v ?? '').replace(/[,$]/g, ''))
  return isNaN(n) ? dflt : n
}

/** Stringify for display: '' for null/undefined, else String(v). */
export function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}

/** US dollar formatting, whole dollars. */
export function money(n: number): string {
  return '$' + (isNaN(n) || n == null ? 0 : Math.round(n)).toLocaleString()
}

/** Compact dollars for tight spaces: $1.02M, $291K, $840. */
export function moneyShort(n: number): string {
  const v = isNaN(n) || n == null ? 0 : n
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1_000) return '$' + Math.round(v / 1_000) + 'K'
  return '$' + Math.round(v)
}

/** Short human date from an ISO string (or '' if missing/invalid). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
