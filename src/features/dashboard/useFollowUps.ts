import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import { baseOpp as baseOf } from '../../lib/opp'

// Follow-ups due, ported from Classic's loadFollowUps. Pending follow-ups where
// the row is due (reschedule date reached, or 30+ days since sent), the latest
// revision in its family, and not Closed Won/Lost. Oldest-due first.

export interface FollowUpRow {
  id: string
  quote_id: string | null
  opportunity: string
  customer: string
  dueAt: number
}

interface Raw {
  id: string
  quote_id?: string | null
  opportunity?: string | null
  sent_at?: string | null
  followup_again_at?: string | null
  quotes?: {
    id?: string
    opportunity?: string | null
    revision?: string | null
    customer?: string | null
    data?: { qi?: { stage?: string } }
  }
}

// Rank a revision letter so families sort correctly: base=0, A=1, B=2, … AA=27.
function revRank(rev: unknown): number {
  const r = String(rev ?? '').toUpperCase().trim()
  if (!r) return 0
  let n = 0
  for (let i = 0; i < r.length; i++) {
    const c = r.charCodeAt(i)
    if (c < 65 || c > 90) return 0 // non-letter suffix → treat as base
    n = n * 26 + (c - 64)
  }
  return n
}

async function load(): Promise<FollowUpRow[]> {
  const rows =
    (await restFetch<Raw[]>(
      'GET',
      `follow_ups?select=*,quotes(id,opportunity,revision,customer,data)&followed_up=eq.false&or=(voided.is.null,voided.eq.false)`,
    )) || []

  // True latest revision per family. Seed from the follow-up rows' own quotes,
  // then — crucially — check the quotes table so a NEWER revision that hasn't
  // been sent yet (and so has no follow-up row) still supersedes the old one.
  // This fixes the "revised quote, old revision still on the list" case.
  const familyLatest = new Map<string, number>()
  const bump = (key: string, rank: number) => {
    if (!key) return
    const cur = familyLatest.get(key)
    if (cur === undefined || rank > cur) familyLatest.set(key, rank)
  }
  rows.forEach((fu) => bump(baseOf(fu.quotes?.opportunity || fu.opportunity || ''), revRank(fu.quotes?.revision)))

  const bases = Array.from(new Set(rows.map((fu) => baseOf(fu.quotes?.opportunity || fu.opportunity || '')).filter(Boolean)))
  if (bases.length) {
    try {
      const orExpr = bases.map((b) => `opportunity.ilike.${encodeURIComponent(b + '*')}`).join(',')
      const fam = (await restFetch<Array<{ opportunity?: string | null; revision?: string | null }>>('GET', `quotes?select=opportunity,revision&or=(${orExpr})`)) || []
      fam.forEach((q) => {
        const key = baseOf(q.opportunity || '')
        if (bases.includes(key)) bump(key, revRank(q.revision))
      })
    } catch {
      // If the family lookup fails, fall back to the follow-up-derived latest.
    }
  }

  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()
  const thirtyMs = Date.now() - 30 * 24 * 60 * 60 * 1000
  const isDue = (fu: Raw): boolean =>
    fu.followup_again_at ? new Date(fu.followup_again_at).getTime() <= todayMs : !!fu.sent_at && new Date(fu.sent_at).getTime() <= thirtyMs
  const dueAt = (fu: Raw): number =>
    fu.followup_again_at ? new Date(fu.followup_again_at).getTime() : fu.sent_at ? new Date(fu.sent_at).getTime() + 30 * 24 * 60 * 60 * 1000 : Infinity

  return rows
    .filter((fu) => {
      const stage = fu.quotes?.data?.qi?.stage || ''
      if (stage === 'Closed Won' || stage === 'Closed Lost') return false
      const key = baseOf(fu.quotes?.opportunity || fu.opportunity || '')
      // Only the family's latest revision shows — supersede older ones.
      if (revRank(fu.quotes?.revision) !== (familyLatest.get(key) ?? 0)) return false
      return isDue(fu)
    })
    .map((fu) => ({
      id: fu.id,
      quote_id: fu.quotes?.id || fu.quote_id || null,
      opportunity: fu.quotes?.opportunity || fu.opportunity || '',
      customer: fu.quotes?.customer || '',
      dueAt: dueAt(fu),
    }))
    .sort((a, b) => a.dueAt - b.dueAt)
}

export function useFollowUps() {
  const [data, setData] = useState<FollowUpRow[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [])
  return { data, err }
}
