import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components'
import { restFetch } from '../../lib/restFetch'
import { getSessionEmail } from '../../lib/auth'
import { fetchSchedules } from '../../lib/scheduler'

// Month calendar of what's coming up, reached from a button in the dashboard top bar.
// Three event kinds, color-coded: contact follow-up reminders (yours), per-quote
// follow-ups when they come due, and scheduled outreach sends by next fire date.
// Click a day to see its events listed below the grid.

type Kind = 'reminder' | 'followup' | 'outreach' | 'due'
interface CalEvent { date: string; kind: Kind; title: string; sub: string; quoteKey?: string }

const KIND_COLOR: Record<Kind, string> = { reminder: 'var(--info)', followup: 'var(--accent)', outreach: 'var(--pos)', due: '#8250c4' }
const KIND_LABEL: Record<Kind, string> = { reminder: 'Follow-up reminder', followup: 'Quote follow-up', outreach: 'Scheduled outreach', due: 'In-progress due date' }
const KINDS: Kind[] = ['reminder', 'followup', 'outreach', 'due']

// Local YYYY-MM-DD for a timestamp; plain date strings are used as-is (first 10 chars).
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ymdFromTs = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : ymdOf(d) }

async function loadEvents(me: string): Promise<CalEvent[]> {
  const out: CalEvent[] = []

  // 1) Contact follow-up reminders — scoped to the signed-in user (same as the card).
  try {
    const rem = await restFetch<Array<{ contact_name: string | null; account: string | null; due_at: string | null; created_by: string | null }>>(
      'GET', 'contact_reminders?select=contact_name,account,due_at,created_by&status=eq.active&order=due_at&limit=1000',
    )
    ;(rem || []).forEach((r) => {
      if (me && (r.created_by || '').toLowerCase() !== me.toLowerCase()) return
      const date = (r.due_at || '').slice(0, 10)
      if (date) out.push({ date, kind: 'reminder', title: (r.contact_name || 'Contact').trim() || 'Contact', sub: (r.account || '').trim() })
    })
  } catch { /* best-effort */ }

  // 2) Per-quote follow-ups — explicit next date, else 30 days after the send.
  try {
    const fu = await restFetch<Array<{ quote_id: string | null; sent_at: string | null; followup_again_at: string | null; quotes?: { opportunity?: string | null; customer?: string | null; data?: { qi?: { stage?: string } } } }>>(
      'GET', 'follow_ups?select=quote_id,sent_at,followup_again_at,quotes(opportunity,customer,data)&followed_up=eq.false&or=(voided.is.null,voided.eq.false)&limit=1000',
    )
    ;(fu || []).forEach((r) => {
      const stage = String(r.quotes?.data?.qi?.stage || '')
      if (stage === 'Closed Won' || stage === 'Closed Lost') return
      let date = ''
      if (r.followup_again_at) date = ymdFromTs(r.followup_again_at)
      else if (r.sent_at) { const d = new Date(r.sent_at); if (!isNaN(d.getTime())) { d.setDate(d.getDate() + 30); date = ymdOf(d) } }
      if (!date) return
      const opp = (r.quotes?.opportunity || '').trim()
      out.push({ date, kind: 'followup', title: opp || 'Quote follow-up', sub: (r.quotes?.customer || '').trim(), quoteKey: opp || r.quote_id || '' })
    })
  } catch { /* best-effort */ }

  // 3) Scheduled outreach — enabled schedules by their next fire date.
  try {
    const sch = await fetchSchedules()
    ;(sch || []).filter((s) => s.enabled && s.next_fire_at).forEach((s) => {
      const date = ymdFromTs(s.next_fire_at as string)
      if (date) out.push({ date, kind: 'outreach', title: (s.name || 'Outreach').trim() || 'Outreach', sub: String(s.cadence || '') })
    })
  } catch { /* best-effort */ }

  // 4) In-progress board due dates.
  try {
    const oq = await restFetch<Array<{ opportunity: string | null; account: string | null; description: string | null; due_date: string | null }>>(
      'GET', 'open_quotes?select=opportunity,account,description,due_date&due_date=not.is.null&limit=1000',
    )
    ;(oq || []).forEach((r) => {
      const date = (r.due_date || '').slice(0, 10)
      if (!date) return
      const opp = (r.opportunity || '').trim()
      out.push({ date, kind: 'due', title: opp || (r.account || '').trim() || 'In progress', sub: (r.description || r.account || '').trim(), quoteKey: opp })
    })
  } catch { /* best-effort */ }

  return out
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function CalendarModal({ onClose }: { onClose: () => void }) {
  const me = getSessionEmail() || ''
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState<string>(ymdOf(today))
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    loadEvents(me).then((d) => alive && setEvents(d)).catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [me])

  // Group events by day.
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    ;(events || []).forEach((e) => { const a = m.get(e.date) || []; a.push(e); m.set(e.date, a) })
    return m
  }, [events])

  // 6-week grid starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first); start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [cursor])

  const todayYmd = ymdOf(today)
  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
  const selectedEvents = (byDay.get(selected) || []).slice().sort((a, b) => a.kind.localeCompare(b.kind))

  const navBtn: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--muted)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer' }
  const dot = (k: Kind): CSSProperties => ({ width: 7, height: 7, borderRadius: '50%', background: KIND_COLOR[k], flexShrink: 0 })

  return (
    <Modal title="Calendar — what's coming up" onClose={onClose} width={760}>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <button style={navBtn} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, minWidth: 180 }}>{monthLabel}</div>
        <button style={navBtn} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        <button style={{ ...navBtn, marginLeft: 4 }} onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(todayYmd) }}>Today</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}><span style={dot(k)} /> {KIND_LABEL[k]}</span>
          ))}
        </div>
      </div>

      {!events && !err && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}

      {events && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {WD.map((w) => (
              <div key={w} style={{ background: 'var(--bg)', textAlign: 'center', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', padding: '6px 0' }}>{w}</div>
            ))}
            {cells.map((d) => {
              const ymd = ymdOf(d)
              const inMonth = d.getMonth() === cursor.getMonth()
              const evs = byDay.get(ymd) || []
              const isToday = ymd === todayYmd
              const isSel = ymd === selected
              return (
                <button
                  key={ymd}
                  onClick={() => setSelected(ymd)}
                  style={{
                    fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 74, padding: '4px 5px',
                    background: isSel ? 'var(--accent-soft)' : 'var(--surface)',
                    border: isSel ? '1px solid var(--accent)' : '1px solid transparent',
                    opacity: inMonth ? 1 : 0.4,
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <span style={{ fontSize: 'var(--fs-caption)', fontWeight: isToday ? 800 : 600, color: isToday ? '#fff' : 'var(--text)', background: isToday ? 'var(--accent)' : 'transparent', borderRadius: 20, padding: isToday ? '0 6px' : '0', alignSelf: 'flex-start', lineHeight: 1.5 }}>{d.getDate()}</span>
                  {evs.slice(0, 3).map((e, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-caption)', color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      <span style={dot(e.kind)} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                    </span>
                  ))}
                  {evs.length > 3 && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>+{evs.length - 3} more</span>}
                </button>
              )
            })}
          </div>

          <div style={{ marginTop: 'var(--sp-4)' }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
              {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              <span style={{ color: 'var(--dim)', fontWeight: 600 }}> · {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}</span>
            </div>
            {selectedEvents.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Nothing scheduled this day.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedEvents.map((e, i) => {
                  const body = (
                    <>
                      <span style={dot(e.kind)} />
                      <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: KIND_COLOR[e.kind], minWidth: 128 }}>{KIND_LABEL[e.kind]}</span>
                      <span style={{ fontWeight: 600 }}>{e.title}</span>
                      {e.sub && <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>· {e.sub}</span>}
                    </>
                  )
                  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', textDecoration: 'none', color: 'var(--text)' }
                  return (e.kind === 'followup' || e.kind === 'due') && e.quoteKey
                    ? <Link key={i} to={`/quote/${encodeURIComponent(e.quoteKey)}`} onClick={onClose} style={rowStyle}>{body}</Link>
                    : <div key={i} style={rowStyle}>{body}</div>
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
