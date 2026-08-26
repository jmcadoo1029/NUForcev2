import { useEffect, useMemo, useState } from 'react'
import { Card, CardLabel, Modal, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import {
  fetchAllContacts, fetchContactsByProductCode, fetchTemplates, saveTemplate, deleteTemplate,
  sendMassEmail, fetchMassEmails, fetchMassEmailMetrics,
  type Recipient, type EmailTemplate, type MassEmailRow, type MassEmailMetrics,
} from '../../lib/massEmail'

// Mass Emails — compose + send a personalized blast to all contacts (or everyone
// quoted a given product code), from reusable saved templates, with a history log
// and Resend delivery metrics. Managers only (gated at the route). Each recipient
// gets an individual send, so nobody sees another client's address, and bounces
// here don't touch Bad Contacts.

const DEFAULT_SUBJECT = 'NU Laboratories — Our Testing Capabilities'
const DEFAULT_BODY = `Hello, {first name}!

This is [Your Name], Sales Manager, from NU Laboratories wanting to thank you for all of the fantastic opportunities! It has been an absolute pleasure working with you, and I hope that we can continue to meet your testing needs for many years to come!

I want to take this time to remind you of all of the great services that NU Laboratories has to offer, including (but not limited to) medium weight and lightweight shock, acoustic noise, including high intensity noise susceptibility with OASPL's reaching upwards of 170 dB, as well as noise emissions testing, Type I and II vibration, EMI, Power Quality, temperature/humidity, salt/fog, etc. Please take a few minutes to visit our website at www.nulabs.com to see the wide range of our capabilities.

Please contact me via phone or email to discuss any upcoming projects, it would be our pleasure to assist in your testing needs this year!

Looking forward to hearing from you soon!`

const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
const label: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4, display: 'block' }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function MassEmails() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''

  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)

  const [mode, setMode] = useState<'all' | 'code'>('all')
  const [code, setCode] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([])
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

  useEffect(() => { loadTemplates(); loadHistory() }, [])

  // Load recipients for the current audience.
  const loadRecipients = async () => {
    setLoadingRecips(true)
    setExcluded(new Set())
    try {
      const list = mode === 'all' ? await fetchAllContacts() : await fetchContactsByProductCode(code)
      setRecipients(list)
      if (mode === 'code' && list.length === 0) showToast(`No contacts found for product code ${code}.`, 'warn', 4000)
    } catch (e) {
      showToast('Couldn’t load recipients: ' + errMsg(e), 'error', 6000)
    } finally {
      setLoadingRecips(false)
    }
  }
  useEffect(() => { if (mode === 'all') loadRecipients() }, []) // initial: all contacts

  const finalRecipients = useMemo(() => recipients.filter((r) => !excluded.has(r.email.toLowerCase())), [recipients, excluded])
  const audienceLabel = mode === 'all' ? 'All contacts' : `Quoted code ${code || '—'}`

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
              <input type="radio" checked={mode === 'all'} onChange={() => { setMode('all'); fetchAllContacts().then((l) => { setRecipients(l); setExcluded(new Set()) }) }} /> All contacts
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'code'} onChange={() => { setMode('code'); setRecipients([]) }} /> Quoted product code
            </label>
            {mode === 'code' && (
              <>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 11" style={{ ...inputStyle, width: 100 }} />
                <button onClick={loadRecipients} disabled={loadingRecips || !code.trim()} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 12px', cursor: 'pointer' }}>{loadingRecips ? 'Loading…' : 'Find contacts'}</button>
              </>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
            {loadingRecips ? 'Loading recipients…' : (
              <>
                <b>{finalRecipients.length}</b> recipient{finalRecipients.length !== 1 ? 's' : ''}{excluded.size > 0 ? ` (${excluded.size} excluded)` : ''} · {audienceLabel}
                {recipients.length > 0 && <button onClick={() => setReviewOpen((v) => !v)} style={{ marginLeft: 10, fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{reviewOpen ? 'Hide' : 'Review'} list</button>}
              </>
            )}
          </div>

          {reviewOpen && recipients.length > 0 && (
            <div style={{ marginTop: 'var(--sp-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 260, overflowY: 'auto' }}>
              {recipients.map((r) => {
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
