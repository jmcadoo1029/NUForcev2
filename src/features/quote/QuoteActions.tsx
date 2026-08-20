import { useEffect, useState } from 'react'
import { Card, Modal, useToast } from '../../components'
import { fmtDate } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { fetchQuoteActions, flagQuote, unflagQuote, appendChatter, type QuoteActionsState, type QuoteFlag } from '../../lib/quoteActions'
import { WRITES_ENABLED } from '../../lib/config'

// Quote-side actions as a single compact chip row: Flag (live), Send (opens the
// composer), a live Sent/Followed-up status, plus a Chatter thread. Reads the
// quote's flag (quote_flags) and send/follow-up (follow_ups) state so the chips
// mirror the dashboard cards; chatter reads/writes data.chatterEntries. Sending
// itself is owned by SendComposer (via onOpenSend); this row only reflects state.
// Reads fail soft.

const who = (v?: string | null) => (v ? prettifyEmail(v) : 'Unknown')

export interface ChatterEntry { by: string; at: string; msg: string }

// A pill button: filled when "on", outlined when off. Clicking toggles (preview).
function Chip({ label, on, tone, onClick, title }: { label: string; on: boolean; tone: string; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '.02em',
        padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
        border: `1px solid ${on ? tone : 'var(--border-strong)'}`,
        background: on ? tone : '#fff', color: on ? '#fff' : 'var(--text)',
      }}
    >{label}</button>
  )
}

function ChatterModal({ entries, onPost, onClose }: { entries: ChatterEntry[]; onPost: (msg: string) => void; onClose: () => void }) {
  const [input, setInput] = useState('')
  const post = () => { const m = input.trim(); if (!m) return; onPost(m); setInput('') }
  return (
    <Modal title="Chatter" onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', maxHeight: 360, overflowY: 'auto', marginBottom: 'var(--sp-4)' }}>
        {entries.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4) 0', textAlign: 'center' }}>No entries yet. Be the first to add a note.</div>
        ) : (
          [...entries].reverse().map((e, i) => (
            <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--info)' }}>{who(e.by)}</span>
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>{e.at ? new Date(e.at).toLocaleString() : ''}</span>
              </div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{e.msg}</div>
            </div>
          ))
        )}
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
        placeholder="Add a note, update, or question… (Ctrl+Enter to post)"
        rows={3}
        style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.6, padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-2)' }}>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', fontStyle: 'italic' }}>{WRITES_ENABLED ? 'Visible to the whole team.' : 'Preview — posts don’t persist until writes are enabled.'}</span>
        <button onClick={post} disabled={!input.trim()} style={{ fontFamily: 'inherit', background: input.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 18px', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: input.trim() ? 'pointer' : 'default' }}>Post</button>
      </div>
    </Modal>
  )
}

