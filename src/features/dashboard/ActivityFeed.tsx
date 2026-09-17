import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel } from '../../components'
import { prettifyEmail } from '../../lib/text'
import { useActivityFeed, type FeedItem } from './useActivityFeed'

// Feed — a live activity stream of chatter across all quotes: the notes people type on
// quotes plus key events (Closed Lost, delete/restore). Routine send/follow-up log lines
// are filtered out (see useActivityFeed). Reached from the header "Feed" tab.

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

function Row({ item }: { item: FeedItem }) {
  const who = prettifyEmail(item.by) || 'Someone'
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: avatarColor(who), color: '#fff', fontWeight: 700, fontSize: 'var(--fs-caption)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(who)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{who}</span>
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

export function ActivityFeed() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, err } = useActivityFeed(refreshKey)

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
        <CardLabel>Activity feed</CardLabel>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--muted)', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load the feed: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>Loading…</div>}
      {!err && data && data.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>No recent activity. Notes people add on quotes will show up here.</div>}

      {!err && data && data.length > 0 && (
        <div>
          {data.map((item) => <Row key={item.key} item={item} />)}
          <div style={{ color: 'var(--dim)', fontSize: 'var(--fs-caption)', paddingTop: 'var(--sp-3)' }}>
            Showing the latest {data.length} notes and events. Routine “emailed / follow-up sent” log lines are hidden.
          </div>
        </div>
      )}
    </Card>
  )
}
