import { useEffect, useRef, useState } from 'react'
import { MonthlySnapshot } from './MonthlySnapshot'
import { RecentlyApproved } from './RecentlyApproved'
import { ProductCatalog } from './ProductCatalog'
import { Templates } from './Templates'
import { StandardsMiner } from './StandardsMiner'
import { DeletedQuotes } from './DeletedQuotes'
import { UsersAdmin } from './UsersAdmin'
import { useCanViewManager, useIsApprover } from '../../lib/perms'
import { getThemePref, setThemePref, type ThemePref } from '../../theme/theme'

// Light → Dark → Auto → Light. "Auto" follows the OS; the other two force a palette.
const THEME_ORDER: ThemePref[] = ['light', 'dark', 'auto']
const THEME_LABEL: Record<ThemePref, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' }

// Overflow menu for the occasional dashboard tools: Monthly snapshot, Recently
// approved, Product catalog, Email templates, and the Privacy-mode toggle. Keeps
// the top bar uncluttered. (Campaigns is a top-list tab, not in here.)
export function MoreMenu({ privacy, onTogglePrivacy }: { privacy: boolean; onTogglePrivacy: () => void }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<null | 'snapshot' | 'recent' | 'catalog' | 'templates' | 'standards' | 'deleted' | 'users'>(null)
  const { canView } = useCanViewManager() // Standards ↔ codes is manager-only
  const { isApprover } = useIsApprover() // Deleted quotes (restore) is approver-only
  const ref = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
    setThemePref(next) // persist + apply to <html data-theme> immediately
    setTheme(next)
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const item = {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    fontSize: 'var(--fs-base)',
    color: 'var(--text)',
    background: 'none',
    border: 'none',
    padding: '10px 12px',
    borderRadius: 6,
    cursor: 'pointer',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More"
        style={{ width: 42, height: 42, border: '1px solid var(--border-strong)', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="4" r="1.5" fill="currentColor" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
          <circle cx="9" cy="14" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', minWidth: 210, padding: 6, zIndex: 60 }}>
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('snapshot'); setOpen(false) }}>
            Monthly snapshot
          </button>
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('recent'); setOpen(false) }}>
            Recently approved
          </button>
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('catalog'); setOpen(false) }}>
            Product catalog
          </button>
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('templates'); setOpen(false) }}>
            Email templates
          </button>
          {canView && (
            <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('standards'); setOpen(false) }}>
              Standards ↔ codes
            </button>
          )}
          {isApprover && (
            <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('deleted'); setOpen(false) }}>
              Deleted quotes
            </button>
          )}
          {isApprover && (
            <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('users'); setOpen(false) }}>
              Users
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { onTogglePrivacy(); setOpen(false) }}>
            Privacy mode <span style={{ color: privacy ? 'var(--pos)' : 'var(--dim)', fontWeight: 700 }}>· {privacy ? 'On' : 'Off'}</span>
          </button>
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={cycleTheme}>
            Theme <span style={{ color: 'var(--accent)', fontWeight: 700 }}>· {THEME_LABEL[theme]}</span>
          </button>
        </div>
      )}
      {modal === 'snapshot' && <MonthlySnapshot onClose={() => setModal(null)} />}
      {modal === 'recent' && <RecentlyApproved onClose={() => setModal(null)} />}
      {modal === 'catalog' && <ProductCatalog onClose={() => setModal(null)} />}
      {modal === 'templates' && <Templates onClose={() => setModal(null)} />}
      {modal === 'standards' && canView && <StandardsMiner onClose={() => setModal(null)} />}
      {modal === 'deleted' && isApprover && <DeletedQuotes onClose={() => setModal(null)} />}
      {modal === 'users' && isApprover && <UsersAdmin onClose={() => setModal(null)} />}
    </div>
  )
}
