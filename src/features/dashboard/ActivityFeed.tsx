import { useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardLabel } from '../../components'
import { prettifyEmail } from '../../lib/text'
import { useCanViewManager } from '../../lib/perms'
import { fetchMassEmailMetrics, fetchMassEmailProblems, fetchMassRecipientsByStatus, type MassEmailMetrics, type MassRecipientProblem, type MassRecipient } from '../../lib/massEmail'
import { useFeed, useOutreachFeed, type FeedItem, type FeedMode, type OutreachItem } from './useActivityFeed'

// Feed — reached from the header "Feed" tab. Views via the toggle:
//   • Activity: live chatter across all quotes (notes people type + key events).
//   • Sent Quotes / Follow-ups: a rolling log of the quote emails that went out.
//   • Outreach (managers): every mass/outreach send (all contacts, by code, by
//     campaign, by account, re-engage, scheduled). Click a row for its landing
//     metrics (delivered / opened / bounced) tallied from the recipient rows.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// A stable, muted color per author so the same person reads consistently down the feed.
const AVATAR_COLORS = ['#2e6da4', '#1e8449', '#a9791b', '#8250c4', '#b3282d', '#0e7c86']
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function Avatar({ who }: { who: string }) {
  return (
    <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: avatarColor(who), color: '#fff', fontWeight: 700, fontSize: 'var(--fs-caption)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(who)}</div>
  )
}

function Row({ item }: { item: FeedItem }) {
  const who = prettifyEmail(item.by) || 'Someone'
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <Avatar who={who} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{who}</span>
          {item.kind && (
            <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: '#fff', background: item.kind === 'quote' ? 'var(--pos)' : 'var(--muted)', borderRadius: 20, padding: '1px 8px' }}>
              {item.kind === 'quote' ? 'Sent' : 'Follow-up'}
            </span>
          )}
          <span style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)' }}>on</span>
          <Link to={`/quote/${item.quoteId}`} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
            {item.opportunity || `#${item.quoteId}`}
          </Link>
          {item.customer && <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {item.customer}</span>}
          <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 'var(--fs-caption)', whiteSpace: 'nowrap' }} title={new Date(item.at).toLocaleString()}>{relTime(item.at)}</span>
        </div>
        <div style={{ marginTop: 3, color: 'var(--text)', fontSize: 'var(--fs-sm)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.msg}</div>
      </div>
    </div>
  )
}

// One metric pill in the expanded outreach detail. When onClick is given it renders
// as a button that expands the recipient list for that metric (delivered / opened).
function Metric({ label, value, color, onClick, active }: { label: string; value: number; color: string; onClick?: () => void; active?: boolean }) {
  const inner = (
    <>
      <span style={{ fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</span>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} title={`Show ${label} recipients`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 'var(--fs-sm)', fontFamily: 'inherit', background: 'none', border: 'none', padding: '0 0 2px', cursor: 'pointer', borderBottom: '2px solid ' + (active ? color : 'transparent') }}>{inner}</button>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 'var(--fs-sm)' }}>{inner}</span>
  )
}

