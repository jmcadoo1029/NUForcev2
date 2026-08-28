import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, useToast } from '../../components'
import { restFetch } from '../../lib/restFetch'
import { money } from '../../lib/format'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { updateQuoteContact, resolveBounceFlag, flagContactInvalid } from '../../lib/quoteContact'
import { searchClients, fetchClientContacts, searchPeople, personName, type PersonRow, type ClientRow } from '../../lib/directory'
import { Autocomplete } from '../quote/form/Autocomplete'

// "Bad contacts" — when a quote/follow-up email bounces, the resend-webhook marks
// that contact's address invalid (contacts.email_invalid). This widget collects
// every quote still addressed to a bounced address, grouped by address. Pick the
// replacement contact from the account's own contact list (it defaults to the
// account on those quotes) or type a different account to pull people from, then
// update all the quotes at once. Uses updateQuoteContact (targeted; never resets
// approval) and clears the bounce flag. Renders nothing when there's nothing to fix.

interface BadQuote { id: string; opportunity: string | null; customer: string | null; total: number | null; stage: string | null; clientId?: string | null }
interface BadGroup { email: string; name: string; reason: string; quotes: BadQuote[]; account: string; clientId: string }
interface Pick { account: string; clientId: string; name: string; email: string }

const enc = (v: string) => encodeURIComponent(v)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function loadBadContacts(): Promise<BadGroup[]> {
  const bad = await restFetch<Array<{ email: string | null; first_name?: string | null; last_name?: string | null; email_invalid_reason?: string | null }>>(
    'GET',
    `contacts?select=email,first_name,last_name,email_invalid_reason&email_invalid=eq.true&email=not.is.null&order=email_invalid_at.desc.nullslast&limit=30`,
  )
  const emails = Array.from(new Set((bad || []).map((c) => (c.email || '').trim()).filter(Boolean)))
  if (!emails.length) return []
  const groups = await Promise.all(
    emails.map(async (email) => {
      const quotes = await restFetch<BadQuote[]>('GET', `quotes?select=id,opportunity,customer,total,stage,clientId:data->qi->>client_id&data->qi->>email=eq.${enc(email)}&order=updated_at.desc&limit=100`).catch(() => [])
      const c = bad.find((b) => (b.email || '').trim() === email)
      const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim()
      // Default account = the account on these quotes (they almost always share one).
      const account = (quotes.find((q) => q.customer)?.customer || '').trim()
      const clientId = (quotes.find((q) => q.clientId)?.clientId || '').trim()
      return { email, name, reason: c?.email_invalid_reason || '', quotes: quotes || [], account, clientId }
    }),
  )
  return groups.filter((g) => g.quotes.length > 0)
}

