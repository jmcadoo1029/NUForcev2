import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { fetchSelf } from '../../lib/me'
import { fetchTemplate, fillTemplate, type TemplateKey, type TemplateVars } from '../../lib/emailTemplates'
import { fetchAttachableDocuments, fetchTermsDocument, type QuoteDocument } from '../../lib/quoteDocs'
import { downloadObject } from '../../lib/storage'
import { invokeQuoteSend, filesToAttachments, logSentFiles, type OutgoingFile, type SendKind, type QuoteSendResult } from '../../lib/sendQuote'
import { markQuoteSent, rescheduleFollowUp } from '../../lib/followups'
import type { PdfLine, PdfBudget } from './pdf/buildQuotePdf'

// The send composer — one modal for both quote sends and follow-up nudges.
// Editable template with live placeholder fill, recipient + attachment
// selection, and a real send through the quote-send edge function. On success it
// records the send in NUForce (mark-sent for a quote, +90d reschedule for a
// follow-up) and logs the sent files for re-download. Everything gates on
// WRITES_ENABLED; if the email function isn't deployed yet, it says so cleanly.

const TERMS_BUNDLED_URL = '/documents/terms-and-conditions.pdf'

export interface SendComposerProps {
  mode: SendKind
  quoteId: string
  opportunity: string
  revision?: string | null
  contactName?: string | null
  contactEmail?: string | null // primary contact → the "To" field
  ccEmails?: string[] | null // related contacts → prefilled into "Cc" (quote mode)
  testItem?: string | null
  followUpId?: string | null // follow_up mode: the row whose clock we reset
  pdfInput?: { qi: Record<string, any>; ti: Record<string, any>; lines: PdfLine[]; budget?: PdfBudget }
  onClose: () => void
  onSent?: (result: QuoteSendResult) => void
}

type Source = 'quote_pdf' | 'terms_stored' | 'terms_bundled' | 'stored_doc' | 'upload'

interface Selectable {
  id: string
  label: string
  fileName: string
  mime: string
  logKind: 'quote_pdf' | 'attachment'
  source: Source
  selected: boolean
  required?: boolean
  doc?: QuoteDocument
  file?: File
}

const firstNameOf = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || ''

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4, display: 'block' }

