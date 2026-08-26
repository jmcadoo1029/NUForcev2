import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, useToast } from '../../components'
import { restFetch } from '../../lib/restFetch'
import { money } from '../../lib/format'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { updateQuoteContact, resolveBounceFlag } from '../../lib/quoteContact'
import { searchPeople, personName, type PersonRow } from '../../lib/directory'
import { Autocomplete } from '../quote/form/Autocomplete'

// "Bad contacts" — when a quote/follow-up email bounces, the resend-webhook marks
// that contact's address invalid (contacts.email_invalid). This widget collects
// every quote still addressed to a bounced address, grouped by address, so you can
// drop in a correct contact + email once and update all of them at once — no
// digging into each quote. Uses updateQuoteContact (targeted; never resets approval).
// Renders nothing when there are no bad contacts.

interface BadQuote { id: string; opportunity: string | null; customer: string | null; total: number | null; stage: string | null; updated_at?: string | null }
interface BadGroup { email: string; name: string; reason: string; quotes: BadQuote[] }

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
      const quotes = await restFetch<BadQuote[]>('GET', `quotes?select=id,opportunity,customer,total,stage,updated_at&data->qi->>email=eq.${enc(email)}&order=updated_at.desc&limit=100`).catch(() => [])
      const c = bad.find((b) => (b.email || '').trim() === email)
      const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim()
      return { email, name, reason: c?.email_invalid_reason || '', quotes: quotes || [] }
    }),
  )
  return groups.filter((g) => g.quotes.length > 0)
}

const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '7px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }

export function BadContactsCard() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [groups, setGroups] = useState<BadGroup[] | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<Record<string, { name: string; email: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadBadContacts().then((g) => alive && setGroups(g)).catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [])

  const setField = (email: string, k: 'name' | 'email', v: string) =>
    setForm((f) => ({ ...f, [email]: { name: f[email]?.name || '', email: f[email]?.email || '', [k]: v } }))

  const applyGroup = async (g: BadGroup) => {
    if (busy) return
    const name = (form[g.email]?.name || '').trim()
    const email = (form[g.email]?.email || '').trim()
    if (!email || !email.includes('@')) { showToast('Enter a valid new email first.', 'warn', 4000); return }
    if (email.toLowerCase() === g.email.toLowerCase()) { showToast('That’s the same address that bounced — enter the corrected one.', 'warn', 5000); return }
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
  // Render nothing unless there's something to fix (keeps My Work uncluttered).
  if (!err && visible.length === 0) return null

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-2)' }}>
        <CardLabel>Bad contacts</CardLabel>
        {visible.length > 0 && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 20, padding: '2px 9px' }}>{visible.length}</span>}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
        These addresses bounced — the contact has likely left. Put the correct contact on all their quotes at once.
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}

      {visible.map((g) => (
        <div key={g.email} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff', background: 'var(--accent)', padding: '2px 9px', borderRadius: 20 }}>Bounced</span>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr) auto', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <Autocomplete<PersonRow>
              value={form[g.email]?.name || ''}
              onValueChange={(v) => setField(g.email, 'name', v)}
              search={(t) => searchPeople(t)}
              itemKey={(p) => p.id}
              itemPrimary={(p) => personName(p) || '(no name)'}
              itemSecondary={(p) => [p.email, p.client_name].filter(Boolean).join(' · ')}
              onPick={(p) => setForm((f) => ({ ...f, [g.email]: { name: personName(p), email: p.email || '' } }))}
              placeholder="New contact name — type to search"
            />
            <input value={form[g.email]?.email || ''} onChange={(e) => setField(g.email, 'email', e.target.value)} placeholder="New contact email" style={inputStyle} />
            <button onClick={() => applyGroup(g)} disabled={busy === g.email} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 14px', cursor: busy === g.email ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{busy === g.email ? 'Updating…' : `Update ${g.quotes.length}`}</button>
          </div>
        </div>
      ))}
    </Card>
  )
}