// Orphaned POCs: open quotes whose contact (data.qi.email) is no longer in the
// contacts table — e.g. someone deleted the contact but quotes still point at
// them, so they no longer surface in search. Scans open quotes, diffs their POC
// emails against contacts, and groups the leftovers so they can be reassigned like
// a bounced contact. On-demand (heavier scan), so it's behind a button.
async function loadOrphanContacts(): Promise<BadGroup[]> {
  const rows = await restFetch<Array<{ id: string; opportunity: string | null; customer: string | null; total: number | null; stage: string | null; poc: string | null; email: string | null; clientId: string | null }>>(
    'GET',
    `quotes?select=id,opportunity,customer,total,stage:data->qi->>stage,poc:data->qi->>contact,email:data->qi->>email,clientId:data->qi->>client_id&data->qi->>stage=not.in.("Closed Won","Closed Lost")&limit=5000`,
  ).catch(() => [])
  const quotes = rows || []
  const emails = Array.from(new Set(quotes.map((r) => (r.email || '').trim().toLowerCase()).filter((e) => e.includes('@'))))
  if (!emails.length) return []
  // Build the full set of contact emails (lowercased) so the match is
  // case-insensitive AND complete. PostgREST caps a response at 1000 rows, so we
  // page through with offset — a single fetch would silently truncate and flag
  // real contacts (whose stored email may be mixed-case) as orphans.
  const existing = new Set<string>()
  for (let off = 0; off <= 50000; off += 1000) {
    const page = await restFetch<Array<{ email: string | null }>>('GET', `contacts?select=email&email=not.is.null&order=email&limit=1000&offset=${off}`).catch(() => [])
    const arr = page || []
    arr.forEach((x) => { const e = (x.email || '').trim().toLowerCase(); if (e) existing.add(e) })
    if (arr.length < 1000) break
  }
  const byEmail = new Map<string, BadGroup>()
  for (const r of quotes) {
    const email = (r.email || '').trim()
    const key = email.toLowerCase()
    if (!email.includes('@') || existing.has(key)) continue
    const g = byEmail.get(key) || { email, name: (r.poc || '').trim(), reason: 'orphaned — contact not in your list', quotes: [], account: (r.customer || '').trim(), clientId: (r.clientId || '').trim() }
    if (!g.name && r.poc) g.name = r.poc.trim()
    if (!g.account && r.customer) g.account = r.customer.trim()
    if (!g.clientId && r.clientId) g.clientId = (r.clientId || '').trim()
    g.quotes.push({ id: r.id, opportunity: r.opportunity, customer: r.customer, total: r.total, stage: r.stage, clientId: r.clientId })
    byEmail.set(key, g)
  }
  return Array.from(byEmail.values()).sort((a, b) => b.quotes.length - a.quotes.length)
}

const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '7px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
const label: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 3 }

