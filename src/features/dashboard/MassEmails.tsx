import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardLabel, Modal, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { PCODE_OPTS } from '../../data/constants'
import { Autocomplete } from '../quote/form/Autocomplete'
import { searchClients, type ClientRow } from '../../lib/directory'
import {
  fetchAllContacts, fetchContactsByProductCode, fetchCampaignOptions, fetchContactsByCampaign,
  fetchContactsByAccount, fetchTemplates, saveTemplate, deleteTemplate,
  sendMassEmail, fetchMassEmails, fetchMassEmailMetrics,
  type Recipient, type EmailTemplate, type MassEmailRow, type MassEmailMetrics, type CampaignOption,
} from '../../lib/massEmail'
import { fetchTemplate, DEFAULT_TEMPLATES, type MassTemplateKey } from '../../lib/emailTemplates'

// Mass Emails — compose + send a personalized blast to an audience: all contacts,
// everyone quoted a given product code (optionally within a date window), or the
// members of a campaign. Reusable saved templates, a history log, and Resend
// delivery metrics. Managers only (gated at the route). Each recipient gets an
// individual send, so nobody sees another client's address, and bounces here
// don't touch Bad Contacts.

type AudienceMode = 'all' | 'code' | 'campaign' | 'account'

// Each audience's starter email lives in the Email Templates manager (keys
// mass_*), so the wording is edited in one place and this composer seeds from it.
// DEFAULT_TEMPLATES holds the in-code fallback; fetchTemplate returns any saved
// override. Switching audiences swaps in that audience's starter ONLY when the
// body is still one of the current defaults (or empty) — a customized or loaded
// template body is never clobbered.
const MASS_KEY: Record<AudienceMode, MassTemplateKey> = {
  all: 'mass_all',
  code: 'mass_code',
  campaign: 'mass_campaign',
  account: 'mass_account',
}
const seedTpl = (m: AudienceMode) => ({ subject: DEFAULT_TEMPLATES[MASS_KEY[m]].subject, body: DEFAULT_TEMPLATES[MASS_KEY[m]].body })

// Distinct product codes for the audience dropdown (same catalog quotes use).
// Codes with several labels (43, 44, 51…) collapse to one option, labels joined.
const CODE_OPTIONS: { code: string; label: string }[] = (() => {
  const byCode = new Map<string, string[]>()
  for (const p of PCODE_OPTS) {
    const arr = byCode.get(p.code) || []
    if (!arr.includes(p.label)) arr.push(p.label)
    byCode.set(p.code, arr)
  }
  return Array.from(byCode.entries())
    .map(([code, labels]) => ({ code, label: labels.join(' / ') }))
    .sort((a, b) => Number(a.code) - Number(b.code))
})()

