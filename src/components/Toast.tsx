import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

// App-wide toast notifications. Wrap the app in <ToastProvider> once; call
// useToast() anywhere to push a message. Used for write feedback (save ok/failed,
// approvals, sends) when the write path lands — until then it's available for any
// transient UI feedback. Pure UI, no backend.

export type ToastType = 'success' | 'error' | 'warn' | 'info'
interface ToastItem { id: number; message: string; type: ToastType }

interface ToastApi {
  /** Push a toast. Returns nothing; it auto-dismisses after `duration` ms. */
  showToast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TONE: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: 'var(--pos)', icon: '✓' },
  error: { bg: 'var(--accent)', icon: '!' },
  warn: { bg: 'var(--warn)', icon: '!' },
  info: { bg: 'var(--info)', icon: 'i' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const seq = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((cur) => cur.filter((t) => t.id !== id)), [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = seq.current++
    setToasts((cur) => [...cur, { id, message, type }])
    if (duration > 0) window.setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 4000, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 'min(400px, calc(100vw - 40px))' }}>
        {toasts.map((t) => {
          const tone = TONE[t.type]
          return (
            <div key={t.id} role="status" onClick={() => dismiss(t.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `4px solid ${tone.bg}`, borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', padding: '11px 14px', cursor: 'pointer' }}>
              <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: tone.bg, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{tone.icon}</span>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.5 }}>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Access the toast API. Falls back to a console shim if used outside a provider,
 * so a component that calls showToast never crashes in isolation (e.g. tests).
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  return { showToast: (m, type = 'info') => console.warn(`[toast:${type}] ${m}`) }
}