export function BadContactsCard() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [groups, setGroups] = useState<BadGroup[] | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<Record<string, Pick>>({})
  const [busy, setBusy] = useState<string | null>(null)
  // Manually flag a contact we already know is bad (e.g. "no longer with us").
  const [flagText, setFlagText] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  // Scan for orphaned POCs (contact deleted, quotes still point at them).
  const [scanBusy, setScanBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadBadContacts()
      .then((g) => {
        if (!alive) return
        setGroups(g)
        // Seed each group's picker with its own account (so the contact list is one click away).
        const seed: Record<string, Pick> = {}
        g.forEach((grp) => { seed[grp.email] = { account: grp.account, clientId: grp.clientId, name: '', email: '' } })
        setForm(seed)
      })
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [])

  // Merge freshly-found groups into the list without duplicating an email.
  const mergeGroups = (incoming: BadGroup[]) => {
    setGroups((prev) => {
      const have = new Set((prev || []).map((g) => g.email.toLowerCase()))
      const add = incoming.filter((g) => !have.has(g.email.toLowerCase()))
      setForm((f) => { const seed = { ...f }; add.forEach((g) => { if (!seed[g.email]) seed[g.email] = { account: g.account, clientId: g.clientId, name: '', email: '' } }); return seed })
      return [...(prev || []), ...add]
    })
  }

  // Scan open quotes for POCs no longer in the contact list, surface them to fix.
  const scanOrphans = async () => {
    if (scanBusy) return
    setScanBusy(true)
    try {
      const found = await loadOrphanContacts()
      mergeGroups(found)
      const n = found.reduce((a, g) => a + g.quotes.length, 0)
      showToast(found.length ? `Found ${found.length} contact${found.length !== 1 ? 's' : ''} no longer in your list, on ${n} open quote${n !== 1 ? 's' : ''}.` : 'No orphaned contacts — every open quote’s POC is a known contact.', found.length ? 'info' : 'success', 6000)
    } catch (e) {
      showToast('Couldn’t scan: ' + errMsg(e), 'error', 6000)
    } finally {
      setScanBusy(false)
    }
  }

  const patch = (email: string, p: Partial<Pick>) =>
    setForm((f) => {
      const cur = f[email] || { account: '', clientId: '', name: '', email: '' }
      return { ...f, [email]: { ...cur, ...p } }
    })

  // Reload the bad-contact groups and seed any new group's picker with its account.
  const refresh = async (): Promise<BadGroup[]> => {
    const g = await loadBadContacts()
    setGroups(g)
    setForm((prev) => {
      const seed = { ...prev }
      g.forEach((grp) => { if (!seed[grp.email]) seed[grp.email] = { account: grp.account, clientId: grp.clientId, name: '', email: '' } })
      return seed
    })
    return g
  }

  // Manually mark a contact bad (you already know they're gone). Flags the address
  // like a bounce would, then reloads so their quotes appear here to reassign.
  const markBad = async (p: PersonRow) => {
    const email = (p.email || '').trim()
    if (!email || !email.includes('@')) { showToast('That contact has no email on record.', 'warn', 4000); return }
    setFlagBusy(true)
    try {
      if (!WRITES_ENABLED) { showToast('Preview — writes off, so nothing was flagged.', 'warn', 4000); setFlagText(''); return }
      await flagContactInvalid(email, `manually flagged${me ? ' by ' + me : ''}`)
      const g = await refresh()
      setDone((s) => { const n = new Set(s); n.delete(email); return n })
      setFlagText('')
      const grp = g.find((x) => x.email.toLowerCase() === email.toLowerCase())
      if (grp) showToast(`Marked ${email} as bad — ${grp.quotes.length} quote${grp.quotes.length !== 1 ? 's' : ''} to reassign below.`, 'success', 6000)
      else showToast(`Marked ${email} as bad. No open quotes are addressed to them.`, 'info', 6000)
    } catch (e) {
      showToast('Couldn’t flag contact: ' + errMsg(e), 'error', 6000)
    } finally {
      setFlagBusy(false)
    }
  }

  // Contacts come from the linked account when there is one, else a global search.
  const contactSearch = (clientId: string) => async (term: string): Promise<PersonRow[]> => {
    if (clientId) {
      const list = await fetchClientContacts(clientId)
      const t = term.toLowerCase()
      return list.filter((p) => (personName(p) + ' ' + (p.email || '')).toLowerCase().includes(t))
    }
    return searchPeople(term)
  }

  const applyGroup = async (g: BadGroup) => {
    if (busy) return
    const f = form[g.email] || { account: '', clientId: '', name: '', email: '' }
    const name = f.name.trim()
    const email = f.email.trim()
    if (!email || !email.includes('@')) { showToast('Pick or enter a valid new email first.', 'warn', 4000); return }
    if (email.toLowerCase() === g.email.toLowerCase()) { showToast('That’s the same address that bounced — choose the corrected one.', 'warn', 5000); return }
    setBusy(g.email)
    try {
      if (WRITES_ENABLED) {
        for (const q of g.quotes) {
          await updateQuoteContact(q.id, name, email)
          await resolveBounceFlag(q.id, me).catch(() => {}) // clear the bounce flag too (best-effort)
        }
        showToast(`Updated ${g.quotes.length} quote${g.quotes.length !== 1 ? 's' : ''} to ${email}`, 'success', 5000)
      } else {
        showToast(`Would update ${g.quotes.length} quote(s) (preview — writes off)`, 'warn', 4000)
      }
      setDone((s) => new Set(s).add(g.email))
    } catch (e) {
      showToast('Couldn’t update: ' + errMsg(e), 'error', 7000)
    } finally {
      setBusy(null)
    }
  }

  const visible = (groups || []).filter((g) => !done.has(g.email))
  // Still loading and nothing to show yet — render nothing (keeps My Work quiet
  // until we know whether there are bad contacts). Once loaded, the card always
  // shows so the "mark a contact bad" search is available even when the list is empty.
  if (!err && groups === null) return null

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <CardLabel>Bad contacts</CardLabel>
        {visible.length > 0 && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 20, padding: '2px 9px' }}>{visible.length}</span>}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
        Bounced or known-bad addresses — the contact has likely left. Put the correct contact on all their quotes at once.
      </div>

      {/* Manually flag a contact you already know is bad (e.g. "no longer with us"). */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
        <div style={label}>Know a contact is gone? Flag them</div>
        <Autocomplete<PersonRow>
          value={flagText}
          onValueChange={setFlagText}
          search={(t) => searchPeople(t)}
          minChars={2}
          itemKey={(p) => p.id}
          itemPrimary={(p) => personName(p) || '(no name)'}
          itemSecondary={(p) => [p.email, p.client_name].filter(Boolean).join(' · ')}
          onPick={(p) => { if (!flagBusy) markBad(p) }}
          placeholder={flagBusy ? 'Flagging…' : 'Search a contact by name or email…'}
          emptyText="No matching contacts."
        />
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 4 }}>Marks the address bad and pulls their quotes below to reassign. Won’t be re-emailed.</div>
        <div style={{ marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <button onClick={scanOrphans} disabled={scanBusy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 14px', cursor: scanBusy ? 'default' : 'pointer' }}>{scanBusy ? 'Scanning…' : 'Scan for deleted contacts'}</button>
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>Finds open quotes whose POC was deleted from your contacts (so they don’t show in search) and lists them to reassign.</span>
        </div>
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && visible.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', fontStyle: 'italic' }}>No bad contacts to fix right now.</div>}

      {visible.map((g) => {
        const f = form[g.email] || { account: g.account, clientId: g.clientId, name: '', email: '' }
        return (
          <div key={g.email} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff', background: 'var(--accent)', padding: '2px 9px', borderRadius: 20 }}>{/bounce/i.test(g.reason) ? 'Bounced' : /orphan/i.test(g.reason) ? 'Deleted' : 'Flagged'}</span>
              <span style={{ fontWeight: 700 }}>{g.name || '(no name)'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>{g.email}</span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{g.quotes.length} quote{g.quotes.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ marginBottom: 'var(--sp-3)' }}>
              {g.quotes.map((q) => (
                <Link key={q.id} to={`/quote/${q.id}`} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '6px 4px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{q.opportunity || q.id}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer || '—'}</span>
                  {q.stage && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{q.stage}</span>}
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' }}>{money(Number(q.total) || 0)}</span>
                </Link>
              ))}
            </div>

            <div style={label}>Replace with</div>
            <div style={{ marginBottom: 'var(--sp-2)' }}>
              <Autocomplete<ClientRow>
                value={f.account}
                onValueChange={(v) => patch(g.email, { account: v, clientId: '' })}
                search={(t) => searchClients(t)}
                itemKey={(c) => c.id}
                itemPrimary={(c) => c.name || '(unnamed)'}
                itemSecondary={(c) => [c.city, c.state].filter(Boolean).join(', ')}
                onPick={(c) => patch(g.email, { account: c.name || '', clientId: c.id })}
                placeholder="Account — defaults to this quote's account; type to change"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr) auto', gap: 'var(--sp-2)', alignItems: 'center' }}>
              <Autocomplete<PersonRow>
                value={f.name}
                onValueChange={(v) => patch(g.email, { name: v })}
                search={contactSearch(f.clientId)}
                minChars={f.clientId ? 0 : 1}
                itemKey={(p) => p.id}
                itemPrimary={(p) => personName(p) || '(no name)'}
                itemSecondary={(p) => [p.email, p.client_name].filter(Boolean).join(' · ')}
                onPick={(p) => patch(g.email, { name: personName(p), email: p.email || '' })}
                placeholder={f.clientId ? 'Click to choose a contact, or type' : 'Contact name'}
                emptyText={f.clientId ? 'No contacts on this account — type a name.' : 'Pick an account, or type a name.'}
              />
              <input value={f.email} onChange={(e) => patch(g.email, { email: e.target.value })} placeholder="Contact email" style={inputStyle} />
              <button onClick={() => applyGroup(g)} disabled={busy === g.email} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 14px', cursor: busy === g.email ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{busy === g.email ? 'Updating…' : `Update ${g.quotes.length}`}</button>
            </div>
          </div>
        )
      })}
    </Card>
  )
}
