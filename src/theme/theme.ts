// Per-user theme preference (Light / Dark / Auto).
//
// Only color VALUES change between themes — every feature, screen, and control is
// identical in both. The choice is stored per browser in localStorage and applied
// by setting `data-theme` on <html>, which tokens.css reads:
//   - "light"  → forces the light palette (default; overrides an OS set to dark)
//   - "dark"   → forces the Ink dark palette (overrides an OS set to light)
//   - "auto"   → no attribute; follows the OS (prefers-color-scheme)
//
// A tiny inline script in index.html applies the stored choice BEFORE first paint
// (so there's no light flash on a dark load); this module is the source of truth
// the toggle uses at runtime.

export type ThemePref = 'light' | 'dark' | 'auto'

const KEY = 'nuforce-theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch { /* storage blocked — fall through to default */ }
  return 'light' // default: Light
}

// Reflect a preference onto <html data-theme> so tokens.css swaps the palette.
export function applyThemePref(pref: ThemePref): void {
  const el = document.documentElement
  if (pref === 'auto') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', pref)
}

export function setThemePref(pref: ThemePref): void {
  try { localStorage.setItem(KEY, pref) } catch { /* best-effort persistence */ }
  applyThemePref(pref)
}

// What the user actually sees right now, resolving "auto" against the OS.
export function effectiveTheme(pref: ThemePref = getThemePref()): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  const dark = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
  return dark ? 'dark' : 'light'
}
