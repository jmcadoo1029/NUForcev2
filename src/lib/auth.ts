// Auth token access, ported from the classic getAccessToken.js and extended
// for local development.
//
// PRODUCTION (deployed on *.nulabs.com): the shared Supabase session lives in a
// cookie set by NUWorkspace. We read the access token straight out of it,
// bypassing supabase-js (which wedges on the shared session).
//
// LOCAL DEV (localhost): subdomain cookies don't apply to localhost, so the
// classic storage adapter already falls back to localStorage there. We mirror
// that: read the session from localStorage instead. A dev token is seeded once
// via seedDevSession() (see the dev token box in the UI) so you can view real,
// READ-ONLY data locally.

import { SESSION_KEY } from './config'

function isLocalDev(): boolean {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0'
}

function readRawCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'))
  return m ? m[1] : null
}

// Assemble the stored session string. Handles the confirmed single-cookie case
// plus the SDK's chunked (.0/.1/...) fallback.
function assembleSessionValue(): string | null {
  if (isLocalDev()) {
    try { return localStorage.getItem(SESSION_KEY) } catch { return null }
  }
  const single = readRawCookie(SESSION_KEY)
  if (single !== null) return decodeURIComponent(single)

  let combined = ''
  let i = 0
  while (i < 50) {
    const part = readRawCookie(`${SESSION_KEY}.${i}`)
    if (part === null) break
    combined += decodeURIComponent(part)
    i++
  }
  return combined.length ? combined : null
}

interface StoredSession {
  access_token?: string
  expires_at?: number
  user?: { email?: string }
}

function parseSession(raw: string | null): StoredSession | null {
  if (raw == null) return null
  let v = raw.trim()
  // A value copied straight from the browser cookie is URI-encoded
  // (e.g. %7B%22... for {"...). Decode it before parsing.
  if (v.startsWith('%') || v.includes('%7B') || v.includes('%22')) {
    try { v = decodeURIComponent(v) } catch { /* leave as-is */ }
  }
  if (v.startsWith('base64-')) {
    try { v = atob(v.slice('base64-'.length)) } catch { return null }
  }
  try { return JSON.parse(v) as StoredSession } catch { return null }
}

/** Valid access token, or null if there's no usable session. Never throws. */
export function getAccessToken(): string | null {
  try {
    const session = parseSession(assembleSessionValue())
    if (!session || !session.access_token) return null
    if (typeof session.expires_at === 'number') {
      const now = Math.floor(Date.now() / 1000)
      if (session.expires_at <= now) return null
    }
    return session.access_token
  } catch {
    return null
  }
}

/** The signed-in user's email from the session, or null. */
export function getSessionEmail(): string | null {
  const session = parseSession(assembleSessionValue())
  return session?.user?.email ?? null
}

/**
 * DEV ONLY. Seed a full session JSON (copied from a logged-in nuforce session)
 * into localStorage so local runs can read real data. No-op off localhost.
 * Returns true if it looks like a valid session.
 */
export function seedDevSession(sessionJson: string): boolean {
  if (!isLocalDev()) return false
  const parsed = parseSession(sessionJson)
  if (!parsed?.access_token) return false
  try {
    // Store normalized (decoded) JSON so later reads parse cleanly regardless
    // of whether the pasted value was URI-encoded or base64-prefixed.
    localStorage.setItem(SESSION_KEY, JSON.stringify(parsed))
    return true
  } catch {
    return false
  }
}

export { isLocalDev }
