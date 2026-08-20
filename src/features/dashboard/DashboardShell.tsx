import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '../../components'
import { WORKSPACE_URL, CLASSIC_URL } from '../../lib/config'
import { GlobalSearch } from './GlobalSearch'
import { MoreMenu } from './MoreMenu'

// Shared dashboard frame: the streamlined top bar (title, Live pill, the
// Manager / My Work / In Progress view switch, New Quote) wrapping whichever
// view is active. The switch is real routing — each view has its own URL.

const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

const segBase: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  padding: '8px 15px',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
const seg = (active: boolean, first: boolean): CSSProperties => ({
  ...segBase,
  background: active ? 'var(--text)' : '#fff',
  color: active ? '#fff' : 'var(--muted)',
  borderLeft: first ? 'none' : '1px solid var(--border-strong)',
})

export function DashboardShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [privacy, setPrivacy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const view = pathname.startsWith('/my-work') ? 'mywork' : pathname.startsWith('/in-progress') ? 'inprogress' : 'manager'
  const subtitle = view === 'mywork' ? 'Your worklist' : view === 'inprogress' ? 'Shared — what the team is working on' : monthLabel

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5) 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-.02em' }}>Dashboard</div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)', background: 'var(--pos-soft)', border: '1px solid var(--pos-border)', borderRadius: 20, padding: '3px 10px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos)' }} />
                Live
              </span>
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 4 }}>{subtitle}</div>
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 9, overflow: 'hidden' }}>
            <Link to="/" style={seg(view === 'manager', true)}>Manager</Link>
            <Link to="/my-work" style={seg(view === 'mywork', false)}>My Work</Link>
            <Link to="/in-progress" style={seg(view === 'inprogress', false)}>In Progress</Link>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <GlobalSearch />
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh dashboard data"
            aria-label="Refresh"
            style={{ width: 42, height: 42, border: '1px solid var(--border-strong)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
          >
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path d="M14 3v4h-4M3 14v-4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.5 7a5.2 5.2 0 00-9-1.5L3 7M3.5 10a5.2 5.2 0 009 1.5L14 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <MoreMenu privacy={privacy} onTogglePrivacy={() => setPrivacy((p) => !p)} />
          <a href={WORKSPACE_URL} target="_blank" rel="noopener noreferrer" title="Open NUWorkspace in a new tab" style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', border: '1px solid var(--border-strong)', background: '#fff', borderRadius: 'var(--radius-sm)', padding: '9px 14px', whiteSpace: 'nowrap' }}>Workspace ↗</a>
          <a href={CLASSIC_URL} target="_blank" rel="noopener noreferrer" title="Open the classic NUForce in a new tab" style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--muted)', textDecoration: 'none', border: '1px solid var(--border-strong)', background: '#fff', borderRadius: 'var(--radius-sm)', padding: '9px 14px', whiteSpace: 'nowrap' }}>Classic ↗</a>
          <Button onClick={() => navigate('/quote/new')}>+ New Quote</Button>
        </div>
      </div>
      <div key={refreshKey} style={{ filter: privacy ? 'blur(8px)' : 'none', pointerEvents: privacy ? 'none' : 'auto', userSelect: privacy ? 'none' : 'auto', transition: 'filter .2s' }}>
        {children}
      </div>
    </div>
  )
}
