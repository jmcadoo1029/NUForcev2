import { useRef, type ReactNode } from 'react'

interface ModalProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  width?: number
}

// Centered overlay dialog. Click the scrim or the × to close.
export function Modal({ title, onClose, children, width = 700 }: ModalProps) {
  // Close only when the press STARTS and ENDS on the scrim. Without tracking the
  // mousedown, dragging to select text inside a field and releasing over the scrim
  // fires a click whose target is the scrim, wrongly closing the dialog.
  const downOnScrim = useRef(false)
  return (
    <div
      onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) onClose()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,30,45,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '48px 16px' }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 14, width: '100%', maxWidth: width, boxShadow: 'var(--shadow-lg)', padding: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)', gap: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, letterSpacing: '-.01em' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--dim)', lineHeight: 1 }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
