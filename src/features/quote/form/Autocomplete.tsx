import { useEffect, useRef, useState } from 'react'
import { regInput } from './fields'

// A small type-to-search input with a results dropdown. Generic over the row
// type. Debounced. The caller controls the text value (so free typing / custom
// entry always works); picking a result fires onPick. Used for account linking,
// primary-contact selection, and related-contact search.

export function Autocomplete<T>({
  value,
  onValueChange,
  search,
  itemKey,
  itemPrimary,
  itemSecondary,
  onPick,
  placeholder,
  disabled,
  minChars = 1,
  emptyText = 'No matches.',
  footer,
}: {
  value: string
  onValueChange: (v: string) => void
  search: (term: string) => Promise<T[]>
  itemKey: (t: T) => string
  itemPrimary: (t: T) => string
  itemSecondary?: (t: T) => string
  onPick: (t: T) => void
  placeholder?: string
  disabled?: boolean
  minChars?: number
  emptyText?: string
  footer?: (term: string) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = value.trim()
    if (t.length < minChars) { setResults(null); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const r = await search(t)
      setResults(r)
      setLoading(false)
    }, 220)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, minChars, search])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => { onValueChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        style={regInput}
      />
      {open && value.trim().length >= minChars && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', maxHeight: 260, overflowY: 'auto' }}>
          {loading && !results && <div style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Searching…</div>}
          {results && results.length === 0 && <div style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>{emptyText}</div>}
          {results && results.map((it) => (
            <div
              key={itemKey(it)}
              onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false) }}
              style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{itemPrimary(it)}</div>
              {itemSecondary && itemSecondary(it) && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>{itemSecondary(it)}</div>}
            </div>
          ))}
          {footer && footer(value.trim())}
        </div>
      )}
    </div>
  )
}
