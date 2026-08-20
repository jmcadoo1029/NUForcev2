import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'

// Unresolved quote flags (attention items), ported from Classic's loadFlags.

export interface FlagRow {
  id: string
  quote_id: string | null
  opportunity: string | null
  customer: string | null
  flagged_by: string | null
  flagged_at: string | null
  note: string | null
}

async function load(): Promise<FlagRow[]> {
  return restFetch<FlagRow[]>(
    'GET',
    'quote_flags?select=id,quote_id,opportunity,customer,flagged_by,flagged_at,note&resolved=eq.false&order=flagged_at.desc',
  )
}

export function useFlaggedQuotes() {
  const [data, setData] = useState<FlagRow[] | null>(null)
  const [err, setErr] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [nonce])

  return { data, err, reload: () => setNonce((n) => n + 1) }
}
