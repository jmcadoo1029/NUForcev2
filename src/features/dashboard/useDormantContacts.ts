import { useEffect, useState } from 'react'
import { restFetchAll } from '../../lib/restFetch'
import { baseOpp, revRank } from '../../lib/opp'

// Dormant contacts — people we've quoted in the past who've gone quiet. Activity is
// read from the quotes themselves (each quote carries its contact email/name in
// data.qi), aggregated per email: last time we quoted them, how many quote families,
// total quoted value, and how much they've won. Emails flagged in Bad Contacts
// (email_invalid) are excluded so we never surface a dead address to email. The panel
// then applies the "haven't heard from them in N months" cutoff and ranks by value.

export interface DormantRow {
  email: string
  name: string
  company: string
  lastMs: number // most recent quote (any revision) for this contact
  quoteCount: number // distinct quote families
  totalQuoted: number // sum of the latest revision's total per family
  wonValue: number // sum for families that closed won
}

interface QRow {
  id: string
  opportunity?: string | null
  revision?: string | null
  total?: number | null
  stage?: string | null
  created_at?: string | null
  won_date?: string | null
  customer?: string | null
  em?: string | null // data->qi->>email
  nm?: string | null // data->qi->>contact
  acct?: string | null // data->qi->>account
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const msOf = (s?: string | null) => { const t = s ? new Date(s).getTime() : NaN; return isNaN(t) ? 0 : t }

async function load(): Promise<DormantRow[]> {
  // Addresses already flagged bad — never re-engage a dead email.
  const invalid = new Set(
    ((await restFetchAll<{ email: string | null }>('contacts?select=email&email_invalid=eq.true&order=email')) || [])
      .map((r) => (r.email || '').trim().toLowerCase())
      .filter(Boolean),
  )

  const rows = (await restFetchAll<QRow>(
    'quotes?select=id,opportunity,revision,total,stage,created_at,won_date,customer,em:data->qi->>email,nm:data->qi->>contact,acct:data->qi->>account&order=id',
  )) || []

  interface Acc { name: string; company: string; lastMs: number; fams: Map<string, { rank: number; total: number; won: boolean }> }
  const byEmail = new Map<string, Acc>()
  for (const r of rows) {
    const email = (r.em || '').trim().toLowerCase()
    if (!email.includes('@') || invalid.has(email)) continue
    const rec = byEmail.get(email) || { name: '', company: '', lastMs: 0, fams: new Map() }
    const cms = msOf(r.created_at)
    if (cms >= rec.lastMs) { rec.lastMs = cms; if (r.nm) rec.name = r.nm; rec.company = r.customer || r.acct || rec.company } // freshest name/company
    const fam = baseOpp(r.opportunity) || `__id_${r.id}`
    const rr = revRank(r.revision)
    const cur = rec.fams.get(fam)
    if (!cur || rr > cur.rank) rec.fams.set(fam, { rank: rr, total: num(r.total), won: (r.stage || '') === 'Closed Won' })
    byEmail.set(email, rec)
  }

  const list: DormantRow[] = []
  byEmail.forEach((rec, email) => {
    if (!rec.lastMs) return
    let totalQuoted = 0
    let wonValue = 0
    rec.fams.forEach((f) => { totalQuoted += f.total; if (f.won) wonValue += f.total })
    list.push({ email, name: rec.name, company: rec.company, lastMs: rec.lastMs, quoteCount: rec.fams.size, totalQuoted, wonValue })
  })
  list.sort((a, b) => b.totalQuoted - a.totalQuoted)
  return list
}

/** Loads on mount (the panel only mounts when its sub-tab is opened). */
export function useDormantContacts() {
  const [data, setData] = useState<DormantRow[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    load()
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setErr(String(e?.message || e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  return { data, err, loading }
}
