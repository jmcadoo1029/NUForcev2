import { useEffect, useState } from 'react'
import { Card, CardLabel } from '../../components'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { fetchSentDocuments, fetchSentDocumentsForQuotes, signedDownloadUrl, type SentDocument } from '../../lib/sentDocs'
import { fetchRevisions } from '../../lib/quotes'
import { baseOpp } from '../../lib/opp'

// Sent-files history — the log of files that went out with each send (the Quote /
// Budget PDF and any attachments), across the WHOLE revision family, grouped by
// send event, each re-downloadable from Storage via a signed URL. So on 26-456C
// you also see when 26-456, 26-456A, and 26-456B were sent. Read-only: the rows
// are written and the bytes uploaded at send time (Phase 7).

const who = (v?: string | null) => (v ? prettifyEmail(v) : 'Unknown')
const fmtBytes = (n?: number | null) => (!n ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const KIND_META: Record<string, { label: string; tone: string }> = {
  quote_pdf: { label: 'Quote PDF', tone: 'var(--info)' },
  budget_pdf: { label: 'Budget PDF', tone: 'var(--info)' },
  attachment: { label: 'Attachment', tone: 'var(--dim)' },
}

// Group documents into send events (by follow_up_id, else by sent_at), preserving
// the newest-first order the query returns.
function groupBySend(docs: SentDocument[]): SentDocument[][] {
  const order: string[] = []
  const map = new Map<string, SentDocument[]>()
  docs.forEach((d) => {
    const key = d.follow_up_id || d.sent_at || d.id
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(d)
  })
  return order.map((k) => map.get(k)!)
}

export function SentFiles({ quoteId, opportunity }: { quoteId: string; opportunity?: string }) {
  const [docs, setDocs] = useState<SentDocument[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const base = baseOpp(opportunity || '')

  useEffect(() => {
    let alive = true
    // Family-wide: gather every revision's quote id, then all their sent docs. Fall
    // back to just this quote when there's no opportunity to resolve a family.
    const load = async () => {
      if (opportunity) {
        const revs = await fetchRevisions(opportunity)
        const ids = Array.from(new Set([quoteId, ...revs.map((r) => r.id)]))
        return fetchSentDocumentsForQuotes(ids)
      }
      return fetchSentDocuments(quoteId)
    }
    load().then((d) => { if (alive) setDocs(d) })
    return () => { alive = false }
  }, [quoteId, opportunity])

  const download = async (d: SentDocument) => {
    setErr('')
    if (!d.storage_bucket || !d.storage_path) { setErr(`No stored copy for “${d.file_name}”.`); return }
    setBusy(d.id)
    try {
      const url = await signedDownloadUrl(d.storage_bucket, d.storage_path)
      if (!url) { setErr(`Couldn’t get a download link for “${d.file_name}”.`); return }
      const a = document.createElement('a')
      a.href = url
      a.download = d.file_name
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    } finally {
      setBusy(null)
    }
  }

  const groups = docs ? groupBySend(docs) : []

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
        <CardLabel>Sent files</CardLabel>
        {docs && docs.length > 0 && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--muted)' }}>{docs.length} file{docs.length === 1 ? '' : 's'} · {groups.length} send{groups.length === 1 ? '' : 's'}</span>}
      </div>

      {!docs && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}

      {docs && docs.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
          Nothing sent yet for this quote or any of its revisions. When one is sent, the Quote PDF, Terms &amp; Conditions, and any attachments are logged here — tagged with the revision, date, and sender — and each can be re-downloaded exactly as it went out.
        </div>
      )}

      {docs && docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {groups.map((g, gi) => {
            const head = g[0]
            return (
              <div key={gi} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '8px 12px', background: 'var(--bg)', fontSize: 'var(--fs-sm)' }}>
                  {(base || head.revision) && (
                    <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: head.quote_id === quoteId ? 'var(--accent)' : 'var(--muted)', background: head.quote_id === quoteId ? 'var(--accent-soft)' : '#f0f2f5', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 9px', whiteSpace: 'nowrap' }}>
                      {base ? base + (head.revision || '') : `rev ${head.revision}`}{head.quote_id === quoteId ? ' · this one' : ''}
                    </span>
                  )}
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>Sent {head.sent_at ? fmtDate(head.sent_at) : '—'}</span>
                  <span style={{ color: 'var(--muted)' }}>· by {who(head.sent_by)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {g.map((d, di) => {
                    const meta = KIND_META[d.kind] || { label: d.kind, tone: 'var(--dim)' }
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '9px 12px', borderTop: di > 0 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: '#fff', background: meta.tone, padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>{meta.label}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</span>
                        {d.byte_size ? <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', flexShrink: 0 }}>{fmtBytes(d.byte_size)}</span> : null}
                        <button onClick={() => download(d)} disabled={busy === d.id} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: busy === d.id ? 'default' : 'pointer', flexShrink: 0 }}>{busy === d.id ? '…' : 'Download'}</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)' }}>{err}</div>}
    </Card>
  )
}
