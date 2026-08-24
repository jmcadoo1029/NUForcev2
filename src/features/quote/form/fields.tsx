import { useEffect, useRef, useState, type ReactNode } from 'react'

// Shared field primitives + input styles for the quote form sections (Quote Info,
// Test Item, Specifications/Notes, Related Contacts). Extracted from QuotePage so
// every section renders fields identically.

export const regInput: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

// Quote Info is a two-column grid; minmax(0,1fr) lets a long value (e.g. an
// email address, which has no spaces to wrap on) wrap inside its own column
// instead of spilling over the next one.
export const infoGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--sp-4) var(--sp-6)' }

// Edit-mode grids mirroring Classic's Test Item form (3-across and 2-across).
export const gridEdit3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }
export const gridEdit2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }
export const textArea: React.CSSProperties = { ...regInput, minHeight: 130, resize: 'none', overflow: 'hidden', lineHeight: 1.6 }

// Classic auto-appended this boilerplate paragraph to every IMPORTED quote's
// notes; it adds nothing in V2's layout, so we strip it — but ONLY on imports.
// A user who deliberately types this exact sentence keeps it (stripBoilerplate
// defaults to false), so a real note is never silently hidden.
const NOTES_BOILERPLATE = 'Refer to the notes section at the bottom of this quote for additional details.'
export const cleanNotes = (text: string, stripBoilerplate = false): string =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && (!stripBoilerplate || p !== NOTES_BOILERPLATE))
    .join('\n\n')

// A read-only labeled value; renders nothing when empty.
export function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text)', overflowWrap: 'break-word' }}>{value}</div>
    </div>
  )
}

// A labeled edit field wrapper (uppercase caption + arbitrary control).
export function RegField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

// A Quote Info field: read-only value in view mode, Classic input in edit mode.
export function InfoField({ label, editing, value, onChange, options }: { label: string; editing: boolean; value: string; onChange: (v: string) => void; options?: string[] }) {
  if (!editing) return <Field label={label} value={value} />
  return (
    <RegField label={label}>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={regInput}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={regInput} />
      )}
    </RegField>
  )
}

// One field of the single-column Test Item list: label on the left, value right.
export function ListRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-4)', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 150, flexShrink: 0, fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', paddingTop: 2 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text)', overflowWrap: 'break-word', minWidth: 0 }}>{value}</div>
    </div>
  )
}

// Small click-to-copy button. Copies text to the clipboard and flashes a check.
export function CopyBtn({ text, title = 'Copy email' }: { text: string; title?: string }) {
  const [done, setDone] = useState(false)
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* no-op */ }
      document.body.removeChild(ta)
    }
    setDone(true)
    setTimeout(() => setDone(false), 1200)
  }
  return (
    <button
      onClick={copy}
      title={done ? 'Copied' : title}
      aria-label={done ? 'Copied' : title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, color: done ? 'var(--pos)' : 'var(--dim)', flexShrink: 0 }}
    >
      {done ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  )
}

// Email value with a mailto link and a copy-to-clipboard icon (view mode).
export function EmailValue({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <a href={`mailto:${value}`} style={{ fontSize: 'var(--fs-base)', color: 'var(--accent)', textDecoration: 'none', overflowWrap: 'break-word', minWidth: 0 }}>{value}</a>
        <CopyBtn text={value} />
      </div>
    </div>
  )
}

// A textarea that grows to fit its content (no inner scrollbar), like Classic's
// auto-sizing spec/notes fields.
export function AutoTextarea({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [value])
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={style} />
}