export function QuoteActions({
  quoteId,
  opportunity,
  customer,
  stage,
  approvalStatus,
  chatter = [],
  me = '',
  onOpenSend,
}: {
  quoteId: string
  opportunity?: string | null
  customer?: string | null
  stage: string
  approvalStatus: string
  chatter?: ChatterEntry[]
  me?: string
  onOpenSend?: () => void
}) {
  const { showToast } = useToast()
  const [state, setState] = useState<QuoteActionsState | null>(null)
  // Live flag row (seeded from the fetch). When writes are on, Flag/unflag update
  // this from the server response; when off, `flaggedPreview` drives the chip.
  const [flagRow, setFlagRow] = useState<QuoteFlag | null>(null)
  const [flaggedPreview, setFlaggedPreview] = useState<boolean | null>(null)
  const [flagBusy, setFlagBusy] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagNoteDraft, setFlagNoteDraft] = useState('')
  const [previewNote, setPreviewNote] = useState('') // note shown for a preview (writes-off) flag
  const [entries, setEntries] = useState<ChatterEntry[]>(chatter)
  const [chatterOpen, setChatterOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetchQuoteActions(quoteId).then((s) => { if (alive) { setState(s); setFlagRow(s.flag) } })
    return () => { alive = false }
  }, [quoteId])

  const lastSend = state?.sends.find((s) => s.sent_at) || null
  const isClosed = stage === 'Closed Won' || stage === 'Closed Lost'
  const isFlagged = flaggedPreview !== null ? flaggedPreview : !!flagRow
  const isSent = !!lastSend
  const isFollowedUp = !!lastSend?.followed_up
  const inReadyQueue = approvalStatus === 'approved' && !isClosed && !isSent

  // Flag detail (who/when) lives on its own line below the chips, so the note has
  // room; the send/ready state stays inline.
  const detail = isSent && lastSend?.sent_at
    ? `Sent ${fmtDate(lastSend.sent_at)}`
    : inReadyQueue
      ? 'In the Ready-to-Send queue'
      : ''

  // Flag pilot — the first live write. With writes off these are preview toggles;
  // with writes on they upsert/resolve the quote_flags row (with the optional note)
  // and reflect the server result. The chip opens a popover to enter/read the note.
  const flagNote = flagRow?.note ?? (flaggedPreview ? previewNote : '')
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const doFlag = async () => {
    if (flagBusy) return
    const note = flagNoteDraft.trim()
    if (!WRITES_ENABLED) { setFlaggedPreview(true); setPreviewNote(note); setFlagOpen(false); setFlagNoteDraft(''); return }
    setFlagBusy(true)
    try {
      const row = await flagQuote({ quoteId, opportunity, customer, note, by: me })
      if (row) { setFlagRow(row); setFlaggedPreview(true); showToast('Quote flagged', 'success') }
      else showToast('Flag failed — no row returned', 'error')
    } catch (e) {
      showToast('Flag failed: ' + errMsg(e), 'error', 6000)
    } finally {
      setFlagBusy(false); setFlagOpen(false); setFlagNoteDraft('')
    }
  }

  const doUnflag = async () => {
    if (flagBusy) return
    if (!WRITES_ENABLED || !flagRow) { setFlaggedPreview(false); setPreviewNote(''); setFlagOpen(false); return }
    setFlagBusy(true)
    try {
      await unflagQuote(flagRow.id, me)
      setFlagRow(null); setFlaggedPreview(false)
      showToast('Flag removed', 'info')
    } catch (e) {
      showToast('Flag remove failed: ' + errMsg(e), 'error', 6000)
    } finally {
      setFlagBusy(false); setFlagOpen(false)
    }
  }

  const postChatter = async (msg: string) => {
    const entry = { by: me, at: new Date().toISOString(), msg }
    setEntries((cur) => [...cur, entry]) // optimistic
    if (!WRITES_ENABLED) return
    try {
      await appendChatter(quoteId, entry)
    } catch (e) {
      setEntries((cur) => cur.filter((x) => x !== entry)) // roll back on failure
      showToast('Couldn’t post chatter: ' + errMsg(e), 'error', 6000)
    }
  }

  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
      <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)', marginRight: 4 }}>Actions</span>
      <div style={{ position: 'relative' }}>
        <Chip label={flagBusy ? '…' : isFlagged ? 'Flagged' : 'Flag'} on={isFlagged} tone="var(--accent)" onClick={() => { setFlagNoteDraft(''); setFlagOpen((v) => !v) }} title="Flag this quote for attention" />
        {flagOpen && (
          <>
            <div onClick={() => setFlagOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 41, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', padding: 'var(--sp-3) var(--sp-4)', width: 280 }}>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 'var(--sp-2)' }}>{isFlagged ? 'Flag' : 'Flag this quote'}</div>
              {isFlagged ? (
                <>
                  {flagRow && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: flagNote ? 4 : 'var(--sp-3)' }}>Flagged by {who(flagRow.flagged_by)}{flagRow.flagged_at ? ` · ${fmtDate(flagRow.flagged_at)}` : ''}</div>}
                  {flagNote && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', fontStyle: 'italic', marginBottom: 'var(--sp-3)' }}>“{flagNote}”</div>}
                  <button onClick={doUnflag} disabled={flagBusy} style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 0', cursor: flagBusy ? 'default' : 'pointer' }}>{flagBusy ? 'Removing…' : 'Remove flag'}</button>
                </>
              ) : (
                <>
                  <textarea value={flagNoteDraft} onChange={(e) => setFlagNoteDraft(e.target.value)} placeholder="Add a note (optional)…" rows={2} style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', lineHeight: 1.5, padding: '7px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 'var(--sp-2)' }} />
                  <button onClick={doFlag} disabled={flagBusy} style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 0', cursor: flagBusy ? 'default' : 'pointer' }}>{flagBusy ? 'Flagging…' : 'Flag this quote'}</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <Chip label={isSent ? 'Sent' : 'Send'} on={isSent} tone="var(--pos)" onClick={() => onOpenSend?.()} title="Send this quote — compose the email, choose attachments, and it marks sent on send" />
      {isFollowedUp && <span title="A follow-up has gone out" style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: '#fff', background: 'var(--pos)', borderRadius: 20, padding: '3px 10px' }}>Followed up</span>}
      <button onClick={() => setChatterOpen(true)} title="Open the chatter thread" style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '.02em', padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        Chatter{entries.length > 0 && <span style={{ background: 'var(--info)', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 'var(--fs-caption)', fontWeight: 700 }}>{entries.length}</span>}
      </button>
      {detail && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>· {detail}</span>}

      {isFlagged && (
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>Flagged</span>
          {flagRow?.flagged_by && <span style={{ flexShrink: 0 }}>by {who(flagRow.flagged_by)}</span>}
          {flagRow?.flagged_at && <span style={{ flexShrink: 0 }}>· {fmtDate(flagRow.flagged_at)}</span>}
          {flagNote && <span style={{ fontStyle: 'italic', color: 'var(--text)', minWidth: 0 }}>— “{flagNote}”</span>}
        </div>
      )}

      {chatterOpen && <ChatterModal entries={entries} onPost={postChatter} onClose={() => setChatterOpen(false)} />}
    </Card>
  )
}
