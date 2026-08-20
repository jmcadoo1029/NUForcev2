// Supabase Edge Function / RPC caller, ported from the classic app. Passes the
// user's bearer token so the function runs as the signed-in user.

import { FN_BASE, REST_APIKEY, REST_TIMEOUT_MS } from './config'
import { getAccessToken } from './auth'
import { NoSessionError } from './restFetch'

export async function rpcCall<T = unknown>(
  fnName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new NoSessionError()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REST_TIMEOUT_MS)

  try {
    const res = await fetch(`${FN_BASE}/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: REST_APIKEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`RPC ${fnName} → ${res.status} ${detail}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}
