// Backend connection constants. Ported verbatim from the classic app so the
// same Supabase project, keys, and contracts are reused (V2 is a frontend
// rebuild, not a data migration).

export const SUPABASE_URL = 'https://swuuxzmgmldvvomsgmjf.supabase.co'
export const REST_BASE = `${SUPABASE_URL}/rest/v1`
export const FN_BASE = `${SUPABASE_URL}/functions/v1`

// Publishable (anon) key — same key the classic client ships. Safe to include
// client-side; row-level security is enforced by the user's JWT, not this key.
export const REST_APIKEY = 'sb_publishable_bmrPY65INpUkea8VUX1Wag_T7Vrz9ZZ'

export const WORKSPACE_URL = 'https://workspace.nulabs.com'
// Default BCC on quote sends — pre-fills the composer's BCC field, but the sender
// can edit or clear it per send. Comma-separated for multiple recipients. Change
// here to update the default for everyone.
export const DEFAULT_QUOTE_BCC = 'jordanmcadoo@nulabs.com, ccebello@nulabs.com'
// Classic NUForce, once V2 takes over nuforce.nulabs.com. Used for the version
// toggle link so both can run side by side during the cutover.
export const CLASSIC_URL = 'https://nuforceclassic.nulabs.com'

// The cookie/localStorage key Supabase Auth uses for the shared nulabs session.
export const SESSION_KEY = 'sb-swuuxzmgmldvvomsgmjf-auth-token'

export const REST_TIMEOUT_MS = 15000

// Master write switch. V2 is read-only by default; every write path checks this
// before issuing a POST/PATCH/DELETE. RLS confirmed (2026-08): authenticated has
// ALL on quote_flags and quotes, so writes are permitted. Enabled for the Flag
// pilot — currently the ONLY wired write, so nothing else writes yet. As more
// write paths are wired they'll go live under this same switch, so re-verify each
// as it lands. Set back to false to return the whole app to read-only.
export const WRITES_ENABLED = true