const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
const label: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4, display: 'block' }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Review-list A→Z index. Recipients are grouped/sorted by LAST name; anything
// without an alphabetic last name lands in the "#" bucket at the end.
const AZ = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#']
const lastNameOf = (name: string) => { const t = (name || '').trim().split(/\s+/).filter(Boolean); return t.length ? t[t.length - 1] : '' }
const bucketOf = (name: string) => { const c = (lastNameOf(name)[0] || '').toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#' }

export function MassEmails() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''

  const [subject, setSubject] = useState(DEFAULT_TEMPLATES.mass_all.subject)
  const [body, setBody] = useState(DEFAULT_TEMPLATES.mass_all.body)
  // Live per-audience starters (from the Email Templates manager). Seeded from the
  // in-code defaults, then refreshed with any saved overrides on mount.
  const [audienceTpl, setAudienceTpl] = useState<Record<AudienceMode, { subject: string; body: string }>>({ all: seedTpl('all'), code: seedTpl('code'), campaign: seedTpl('campaign'), account: seedTpl('account') })

  const [mode, setMode] = useState<AudienceMode>('all')
  const [code, setCode] = useState('')
  const [datePreset, setDatePreset] = useState<'any' | '1y' | '2y' | '3y' | '5y' | 'custom'>('any')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [accountText, setAccountText] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [scanned, setScanned] = useState<number | null>(null) // 'all' audience: raw contacts scanned before dedupe
  const [loadingRecips, setLoadingRecips] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [reviewOpen, setReviewOpen] = useState(false)

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [tplName, setTplName] = useState('')

  const [sendOpen, setSendOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const [history, setHistory] = useState<MassEmailRow[]>([])
  const [metrics, setMetrics] = useState<Record<string, MassEmailMetrics>>({})

  const loadTemplates = () => fetchTemplates().then(setTemplates).catch(() => {})
  const loadHistory = () => fetchMassEmails().then(setHistory).catch(() => {})
  const loadCampaigns = () => fetchCampaignOptions().then(setCampaigns).catch(() => {})

  useEffect(() => { loadTemplates(); loadHistory(); loadCampaigns() }, [])

  // Load the saved per-audience starters (Email Templates → Mass: …). If the
  // composer is still showing the pristine "All contacts" starter (untouched),
  // refresh it to the saved version so edits made in the manager show up here.
  useEffect(() => {
    let alive = true
    Promise.all((['all', 'code', 'campaign', 'account'] as AudienceMode[]).map((m) => fetchTemplate(MASS_KEY[m])))
      .then(([a, c, cp, ac]) => {
        if (!alive) return
        setAudienceTpl({ all: { subject: a.subject, body: a.body }, code: { subject: c.subject, body: c.body }, campaign: { subject: cp.subject, body: cp.body }, account: { subject: ac.subject, body: ac.body } })
        setBody((b) => (b === DEFAULT_TEMPLATES.mass_all.body ? a.body : b))
        setSubject((s) => (s === DEFAULT_TEMPLATES.mass_all.subject ? a.subject : s))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // The set of current audience-starter bodies — switching audiences only swaps
  // the text when the body still matches one of these (i.e. hasn't been edited).
  const defaultBodies = useMemo(() => new Set(Object.values(audienceTpl).map((t) => t.body)), [audienceTpl])

  // Resolve the product-code date window from the preset (or the custom inputs).
  // Compared against quotes.created_at; `to` is pushed to end-of-day so the whole
  // day is inclusive. Returns a human label used in the audience line + history.
  const computeRange = (): { from?: string; to?: string; label: string } => {
    if (datePreset === 'any') return { label: 'any time' }
    if (datePreset === 'custom') {
      const from = customFrom || undefined
      const to = customTo || undefined
      if (!from && !to) return { label: 'any time' }
      const label = `${from || '…'} to ${to || '…'}`
      return { from, to: to ? `${to}T23:59:59` : undefined, label }
    }
    const years = datePreset === '1y' ? 1 : datePreset === '2y' ? 2 : datePreset === '3y' ? 3 : 5
    const d = new Date()
    d.setFullYear(d.getFullYear() - years)
    return { from: d.toISOString().slice(0, 10), label: `last ${years} year${years > 1 ? 's' : ''}` }
  }

  const campaignName = campaigns.find((c) => c.id === campaignId)?.name || ''

  // Load recipients for the current audience.
  const loadRecipients = async () => {
    setLoadingRecips(true)
    setExcluded(new Set())
    try {
      let list: Recipient[] = []
      if (mode === 'all') { const load = await fetchAllContacts(); list = load.recipients; setScanned(load.scanned) }
      else if (mode === 'code') { list = await fetchContactsByProductCode(code, computeRange()); setScanned(null) }
      else if (mode === 'campaign') { list = await fetchContactsByCampaign(campaignId); setScanned(null) }
      else if (mode === 'account') { list = await fetchContactsByAccount(accountId); setScanned(null) }
      setRecipients(list)
      if (mode === 'code' && list.length === 0) showToast(`No contacts found for product code ${code}${datePreset !== 'any' ? ' in that date range' : ''}.`, 'warn', 4000)
      if (mode === 'campaign' && campaignId && list.length === 0) showToast('That campaign has no contacts with an email address.', 'warn', 4000)
      if (mode === 'account' && accountId && list.length === 0) showToast('That account has no contacts with an email address.', 'warn', 4000)
    } catch (e) {
      showToast('Couldn’t load recipients: ' + errMsg(e), 'error', 6000)
    } finally {
      setLoadingRecips(false)
    }
  }
  useEffect(() => { if (mode === 'all') loadRecipients() }, []) // initial: all contacts

  const finalRecipients = useMemo(() => recipients.filter((r) => !excluded.has(r.email.toLowerCase())), [recipients, excluded])

  // Review list grouped by last-name initial (A→Z, then "#"), each group sorted
  // by last then full name — so the jump index lands where you'd expect.
  const reviewGroups = useMemo(() => {
    const withKey = recipients.map((r) => ({ r, ln: lastNameOf(r.name), bucket: bucketOf(r.name) }))
    withKey.sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket === '#' ? 1 : b.bucket === '#' ? -1 : a.bucket < b.bucket ? -1 : 1
      return a.ln.toLowerCase().localeCompare(b.ln.toLowerCase()) || (a.r.name || '').localeCompare(b.r.name || '')
    })
    const map = new Map<string, Recipient[]>()
    for (const w of withKey) { const arr = map.get(w.bucket) || []; arr.push(w.r); map.set(w.bucket, arr) }
    return map
  }, [recipients])
  const reviewScrollRef = useRef<HTMLDivElement>(null)
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const jumpToLetter = (L: string) => { const el = letterRefs.current[L]; const sc = reviewScrollRef.current; if (el && sc) sc.scrollTop = el.offsetTop }
  const audienceLabel =
    mode === 'all' ? 'All contacts'
      : mode === 'campaign' ? `Campaign: ${campaignName || '—'}`
        : mode === 'account' ? `Account: ${accountText || '—'}`
          : `Quoted code ${code || '—'}${datePreset !== 'any' ? ` · ${computeRange().label}` : ''}`

  // Switch audience: swap in that audience's starter template (only if the body
  // is still a pristine default — never overwrite custom text or a loaded
  // template), reset the recipient selection, and load where it makes sense.
  const pickAudience = (next: AudienceMode) => {
    setMode(next)
    if (defaultBodies.has(body) || !body.trim()) {
      setSubject(audienceTpl[next].subject)
      setBody(audienceTpl[next].body)
    }
    setExcluded(new Set())
    if (next === 'all') { fetchAllContacts().then((l) => { setRecipients(l.recipients); setScanned(l.scanned) }).catch(() => {}) }
    else { setRecipients([]); setScanned(null) }
    if (next === 'campaign') setCampaignId('')
    if (next === 'account') { setAccountId(''); setAccountText('') }
  }

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }

  const doSaveTemplate = async () => {
    const name = tplName.trim()
    if (!name) return
    try {
      if (WRITES_ENABLED) await saveTemplate(name, subject, body, me)
      showToast(WRITES_ENABLED ? `Template “${name}” saved` : 'Saved (preview — writes off)', WRITES_ENABLED ? 'success' : 'warn')
      setSaveOpen(false); setTplName(''); loadTemplates()
    } catch (e) { showToast('Couldn’t save template: ' + errMsg(e), 'error', 6000) }
  }

  const doDeleteTemplate = async (t: EmailTemplate) => {
    if (!window.confirm(`Delete template “${t.name}”?`)) return
    try { if (WRITES_ENABLED) await deleteTemplate(t.id); loadTemplates() } catch (e) { showToast('Couldn’t delete: ' + errMsg(e), 'error', 6000) }
  }

  const doSend = async () => {
    if (sending) return
    if (!subject.trim() || !body.trim()) { showToast('Subject and body are required.', 'warn'); return }
    if (finalRecipients.length === 0) { showToast('No recipients to send to.', 'warn'); return }
    setSending(true)
    try {
      const res = await sendMassEmail({ subject: subject.trim(), body, audience: audienceLabel, recipients: finalRecipients })
      if (res.notDeployed) { showToast('The mass-email function isn’t deployed yet — nothing sent.', 'warn', 7000); return }
      if (!res.ok) { showToast('Send failed: ' + (res.error || 'unknown'), 'error', 7000); return }
      showToast(`Sent to ${res.sent ?? finalRecipients.length}${res.failed ? ` (${res.failed} failed)` : ''}.`, 'success', 6000)
      setSendOpen(false)
      loadHistory()
    } catch (e) {
      showToast('Send failed: ' + errMsg(e), 'error', 7000)
    } finally {
      setSending(false)
    }
  }

  const toggleMetrics = async (id: string) => {
    if (metrics[id]) { setMetrics((m) => { const n = { ...m }; delete n[id]; return n }) ; return }
    try { const mm = await fetchMassEmailMetrics(id); setMetrics((m) => ({ ...m, [id]: mm })) } catch { /* ignore */ }
  }

  return (
    <>
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardLabel>Compose mass email</CardLabel>

        {/* Templates */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap', marginTop: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
          <span style={label as React.CSSProperties}>Template</span>
          <select onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }} defaultValue="" style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
            <option value="">— Load a saved template —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => { setTplName(''); setSaveOpen(true) }} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', cursor: 'pointer' }}>Save current as template</button>
          {templates.length > 0 && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{templates.length} saved</span>}
        </div>

        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <label style={label}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <label style={label}>Body <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--dim)' }}>— use {'{first name}'} to merge each contact's first name</span></label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} style={{ ...inputStyle, lineHeight: 1.6, resize: 'vertical' }} />
        </div>

        {/* Audience */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
          <label style={label}>Audience</label>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'all'} onChange={() => pickAudience('all')} /> All contacts
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'code'} onChange={() => pickAudience('code')} /> Quoted product code
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'account'} onChange={() => pickAudience('account')} /> Account
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'campaign'} onChange={() => pickAudience('campaign')} /> Campaign
            </label>
          </div>

          {mode === 'code' && (
            <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
              <select value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 230 }}>
                <option value="">— Product code —</option>
                {CODE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
              </select>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>quoted</span>
              <select value={datePreset} onChange={(e) => setDatePreset(e.target.value as typeof datePreset)} style={{ ...inputStyle, width: 'auto' }}>
                <option value="any">any time</option>
                <option value="1y">in the last year</option>
                <option value="2y">in the last 2 years</option>
                <option value="3y">in the last 3 years</option>
                <option value="5y">in the last 5 years</option>
                <option value="custom">between specific dates…</option>
              </select>
              {datePreset === 'custom' && (
                <>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
                </>
              )}
              <button onClick={loadRecipients} disabled={loadingRecips || !code.trim()} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: '#fff', background: code.trim() ? 'var(--accent)' : 'var(--border-strong)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 12px', cursor: code.trim() ? 'pointer' : 'default' }}>{loadingRecips ? 'Loading…' : 'Find contacts'}</button>
            </div>
          )}

          {mode === 'account' && (
            <div style={{ maxWidth: 340, marginBottom: 'var(--sp-2)' }}>
              <Autocomplete<ClientRow>
                value={accountText}
                onValueChange={(v) => { setAccountText(v); if (!v.trim()) { setAccountId(''); setRecipients([]) } }}
                search={(t) => searchClients(t)}
                itemKey={(c) => c.id}
                itemPrimary={(c) => c.name || '(unnamed account)'}
                itemSecondary={(c) => [c.city, c.state].filter(Boolean).join(', ')}
                onPick={(c) => { setAccountId(c.id); setAccountText(c.name || ''); setExcluded(new Set()); fetchContactsByAccount(c.id).then(setRecipients).catch((err) => showToast('Couldn’t load account: ' + errMsg(err), 'error', 6000)) }}
                placeholder="Search accounts…"
                minChars={2}
              />
            </div>
          )}

          {mode === 'campaign' && (
            <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
              <select value={campaignId} onChange={(e) => { const id = e.target.value; setCampaignId(id); setExcluded(new Set()); if (id) fetchContactsByCampaign(id).then(setRecipients).catch((err) => showToast('Couldn’t load campaign: ' + errMsg(err), 'error', 6000)); else setRecipients([]) }} style={{ ...inputStyle, width: 'auto', minWidth: 240 }}>
                <option value="">— Choose a campaign —</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {campaigns.length === 0 && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>No campaigns yet — create one from the Campaigns tab.</span>}
            </div>
          )}
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
            {loadingRecips ? 'Loading recipients…' : (
              <>
                <b>{finalRecipients.length}</b> recipient{finalRecipients.length !== 1 ? 's' : ''}{excluded.size > 0 ? ` (${excluded.size} excluded)` : ''} · {audienceLabel}
                {mode === 'all' && scanned != null && scanned > recipients.length && (
                  <span style={{ color: 'var(--dim)' }}> · {recipients.length} unique {recipients.length !== 1 ? 'addresses' : 'address'} from {scanned} contacts on file ({scanned - recipients.length} duplicate/blank collapsed)</span>
                )}
                {recipients.length > 0 && <button onClick={() => setReviewOpen((v) => !v)} style={{ marginLeft: 10, fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{reviewOpen ? 'Hide' : 'Review'} list</button>}
              </>
            )}
          </div>

          {reviewOpen && recipients.length > 0 && (
            <div style={{ marginTop: 'var(--sp-2)' }}>
              {/* A→Z jump index — click a letter to scroll to that last-name group. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {AZ.map((L) => {
                  const has = reviewGroups.has(L)
                  return (
                    <button key={L} onClick={() => has && jumpToLetter(L)} disabled={!has} title={has ? `Jump to ${L}` : undefined} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, minWidth: 22, height: 22, padding: '0 4px', borderRadius: 4, border: '1px solid ' + (has ? 'var(--border-strong)' : 'var(--border)'), background: '#fff', color: has ? 'var(--accent)' : 'var(--dim)', cursor: has ? 'pointer' : 'default' }}>{L}</button>
                  )
                })}
              </div>
              <div ref={reviewScrollRef} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 280, overflowY: 'auto' }}>
                {AZ.filter((L) => reviewGroups.has(L)).map((L) => (
                  <div key={L} ref={(el) => { letterRefs.current[L] = el }}>
                    <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '4px 10px', fontSize: 'var(--fs-caption)', fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)', zIndex: 1 }}>{L}</div>
                    {reviewGroups.get(L)!.map((r) => {
                      const ex = excluded.has(r.email.toLowerCase())
                      return (
                        <div key={r.email} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '6px 10px', borderBottom: '1px solid var(--border)', opacity: ex ? 0.45 : 1 }}>
                          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name || '(no name)'}</span>
                          <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</span>
                          <button onClick={() => setExcluded((s) => { const n = new Set(s); const k = r.email.toLowerCase(); n.has(k) ? n.delete(k) : n.add(k); return n })} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: ex ? 'var(--pos)' : 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{ex ? 'Include' : 'Exclude'}</button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
          <button onClick={() => setSendOpen(true)} disabled={finalRecipients.length === 0 || loadingRecips} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-base)', fontWeight: 700, color: '#fff', background: finalRecipients.length === 0 ? 'var(--border-strong)' : 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 22px', cursor: finalRecipients.length === 0 ? 'default' : 'pointer' }}>Send to {finalRecipients.length}</button>
        </div>
        {!WRITES_ENABLED && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', fontStyle: 'italic', marginTop: 'var(--sp-2)', textAlign: 'right' }}>Preview — writes are off, so nothing sends yet.</div>}
      </Card>

      {/* Saved templates management */}
      {templates.length > 0 && (
        <Card style={{ marginBottom: 'var(--sp-4)' }}>
          <CardLabel>Saved templates</CardLabel>
          <div style={{ marginTop: 'var(--sp-2)' }}>
            {templates.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                <button onClick={() => applyTemplate(t.id)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Use</button>
                <button onClick={() => doDeleteTemplate(t)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardLabel>Sent history</CardLabel>
        {history.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)' }}>No mass emails sent yet.</div>
        ) : (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            {history.map((h) => {
              const mm = metrics[h.id]
              return (
                <div key={h.id} style={{ padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
                    <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.subject}</span>
                    <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{h.sent_at ? fmtDate(h.sent_at) : ''}</span>
                    <button onClick={() => toggleMetrics(h.id)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{mm ? 'Hide' : 'Metrics'}</button>
                  </div>
                  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', marginTop: 2 }}>
                    {h.audience || '—'} · {h.sent_count}/{h.recipient_count} sent{h.failed_count ? ` · ${h.failed_count} failed` : ''}{h.sent_by ? ` · ${prettifyEmail(h.sent_by)}` : ''}
                  </div>
                  {mm && (
                    <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 6, flexWrap: 'wrap', fontSize: 'var(--fs-caption)', fontWeight: 700 }}>
                      <span style={{ color: 'var(--pos)' }}>Delivered {mm.delivered}</span>
                      <span style={{ color: 'var(--info)' }}>Opened {mm.opened}</span>
                      <span style={{ color: 'var(--accent)' }}>Bounced {mm.bounced}</span>
                      {mm.complained > 0 && <span style={{ color: 'var(--accent)' }}>Spam {mm.complained}</span>}
                      <span style={{ color: 'var(--dim)' }}>Sent (awaiting) {mm.sent}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {saveOpen && (
        <Modal title="Save as template" onClose={() => setSaveOpen(false)} width={420}>
          <label style={label}>Template name</label>
          <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Year-end thank you" style={{ ...inputStyle, marginBottom: 'var(--sp-3)' }} autoFocus />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <button onClick={() => setSaveOpen(false)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={doSaveTemplate} disabled={!tplName.trim()} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: 'pointer' }}>Save template</button>
          </div>
        </Modal>
      )}

      {sendOpen && (
        <Modal title={`Send to ${finalRecipients.length} recipient${finalRecipients.length !== 1 ? 's' : ''}?`} onClose={() => !sending && setSendOpen(false)} width={460}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
            This emails <b>{finalRecipients.length}</b> contact{finalRecipients.length !== 1 ? 's' : ''} ({audienceLabel}) individually, with their first name merged in. Each person only sees their own email. Bounces here won't affect Bad Contacts.
            {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', marginTop: 'var(--sp-2)' }}>Preview — writes are off, so nothing actually sends.</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <button onClick={() => setSendOpen(false)} disabled={sending} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: sending ? 'default' : 'pointer' }}>Cancel</button>
            <button onClick={doSend} disabled={sending} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: sending ? 'default' : 'pointer' }}>{sending ? 'Sending…' : `Send to ${finalRecipients.length}`}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