// An outreach blast (a mass_emails row). Click to expand its landing metrics.
function OutreachRow({ item }: { item: OutreachItem }) {
  const who = prettifyEmail(item.by) || 'Someone'
  const [open, setOpen] = useState(false)
  const [metrics, setMetrics] = useState<MassEmailMetrics | null>(null)
  const [problems, setProblems] = useState<MassRecipientProblem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [mErr, setMErr] = useState('')
  // Delivered / Opened recipient lists — loaded on demand when the metric is clicked.
  const [listKind, setListKind] = useState<'delivered' | 'opened' | null>(null)
  const [lists, setLists] = useState<Record<string, MassRecipient[]>>({})
  const [listLoading, setListLoading] = useState(false)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !metrics && !loading) {
      setLoading(true)
      setMErr('')
      try {
        const [mm, probs] = await Promise.all([fetchMassEmailMetrics(item.id), fetchMassEmailProblems(item.id)])
        setMetrics(mm)
        setProblems(probs)
      } catch (e) {
        setMErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
  }

  const statusLabel = (s: string) => (s === 'bounced' ? 'Bounced' : s === 'complained' ? 'Marked spam' : s === 'failed' ? 'Failed to send' : s)

  const toggleList = async (kind: 'delivered' | 'opened') => {
    if (listKind === kind) { setListKind(null); return }
    setListKind(kind)
    if (!lists[kind]) {
      setListLoading(true)
      try {
        const rows = await fetchMassRecipientsByStatus(item.id, [kind])
        setLists((m) => ({ ...m, [kind]: rows }))
      } catch {
        setLists((m) => ({ ...m, [kind]: [] }))
      } finally {
        setListLoading(false)
      }
    }
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div onClick={toggle} style={{ display: 'flex', gap: 'var(--sp-3)', cursor: 'pointer' }}>
        <Avatar who={who} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{who}</span>
            <span style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)' }}>sent</span>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{item.audience}</span>
            <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>
              {item.recipientCount.toLocaleString()} {item.recipientCount === 1 ? 'recipient' : 'recipients'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dim)', fontSize: 'var(--fs-caption)', whiteSpace: 'nowrap' }} title={new Date(item.at).toLocaleString()}>
              {relTime(item.at)}
              <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--dim)' }}>▸</span>
            </span>
          </div>
          {item.subject && <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>}
        </div>
      </div>

      {open && (
        <div style={{ margin: '10px 0 2px', marginLeft: 46, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          {loading && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading metrics…</div>}
          {!loading && mErr && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load metrics: {mErr}</div>}
          {!loading && !mErr && metrics && (
            metrics.total === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No delivery data recorded for this send yet.</div>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <Metric label="delivered" value={metrics.delivered} color="var(--pos)" onClick={metrics.delivered > 0 ? () => toggleList('delivered') : undefined} active={listKind === 'delivered'} />
                <Metric label="opened" value={metrics.opened} color="var(--info)" onClick={metrics.opened > 0 ? () => toggleList('opened') : undefined} active={listKind === 'opened'} />
                <Metric label="bounced" value={metrics.bounced} color="var(--accent)" />
                {metrics.complained > 0 && <Metric label="spam reports" value={metrics.complained} color="var(--accent)" />}
                {metrics.failed > 0 && <Metric label="failed" value={metrics.failed} color="var(--muted)" />}
                <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 'var(--fs-caption)' }}>{metrics.total.toLocaleString()} tracked · click delivered or opened for the list</span>
              </div>
            )
          )}

          {listKind && (
            <div style={{ marginTop: 'var(--sp-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' }}>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
                {listKind === 'delivered' ? 'Delivered to' : 'Opened by'} ({lists[listKind]?.length ?? 0})
              </div>
              {listLoading && !lists[listKind] && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
              {lists[listKind] && lists[listKind].length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No recipients in this state yet.</div>}
              {lists[listKind] && lists[listKind].map((r, i) => (
                <div key={`${r.email}:${i}`} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', borderBottom: i < lists[listKind].length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <a href={`mailto:${r.email}`} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{r.email}</a>
                  {r.name && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>{r.name}</span>}
                  {r.company && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>· {r.company}</span>}
                </div>
              ))}
            </div>
          )}

          {!loading && !mErr && problems && problems.length > 0 && (
            <div style={{ marginTop: 'var(--sp-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' }}>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
                Needs attention ({problems.length})
              </div>
              {problems.map((p, i) => (
                <div key={`${p.email}:${i}`} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', borderBottom: i < problems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: p.status === 'bounced' || p.status === 'complained' ? 'var(--accent)' : 'var(--muted)', minWidth: 92 }}>{statusLabel(p.status)}</span>
                  <a href={`mailto:${p.email}`} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{p.email}</a>
                  {p.name && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>{p.name}</span>}
                  {p.reason && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', flexBasis: '100%', paddingLeft: 92 }}>{p.reason}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const segBase: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '7px 16px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }
const seg = (active: boolean, first: boolean): CSSProperties => ({
  ...segBase,
  background: active ? 'var(--text)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--muted)',
  borderLeft: first ? 'none' : '1px solid var(--border-strong)',
})

type Tab = FeedMode | 'outreach'

// Chatter-based views (Activity / Sent Quotes / Follow-ups). Its own component so it
// owns its data hook — keeps the outreach view from firing a chatter query too.
function ChatterList({ mode, refreshKey }: { mode: FeedMode; refreshKey: number }) {
  const { data, err } = useFeed(mode, refreshKey)
  const emptyText = mode === 'sent'
    ? 'No quotes sent yet. First-time quote emails will show up here.'
    : mode === 'followups'
      ? 'No follow-ups yet. Follow-up emails sent on quotes will show up here.'
      : 'No recent activity. Notes people add on quotes will show up here.'
  const footText = mode === 'sent'
    ? `Showing the latest ${data?.length ?? 0} first-time quote emails, newest first.`
    : mode === 'followups'
      ? `Showing the latest ${data?.length ?? 0} follow-up emails, newest first.`
      : `Showing the latest ${data?.length ?? 0} notes and events. Routine “emailed / follow-up sent” log lines are hidden.`
  return (
    <>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load the feed: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>Loading…</div>}
      {!err && data && data.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>{emptyText}</div>}
      {!err && data && data.length > 0 && (
        <div>
          {data.map((item) => <Row key={item.key} item={item} />)}
          <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-caption)', paddingTop: 'var(--sp-3)' }}>{footText}</div>
        </div>
      )}
    </>
  )
}

// The Outreach log (mass_emails). Owns its own data hook.
function OutreachList({ refreshKey }: { refreshKey: number }) {
  const { data, err } = useOutreachFeed(refreshKey)
  return (
    <>
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load outreach: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>Loading…</div>}
      {!err && data && data.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>No outreach yet. Mass emails, account sends and re-engage blasts will show up here.</div>}
      {!err && data && data.length > 0 && (
        <div>
          {data.map((item) => <OutreachRow key={item.id} item={item} />)}
          <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-caption)', paddingTop: 'var(--sp-3)' }}>Showing the latest {data.length} outreach sends, newest first. Click any send for its delivery metrics.</div>
        </div>
      )}
    </>
  )
}

export function ActivityFeed() {
  const { canView } = useCanViewManager() // Outreach log: managers/approvers + view-only roles
  const [params] = useSearchParams()
  // A receipt email links to /feed?tab=outreach — open that tab straight away.
  const initialTab: Tab = params.get('tab') === 'outreach' ? 'outreach' : 'activity'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [refreshKey, setRefreshKey] = useState(0)

  // Guard: if a non-manager is ever on the outreach tab, fall back to activity.
  const activeTab: Tab = tab === 'outreach' && !canView ? 'activity' : tab

  const cardLabel = activeTab === 'sent' ? 'Sent quotes' : activeTab === 'followups' ? 'Follow-ups' : activeTab === 'outreach' ? 'Outreach' : 'Activity feed'

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <CardLabel>{cardLabel}</CardLabel>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 9, overflow: 'hidden' }}>
            <button onClick={() => setTab('activity')} style={seg(activeTab === 'activity', true)}>Activity</button>
            <button onClick={() => setTab('sent')} style={seg(activeTab === 'sent', false)}>Sent Quotes</button>
            <button onClick={() => setTab('followups')} style={seg(activeTab === 'followups', false)}>Follow-ups</button>
            {canView && <button onClick={() => setTab('outreach')} style={seg(activeTab === 'outreach', false)}>Outreach</button>}
          </div>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {activeTab === 'outreach'
        ? <OutreachList refreshKey={refreshKey} />
        : <ChatterList mode={activeTab} refreshKey={refreshKey} />}
    </Card>
  )
}
