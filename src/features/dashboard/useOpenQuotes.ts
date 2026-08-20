import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'

// The shared "in progress" reminders board (open_quotes). A manually-ordered,
// team-wide list — everyone sees the same rows. This hook reads and exposes a
// reload(); adding/editing/reordering are persisted via lib/openQuotes.

export interface OpenQuoteRow {
  id: string
  opportunity: string | null
  account: string | null
  description: string | null
  sort_order: number | null
}

async function load(): Promise<OpenQuoteRow[]> {
  return restFetch<OpenQuoteRow[]>(
    'GET',
    'open_quotes?select=id,opportunity,account,description,sort_order&order=sort_order.asc,created_at.asc',
  )
}

export function useOpenQuotes() {
  const [data, setData] = useState<OpenQuoteRow[] | null>(null)
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
