import { type CSSProperties, type ReactNode } from 'react'
import { money } from '../../../lib/format'
import { pqRowShifts, type PqRow } from '../../../data/calcPricing'

// Shared presentational primitives + styles for the Pricing Calculator tabs.
// Extracted so each tab panel renders identically and the calculator shell stays
// focused on state + composition.

export const sectionLabel: CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'var(--sp-2)' }
export const input: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }
export const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }
export const tabBtn: CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '6px 14px', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--muted)', borderRadius: 20, cursor: 'pointer' }
export const tabBtnOn: CSSProperties = { border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)' }
// Spec Builder trigger button (matches the secondary Quote/Budget PDF buttons).
export const specTriggerBtn: CSSProperties = { fontFamily: 'inherit', fontWeight: 600, fontSize: 'var(--fs-sm)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', cursor: 'pointer' }

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

export function Suggest({ rows }: { rows: [string, number][] }) {
  const total = rows.reduce((a, [, v]) => a + v, 0)
  return (
    <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
      {rows.map(([label, v]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{label}</span>
          <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(v)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', color: 'var(--dim)' }}>SUGGESTED</span>
        <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{money(total)}</span>
      </div>
    </div>
  )
}

// A labelled checkbox chip.
export function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
      <span style={{ fontSize: 'var(--fs-sm)', color: checked ? 'var(--text)' : 'var(--muted)', fontWeight: checked ? 600 : 400 }}>{label}</span>
    </label>
  )
}

// EMI location group (in-house / TBD / subcontract), colour-coded.
export function LocGroup({ title, tone, items, locs, onToggle }: { title: string; tone: string; items: string[]; locs: Record<string, boolean>; onToggle: (k: string, v: boolean) => void }) {
  return (
    <div style={{ marginTop: 'var(--sp-2)' }}>
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: tone, marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2) var(--sp-4)' }}>
        {items.map((k) => <Chk key={k} label={k} checked={!!locs[k]} onChange={(v) => onToggle(k, v)} />)}
      </div>
    </div>
  )
}

// Advisory warnings box — amber, one line per warning.
export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn-border)', borderRadius: 'var(--radius-sm)', padding: '8px 11px', marginBottom: 'var(--sp-3)' }}>
      {items.map((w, i) => (
        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: i < items.length - 1 ? 5 : 0 }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', lineHeight: 1.5 }}>{w}</span>
        </div>
      ))}
    </div>
  )
}

// Collapsible PQ test list (progressive disclosure — the "de-bulk"). Collapsed it
// shows the count + shift total; expanded, the checkboxes.
export function PqTable({ title, rows, selected, is3ph, open, onToggleOpen, onToggleRow, onToggleAll }: { title: string; rows: PqRow[]; selected: Record<string, boolean>; is3ph: boolean; open: boolean; onToggleOpen: () => void; onToggleRow: (k: string) => void; onToggleAll: (v: boolean) => void }) {
  const count = rows.filter((r) => selected[r.key]).length
  const allSel = count === rows.length
  const shifts = rows.reduce((a, r) => a + (selected[r.key] ? pqRowShifts(r, is3ph) : 0), 0)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--sp-3)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--bg)' }}>
        <button onClick={onToggleOpen} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{open ? '▾' : '▸'} {title}</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: count ? 'var(--accent)' : 'var(--muted)' }}>{count} selected · {shifts} sh</span>
        </button>
        <button onClick={() => onToggleAll(!allSel)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>{allSel ? 'Clear all' : 'Select all'}</button>
      </div>
      {open && (
        <div style={{ padding: '6px 8px' }}>
          {rows.map((r) => {
            const on = !!selected[r.key]
            return (
              <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', cursor: 'pointer', borderRadius: 6, background: on ? 'var(--accent-soft)' : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={() => onToggleRow(r.key)} style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>{r.key}</span>
                <span style={{ flex: 1, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{r.label}</span>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', flexShrink: 0 }}>{pqRowShifts(r, is3ph)} sh</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontFamily: 'inherit', width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer' }}>
      + Add to quote…
    </button>
  )
}
