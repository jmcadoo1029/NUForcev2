import { useEffect, useRef, useState } from 'react'
import { Modal, Button, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fetchIsApprover } from '../../lib/perms'
import { fetchSelf } from '../../lib/me'
import { fetchTemplate, saveTemplate, fillTemplate, DEFAULT_TEMPLATES, TOKENS, type TemplateKey, type TemplateVars } from '../../lib/emailTemplates'

// Email Templates manager — the global send + follow-up templates, editable here
// like the Product Catalog. One row per key in quote_templates. Placeholders are
// filled per-send from the quote; here we show a live preview with sample values.
// Gated by WRITES_ENABLED; editing is manager-only.

const KEYS: Array<{ key: TemplateKey; label: string }> = [
  { key: 'quote', label: 'Quote email' },
  { key: 'follow_up', label: 'Follow-up email' },
  { key: 'follow_up_combined', label: 'Combined follow-up' },
]

// Per-template token legend — the combined follow-up uses {Quote List} (all
// quotes + their items) instead of the singular {Quote #}/{Test Item}.
const legendFor = (key: TemplateKey): Array<{ token: string; desc: string }> =>
  key === 'follow_up_combined'
    ? [
        { token: TOKENS.contactFirstName, desc: 'Contact’s first name' },
        { token: TOKENS.quoteList, desc: 'List of quotes + items' },
        { token: TOKENS.senderName, desc: 'Your full name' },
      ]
    : [
        { token: TOKENS.contactFirstName, desc: 'Contact’s first name' },
        { token: TOKENS.quoteNumber, desc: 'Quote number' },
        { token: TOKENS.testItem, desc: 'Test item' },
        { token: TOKENS.senderName, desc: 'Your full name' },
      ]

const SAMPLE: TemplateVars = { contactFirstName: 'John', quoteNumber: '26-1234B', testItem: 'Widget Assembly', quoteList: '#26-1234B — Widget Assembly\n#26-1235 — Gearbox Housing', senderName: 'Jane Tester' }

export function Templates({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [active, setActive] = useState<TemplateKey>('quote')
  const [drafts, setDrafts] = useState<Record<TemplateKey, { subject: string; body: string }>>({ quote: { subject: '', body: '' }, follow_up: { subject: '', body: '' }, follow_up_combined: { subject: '', body: '' } })
  const [loaded, setLoaded] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sample, setSample] = useState<TemplateVars>(SAMPLE)
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const focusedRef = useRef<'subject' | 'body'>('body')

  useEffect(() => {
    let alive = true
    Promise.all([fetchTemplate('quote'), fetchTemplate('follow_up'), fetchTemplate('follow_up_combined'), fetchSelf()]).then(([q, f, fc, self]) => {
      if (!alive) return
      setDrafts({ quote: { subject: q.subject, body: q.body }, follow_up: { subject: f.subject, body: f.body }, follow_up_combined: { subject: fc.subject, body: fc.body } })
      setSample((s) => ({ ...s, senderName: self.name || s.senderName }))
      setLoaded(true)
    })
    fetchIsApprover().then((v) => alive && setIsManager(v))
    return () => { alive = false }
  }, [])

  const cur = drafts[active]
  const setCur = (patch: Partial<{ subject: string; body: string }>) => setDrafts((d) => ({ ...d, [active]: { ...d[active], ...patch } }))

  // Insert a token into whichever field was last focused, at the cursor.
  const insertToken = (token: string) => {
    if (!isManager) return
    const field = focusedRef.current
    const el = field === 'subject' ? subjectRef.current : bodyRef.current
    const value = cur[field]
    const start = el ? el.selectionStart ?? value.length : value.length
    const end = el ? el.selectionEnd ?? value.length : value.length
    const next = value.slice(0, start) + token + value.slice(end)
    setCur({ [field]: next })
    requestAnimationFrame(() => {
      if (el) { el.focus(); const pos = start + token.length; el.setSelectionRange(pos, pos) }
    })
  }

  const resetToDefault = () => setCur({ subject: DEFAULT_TEMPLATES[active].subject, body: DEFAULT_TEMPLATES[active].body })

  const save = async () => {
    if (!WRITES_ENABLED) { showToast('Preview — template writes are off.', 'warn'); return }
    setBusy(true)
    try {
      for (const { key } of KEYS) await saveTemplate(key, drafts[key].subject, drafts[key].body, me)
      showToast('Templates saved', 'success')
    } catch (e) {
      showToast('Save failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 7000)
    } finally {
      setBusy(false)
    }
  }

  const input: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: isManager ? '#fff' : 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }
  const tab = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '7px 16px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent)' : '#fff', color: on ? '#fff' : 'var(--text)' })

  return (
    <Modal title="Email Templates" onClose={onClose} width={760}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {KEYS.map((k) => <button key={k.key} style={tab(active === k.key)} onClick={() => setActive(k.key)}>{k.label}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          {isManager ? (
            <>
              <Button variant="ghost" small onClick={resetToDefault} disabled={busy}>Reset to default</Button>
              <Button variant="primary" small onClick={save} disabled={busy || !loaded}>{busy ? 'Saving…' : 'Save'}</Button>
            </>
          ) : (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', fontStyle: 'italic' }}>View only — managers can edit</span>
          )}
        </div>
      </div>

      {!loaded ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4) 0' }}>Loading…</div>
      ) : (
        <>
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4 }}>Subject</label>
            <input ref={subjectRef} value={cur.subject} onChange={(e) => setCur({ subject: e.target.value })} onFocus={() => (focusedRef.current = 'subject')} readOnly={!isManager} style={input} />
          </div>

          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <label style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4 }}>Body</label>
            <textarea ref={bodyRef} value={cur.body} onChange={(e) => setCur({ body: e.target.value })} onFocus={() => (focusedRef.current = 'body')} readOnly={!isManager} rows={12} style={{ ...input, lineHeight: 1.6, resize: 'vertical', whiteSpace: 'pre-wrap' }} />
          </div>

          <div style={{ marginBottom: 'var(--sp-4)' }}>
            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Placeholders {isManager && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontStyle: 'italic' }}>· click to insert</span>}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {legendFor(active).map((t) => (
                <button key={t.token} onClick={() => insertToken(t.token)} disabled={!isManager} title={t.desc} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', cursor: isManager ? 'pointer' : 'default' }}>{t.desc}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Preview <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontStyle: 'italic', color: 'var(--muted)' }}>· sample data</span></div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)' }}>
              <div style={{ fontWeight: 700, marginBottom: 'var(--sp-2)', color: 'var(--text)' }}>{fillTemplate(cur.subject, sample)}</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{fillTemplate(cur.body, sample)}</div>
            </div>
          </div>

          {!WRITES_ENABLED && isManager && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-3)' }}>Preview — writes are off, so Save won’t persist yet.</div>}
        </>
      )}
    </Modal>
  )
}