export function SendComposer(props: SendComposerProps) {
  const { mode, quoteId, opportunity, revision, contactName, contactEmail, ccEmails, testItem, followUpId, pdfInput, onClose, onSent } = props
  const { showToast } = useToast()

  const [senderName, setSenderName] = useState('')
  const [to, setTo] = useState(contactEmail || '')
  // Related contacts are CC'd on a quote send; a follow-up goes to the primary only.
  const [cc, setCc] = useState(mode === 'quote' ? (ccEmails || []).filter(Boolean).join(', ') : '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [rawTemplate, setRawTemplate] = useState<{ subject: string; body: string }>({ subject: '', body: '' })
  const [items, setItems] = useState<Selectable[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadSeq = useRef(1)

  const vars: TemplateVars = useMemo(
    () => ({ contactFirstName: firstNameOf(contactName), quoteNumber: opportunity, testItem: testItem || '', senderName }),
    [contactName, opportunity, testItem, senderName],
  )

  // Load sender, template, and attachable documents once.
  useEffect(() => {
    let alive = true
    const templateKey: TemplateKey = mode === 'quote' ? 'quote' : 'follow_up'
    Promise.all([fetchSelf(), fetchTemplate(templateKey), fetchAttachableDocuments(quoteId), fetchTermsDocument()]).then(
      ([self, tpl, docs, terms]) => {
        if (!alive) return
        setSenderName(self.name)
        setRawTemplate({ subject: tpl.subject, body: tpl.body })
        const v: TemplateVars = { contactFirstName: firstNameOf(contactName), quoteNumber: opportunity, testItem: testItem || '', senderName: self.name }
        setSubject(fillTemplate(tpl.subject, v))
        setBody(fillTemplate(tpl.body, v))

        const list: Selectable[] = []
        if (mode === 'quote' && pdfInput) {
          list.push({ id: 'quote_pdf', label: 'Quote PDF (generated at send)', fileName: `${opportunity || 'Quote'} Quote.pdf`, mime: 'application/pdf', logKind: 'quote_pdf', source: 'quote_pdf', selected: true, required: true })
        }
        // Terms & Conditions — stored doc if present, else the bundled copy.
        if (terms) {
          list.push({ id: 'terms', label: `Terms & Conditions (${terms.label})`, fileName: terms.file_name, mime: terms.mime || 'application/pdf', logKind: 'attachment', source: 'terms_stored', selected: mode === 'quote', doc: terms })
        } else {
          list.push({ id: 'terms', label: 'Terms & Conditions', fileName: 'NU Laboratories Terms and Conditions.pdf', mime: 'application/pdf', logKind: 'attachment', source: 'terms_bundled', selected: mode === 'quote' })
        }
        // Stored spec/attachment docs for this quote.
        docs.filter((d) => d.kind !== 'terms').forEach((d) => {
          list.push({ id: `doc_${d.id}`, label: `${d.kind === 'spec' ? 'Spec' : 'File'}: ${d.label}`, fileName: d.file_name, mime: d.mime || 'application/pdf', logKind: 'attachment', source: 'stored_doc', selected: false, doc: d })
        })
        setItems(list)
        setLoading(false)
      },
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, mode])

  const toggle = (id: string) => setItems((cur) => cur.map((it) => (it.id === id || it.required ? (it.required ? it : { ...it, selected: !it.selected }) : it)))
  const removeUpload = (id: string) => setItems((cur) => cur.filter((it) => it.id !== id))
  const addUploads = (files: FileList | null) => {
    if (!files || !files.length) return
    const added: Selectable[] = Array.from(files).map((file) => ({ id: `up_${uploadSeq.current++}`, label: `Upload: ${file.name}`, fileName: file.name, mime: file.type || 'application/octet-stream', logKind: 'attachment', source: 'upload', selected: true, file }))
    setItems((cur) => [...cur, ...added])
  }

  // Resolve each selected item's bytes for sending + logging.
  const resolveBytes = async (it: Selectable): Promise<OutgoingFile | null> => {
    if (it.source === 'quote_pdf') {
      if (!pdfInput) return null
      const { buildQuotePdf } = await import('./pdf/buildQuotePdf')
      const out = await buildQuotePdf({ qi: pdfInput.qi, ti: pdfInput.ti, lines: pdfInput.lines, budget: pdfInput.budget, output: 'return' })
      if (!out) return null
      return { kind: 'quote_pdf', fileName: out.fileName, mime: out.mime, blob: out.blob }
    }
    if (it.source === 'terms_bundled') {
      const res = await fetch(TERMS_BUNDLED_URL)
      if (!res.ok) return null
      return { kind: 'attachment', fileName: it.fileName, mime: it.mime, blob: await res.blob() }
    }
    if ((it.source === 'terms_stored' || it.source === 'stored_doc') && it.doc) {
      const blob = await downloadObject(it.doc.storage_bucket, it.doc.storage_path)
      if (!blob) return null
      return { kind: 'attachment', fileName: it.fileName, mime: it.mime, blob }
    }
    if (it.source === 'upload' && it.file) {
      return { kind: 'attachment', fileName: it.fileName, mime: it.mime, blob: it.file }
    }
    return null
  }

  const recipients = (v: string) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const doSend = async () => {
    if (busy) return
    const toList = recipients(to)
    if (!toList.length) { showToast('Add at least one recipient.', 'error'); return }
    // quotes.id is an integer column, so row.id arrives as a number — coerce to a
    // string so the edge function (which requires a string quoteId) accepts it.
    const qid = String(quoteId ?? '')
    setBusy(true)
    try {
      const selected = items.filter((it) => it.selected || it.required)
      const resolved = (await Promise.all(selected.map(async (it) => ({ src: it.source, file: await resolveBytes(it) })))).filter((r) => r.file) as { src: Source; file: OutgoingFile }[]
      const files = resolved.map((r) => r.file) // everything selected — attached to the email
      // The Terms & Conditions is emailed but NOT recorded in the Sent-files log
      // (it's boilerplate; the log should show the quote + user-picked attachments).
      const logFiles = resolved.filter((r) => r.src !== 'terms_stored' && r.src !== 'terms_bundled').map((r) => r.file)

      if (!WRITES_ENABLED) {
        showToast(`${mode === 'quote' ? 'Quote' : 'Follow-up'} to ${toList[0]} composed (preview — writes off)`, 'info', 4000)
        onSent?.({ ok: true, status: 'preview' })
        onClose()
        return
      }

      const attachments = await filesToAttachments(files)
      const result = await invokeQuoteSend({
        kind: mode, quoteId: qid, opportunity, to: toList, cc: recipients(cc),
        subject, body, fromName: senderName, attachments,
      })

      if (result.notDeployed) {
        showToast('Email backend isn’t deployed yet — nothing sent. (Everything else is ready.)', 'warn', 6000)
        setBusy(false)
        return
      }
      if (!result.ok) {
        showToast('Send failed: ' + (result.error || 'unknown error'), 'error', 6000)
        setBusy(false)
        return
      }

      // Record the send in NUForce.
      let followUpRowId: string | null = followUpId || null
      const me = senderName || ''
      if (mode === 'quote') {
        const sent = await markQuoteSent({ quoteId: qid, opportunity, customer: '', by: me })
        followUpRowId = sent?.id || null
      } else if (followUpId) {
        await rescheduleFollowUp(followUpId, me)
      }
      await logSentFiles({ quoteId: qid, followUpId: followUpRowId, revision: revision || null, sentBy: me, files: logFiles })

      showToast(mode === 'quote' ? 'Quote sent — marked sent, follow-up set for 30 days' : 'Follow-up sent — next reminder in 90 days', 'success', 5000)
      onSent?.(result)
      onClose()
    } catch (e) {
      showToast('Send failed: ' + errMsg(e), 'error', 6000)
      setBusy(false)
    }
  }

  const title = mode === 'quote' ? `Send quote ${opportunity}` : `Send follow-up — ${opportunity}`

  return (
    <Modal title={title} onClose={() => !busy && onClose()} width={640}>
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4) 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>To</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cc</label>
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional, comma-separated" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle}>Message</label>
              <button onClick={() => { setSubject(fillTemplate(rawTemplate.subject, vars)); setBody(fillTemplate(rawTemplate.body, vars)) }} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}>Reset to template</button>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={{ ...inputStyle, lineHeight: 1.6, resize: 'vertical', whiteSpace: 'pre-wrap' }} />
          </div>

          <div>
            <label style={labelStyle}>Attachments</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--sp-2)' }}>
              {items.map((it) => (
                <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: it.required ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={it.selected || !!it.required} disabled={!!it.required} onChange={() => toggle(it.id)} style={{ cursor: it.required ? 'default' : 'pointer' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  {it.required && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', flexShrink: 0 }}>always</span>}
                  {it.source === 'upload' && <button onClick={(e) => { e.preventDefault(); removeUpload(it.id) }} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>}
                </label>
              ))}
            </div>
            <input ref={uploadRef} type="file" multiple onChange={(e) => { addUploads(e.target.files); if (uploadRef.current) uploadRef.current.value = '' }} style={{ display: 'none' }} />
            <button onClick={() => uploadRef.current?.click()} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', cursor: 'pointer', width: '100%' }}>+ Attach a file from your computer</button>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 6 }}>The Budget PDF is never attached to a customer send.</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-2)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>Edits here apply to this email only. Change the default in More → Email templates.</span>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
              {!WRITES_ENABLED && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--warn)', fontStyle: 'italic' }}>preview</span>}
              <button onClick={onClose} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
              <button onClick={doSend} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 20px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Sending…' : mode === 'quote' ? 'Send quote' : 'Send follow-up'}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
