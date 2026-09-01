import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCanViewManager } from '../../lib/perms'
import { WORKSPACE_URL } from '../../lib/config'
import { Campaigns } from '../dashboard/Campaigns'
import { CustomerLookup } from '../account/CustomerLookup'
import { ImportDraft } from '../quote/ImportDraft'

// Neutral landing screen. Opening the app in front of a customer lands here — a
// plain "what would you like to do?" launcher — instead of the Manager dashboard,
// so no financials are on screen until you deliberately choose them. Nothing about
// the destinations changes; this only adds a front door. Manager-only tiles
// (Manager Dashboard, Contracting) are hidden for non-managers.

type Tile = {
  key: string
  label: string
  desc: string
  icon: JSX.Element
  onClick: () => void
  managerOnly?: boolean
}

const cardBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  textAlign: 'left',
  fontFamily: 'inherit',
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '22px 20px',
  cursor: 'pointer',
  transition: 'border-color .15s, box-shadow .15s, transform .15s',
}

export function HomeLauncher() {
  const navigate = useNavigate()
  const { canView, loading } = useCanViewManager()
  const [modal, setModal] = useState<null | 'campaigns' | 'lookup' | 'import'>(null)
  const [hover, setHover] = useState<string | null>(null)

  if (loading) return null

  const tiles: Tile[] = [
    { key: 'dashboard', label: 'Manager Dashboard', desc: 'Approvals, metrics, and the full pipeline view.', managerOnly: true, onClick: () => navigate('/dashboard'), icon: iconGrid },
    { key: 'mywork', label: 'My Work', desc: 'Your own worklist — quotes assigned to you.', onClick: () => navigate('/my-work'), icon: iconUser },
    { key: 'inprogress', label: 'In Progress', desc: "Shared view of what the team is working on.", onClick: () => navigate('/in-progress'), icon: iconLayers },
    { key: 'contracting', label: 'Contracting', desc: 'Close won deals and open jobs.', managerOnly: true, onClick: () => navigate('/contracting'), icon: iconCheck },
    { key: 'campaigns', label: 'Campaigns', desc: 'Outreach campaigns and their contacts.', onClick: () => setModal('campaigns'), icon: iconMegaphone },
    { key: 'lookup', label: 'Customer Lookup', desc: 'Open an account in Customer View — no financials on screen.', onClick: () => setModal('lookup'), icon: iconSearch },
    { key: 'newquote', label: 'Create A Quote', desc: 'Start a brand new quote.', onClick: () => navigate('/quote/new'), icon: iconPlus },
    { key: 'import', label: 'Import a Draft', desc: 'Start a quote from a test-plan file — reviewed and priced by you.', onClick: () => setModal('import'), icon: iconImport },
    { key: 'workspace', label: 'Open Workspace', desc: 'Jump to NUWorkspace in a new tab.', onClick: () => window.open(WORKSPACE_URL, '_blank', 'noopener,noreferrer'), icon: iconExternal },
  ]

  const visible = tiles.filter((t) => !t.managerOnly || canView)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5) 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-.02em' }}>What would you like to do?</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 6 }}>Pick where you want to go.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-4)' }}>
        {visible.map((t) => (
          <button
            key={t.key}
            onClick={t.onClick}
            onMouseEnter={() => setHover(t.key)}
            onMouseLeave={() => setHover((h) => (h === t.key ? null : h))}
            style={{
              ...cardBase,
              borderColor: hover === t.key ? 'var(--accent)' : 'var(--border)',
              boxShadow: hover === t.key ? '0 6px 20px rgba(0,0,0,.08)' : 'none',
              transform: hover === t.key ? 'translateY(-2px)' : 'none',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 'var(--radius-sm)', background: 'var(--accent-soft, #eef2ff)', color: 'var(--accent)' }}>
              {t.icon}
            </span>
            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text)' }}>{t.label}</span>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.4 }}>{t.desc}</span>
          </button>
        ))}
      </div>
      {modal === 'campaigns' && <Campaigns onClose={() => setModal(null)} />}
      {modal === 'lookup' && <CustomerLookup onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportDraft onClose={() => setModal(null)} />}
    </div>
  )
}

const stroke = { stroke: 'currentColor', strokeWidth: 1.7, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const iconGrid = <svg width="22" height="22" viewBox="0 0 22 22"><rect x="3" y="3" width="7" height="7" rx="1.5" {...stroke} /><rect x="12" y="3" width="7" height="7" rx="1.5" {...stroke} /><rect x="3" y="12" width="7" height="7" rx="1.5" {...stroke} /><rect x="12" y="12" width="7" height="7" rx="1.5" {...stroke} /></svg>
const iconUser = <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="7.5" r="3.3" {...stroke} /><path d="M4.5 18a6.5 6.5 0 0113 0" {...stroke} /></svg>
const iconLayers = <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 3l8 4-8 4-8-4 8-4z" {...stroke} /><path d="M3 11l8 4 8-4M3 15l8 4 8-4" {...stroke} /></svg>
const iconCheck = <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" {...stroke} /><path d="M7.5 11.2l2.4 2.4 4.6-4.8" {...stroke} /></svg>
const iconMegaphone = <svg width="22" height="22" viewBox="0 0 22 22"><path d="M4 9v4h3l8 4V5L7 9H4z" {...stroke} /><path d="M17 8.5a3 3 0 010 5" {...stroke} /></svg>
const iconSearch = <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="9.5" cy="9.5" r="5.5" {...stroke} /><path d="M13.8 13.8L18 18" {...stroke} /></svg>
const iconPlus = <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" {...stroke} /><path d="M11 7.5v7M7.5 11h7" {...stroke} /></svg>
const iconExternal = <svg width="22" height="22" viewBox="0 0 22 22"><path d="M12 4h6v6M18 4l-7 7" {...stroke} /><path d="M15.5 12.5V17a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 17V8A1.5 1.5 0 015 6.5h4.5" {...stroke} /></svg>
const iconImport = <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 3v10M7 9.5l4 4 4-4" {...stroke} /><path d="M4 15v2.5A1.5 1.5 0 005.5 19h11a1.5 1.5 0 001.5-1.5V15" {...stroke} /></svg>
