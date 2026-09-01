import { useEffect, useRef, useState } from 'react'
import { MonthlySnapshot } from './MonthlySnapshot'
import { RecentlyApproved } from './RecentlyApproved'
import { ProductCatalog } from './ProductCatalog'
import { Templates } from './Templates'
import { StandardsMiner } from './StandardsMiner'

// Overflow menu for the occasional dashboard tools: Monthly snapshot, Recently
// approved, Product catalog, Email templates, and the Privacy-mode toggle. Keeps
// the top bar uncluttered. (Campaigns is a top-list tab, not in here.)
export function MoreMenu({ privacy, onTogglePrivacy }: { privacy: boolean; onTogglePrivacy: () => void }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<null | 'snapshot' | 'recent' | 'catalog' | 'templates' | 'standards'>(null)
  const ref = useRef<HTMLDivElement>(null)

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
        style={{ width: 42, height: 42, border: '1px solid var(--border-strong)', background: '#fff', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="4" r="1.5" fill="currentColor" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
          <circle cx="9" cy="14" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', minWidth: 210, padding: 6, zIndex: 60 }}>
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
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { setModal('standards'); setOpen(false) }}>
            Standards ↔ codes
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
          <button style={item} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')} onClick={() => { onTogglePrivacy(); setOpen(false) }}>
            Privacy mode <span style={{ color: privacy ? 'var(--pos)' : 'var(--dim)', fontWeight: 700 }}>· {privacy ? 'On' : 'Off'}</span>
          </button>
        </div>
      )}
      {modal === 'snapshot' && <MonthlySnapshot onClose={() => setModal(null)} />}
      {modal === 'recent' && <RecentlyApproved onClose={() => setModal(null)} />}
      {modal === 'catalog' && <ProductCatalog onClose={() => setModal(null)} />}
      {modal === 'templates' && <Templates onClose={() => setModal(null)} />}
      {modal === 'standards' && <StandardsMiner onClose={() => setModal(null)} />}
    </div>
  )
}
