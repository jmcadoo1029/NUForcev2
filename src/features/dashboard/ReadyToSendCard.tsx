import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, Modal, useToast } from '../../components'
import { money } from '../../lib/format'
import { restFetch } from '../../lib/restFetch'
import { WRITES_ENABLED } from '../../lib/config'
import { lineItemsFromData } from '../../data/quoteModel'
import { SendComposer } from '../quote/SendComposer'
import { useReadyToSend, dismissReadyToSend, type ReadyRow } from './useReadyToSend'

// Ready-to-Send queue — approved quotes not yet sent. Each row links to its quote,
// offers a Send action (opens the composer right here, with the Quote PDF and
// contacts prefilled from the quote), and a × to dismiss it from the queue.
// Sending marks the quote sent, so it drops off the queue. Writes gate on WRITES_ENABLED.

interface SendTarget {
  row: ReadyRow
  revision: string | null
  contactName: string
  contactEmail: string
  ccEmails: string[]
  testItem: string
  pdfInput: { qi: Record<string, any>; ti: Record<string, any>; lines: { code?: string | null; label: string; desc?: string; price: number }[]; budget: { on: boolean; rows: any[]; markup: string } }
}

export function ReadyToSendCard() {
  const { data, err } = useReadyToSend()
  const { showToast } = useToast()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<ReadyRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null)
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const rows = (data || []).filter((r) => !dismissedIds.has(r.id))
  const hide = (id: string) => setDismissedIds((cur) => new Set(cur).add(id))

  // Load the quote's full data, then open the composer with the Quote PDF and
  // contacts prefilled (To = primary contact, CC = related contacts).
  const openSend = async (r: ReadyRow) => {
    setLoadingId(r.id)
    try {
      const res = await restFetch<Array<{ data?: Record<string, any>; revision?: string | null }>>('GET', `quotes?id=eq.${encodeURIComponent(r.id)}&select=data,revision&limit=1`)
      const d = res?.[0]?.data || {}
      const qi = (d.qi || {}) as Record<string, any>
      const ti = (d.ti || {}) as Record<string, any>
      const b = (d.budget || {}) as Record<string, any>
      const lines = lineItemsFromData(d).map((l) => ({ code: l.code, label: l.label, desc: l.desc, price: l.price }))
      const cc = Array.isArray(qi.relatedContacts) ? qi.relatedContacts.map((rc: any) => String(rc?.email || '').trim()).filter(Boolean) : []
      setSendTarget({
        row: r,
        revision: res?.[0]?.revision ?? null,
        contactName: String(qi.contact || ''),
        contactEmail: String(qi.email || ''),
        ccEmails: cc,
        testItem: String(ti.item || ''),
        pdfInput: { qi, ti, lines, budget: { on: !!b.on, rows: Array.isArray(b.rows) ? b.rows : [], markup: b.markup != null ? String(b.markup) : '25' } },
      })
    } catch (e) {
      showToast('Couldn’t load the quote: ' + errMsg(e), 'error', 6000)
    } finally {
      setLoadingId(null)
    }
  }

  const confirmDismiss = async () => {
    if (!target || busy) return
    const row = target
    if (!WRITES_ENABLED) {
      hide(row.id)
      setTarget(null)
      showToast('Removed from Ready to Send (preview)', 'info')
      return
    }
    setBusy(true)
    try {
      await dismissReadyToSend(row.id)
      hide(row.id)
      showToast(`${row.opportunity} removed from Ready to Send`, 'success')
      setTarget(null)
    } catch (e) {
      showToast('Couldn’t remove: ' + errMsg(e), 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  const sendBtn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', flexShrink: 0 }

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
        <CardLabel>Ready to send</CardLabel>
        {rows.length > 0 && (
          <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: '#fff', background: 'var(--info)', borderRadius: 20, padding: '2px 9px' }}>{rows.length}</span>
        )}
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && data && rows.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Nothing waiting to send.</div>}

      {!err && rows.length > 0 && (
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', borderBottom: '1px solid var(--border)' }}>
              <Link
                to={`/quote/${r.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '10px 4px', textDecoration: 'none', color: 'var(--text)', flex: 1, minWidth: 0 }}
              >
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.opportunity}</span>
                <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</span>
                <span
                  style={{
                    fontSize: 'var(--fs-caption)',
                    fontWeight: 700,
                    color: r.daysInQueue >= 7 ? 'var(--warn)' : 'var(--dim)',
                    background: r.daysInQueue >= 7 ? 'var(--warn-soft)' : '#f0f2f5',
                    borderRadius: 12,
                    padding: '2px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.daysInQueue}d in queue
                </span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>{money(r.total)}</span>
              </Link>
              <button onClick={() => openSend(r)} disabled={loadingId === r.id} style={sendBtn} title="Compose and send this quote">{loadingId === r.id ? '…' : 'Send'}</button>
              <button
                onClick={() => setTarget(r)}
                aria-label={`Remove ${r.opportunity} from Ready to Send`}
                title="Remove from Ready to Send"
                style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '4px 6px' }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {sendTarget && (
        <SendComposer
          mode="quote"
          quoteId={sendTarget.row.id}
          opportunity={sendTarget.row.opportunity}
          revision={sendTarget.revision}
          contactName={sendTarget.contactName}
          contactEmail={sendTarget.contactEmail}
          ccEmails={sendTarget.ccEmails}
          testItem={sendTarget.testItem}
          pdfInput={sendTarget.pdfInput}
          onClose={() => setSendTarget(null)}
          onSent={() => { hide(sendTarget.row.id); setSendTarget(null) }}
        />
      )}

      {target && (
        <Modal title="Remove from Ready to Send?" onClose={() => !busy && setTarget(null)} width={440}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
            Remove <b>{target.opportunity}</b> from the Ready-to-Send queue? It stays approved and you can still send it from the quote later — this just clears it from the queue.
            {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', marginTop: 'var(--sp-2)' }}>Preview — writes are off, so this only clears it from your view.</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <button onClick={() => setTarget(null)} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
            <button onClick={confirmDismiss} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Removing…' : 'Remove'}</button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
