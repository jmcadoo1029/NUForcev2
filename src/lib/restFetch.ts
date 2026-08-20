// Thin direct-PostgREST client, ported from the classic app. supabase-js wedges
// on writes/reads against the shared session, so we call PostgREST directly with
// a bearer token read from the cookie/localStorage session.
//
// NOTE (read-only phase): during V2 verification we only issue GET requests.
// The write methods are here for parity but are not called yet.

import { REST_BASE, REST_APIKEY, REST_TIMEOUT_MS } from './config'
import { getAccessToken } from './auth'

export class NoSessionError extends Error {
  isNoSession = true
  constructor() {
    super('NO_SESSION: getAccessToken returned null (expired or missing)')
    this.name = 'NoSessionError'
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RestOpts {
  body?: unknown
  returnRepresentation?: boolean
  upsert?: boolean
}

/**
 * @param method GET/POST/PATCH/DELETE
 * @param path   e.g. "quotes?id=eq.123&select=id"
 */
export async function restFetch<T = unknown>(
  method: Method,
  path: string,
  { body, returnRepresentation = false, upsert = false }: RestOpts = {},
): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new NoSessionError()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REST_TIMEOUT_MS)

  const headers: Record<string, string> = {
    apikey: REST_APIKEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const prefer: string[] = []
  if (returnRepresentation) prefer.push('return=representation')
  if (upsert) prefer.push('resolution=merge-duplicates')
  if (prefer.length) headers.Prefer = prefer.join(',')

  try {
    const res = await fetch(`${REST_BASE}/${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`PostgREST ${method} ${path} → ${res.status} ${detail}`)
    }
    if (res.status === 204) return undefined as T
    // Writes without Prefer: return=representation come back 200/201 with an EMPTY
    // body — parse defensively so an empty response returns undefined instead of
    // throwing "Unexpected end of JSON input".
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  } finally {
    clearTimeout(timer)
  }
}
