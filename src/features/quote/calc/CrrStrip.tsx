import { useState } from 'react'
import { r25 } from '../../../data/calcPricing'
import { deriveCrrShifts, type CrrWorkup, type SpecDef } from '../../../lib/crr'

// Collapsible CRR reference strip for the EMI / PQ calculator tabs. When a CRR
// workup exists for the quote, it shows the shift counts the workup implies
// (hours ÷ 8) and the resulting test price at this tab's rate — a reference the
// tech can reconcile against, NOT applied to the quote automatically. Collapsed
// by default so the tab stays clean; expand for the per-test breakdown, where any
// shift can be overridden locally.

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

export function CrrStrip({ workup, specs, rate, pia }: { workup: CrrWorkup | null | undefined; specs: SpecDef[]; rate: number; pia: number }) {
  const [open, setOpen] = useState(false)
  const [ov, setOv] = useState<Record<string, string>>({})
  const summary = deriveCrrShifts(workup, specs)
  if (!summary.tests.length) return null // no CRR tests for this family → render nothing

  const counted = summary.tests.filter((t) => !t.skipped)
  const effOf = (t: (typeof summary.tests)[number]) => {
    const raw = ov[t.ovKey]
    const n = raw === undefined || raw === '' ? NaN : parseFloat(raw)
    return isNaN(n) ? t.computedShifts ?? 0 : n
  }
  const effTotal = Math.round(counted.reduce((a, t) => a + effOf(t), 0) * 100) / 100
  const suggested = Math.ceil(effTotal)
  const price = r25(suggested * rate * pia)

  const wrap: React.CSSProperties = { border: '1px solid var(--info)', background: 'var(--info-soft)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--sp-4)', overflow: 'hidden' }
  const cell: React.CSSProperties = { padding: '5px 8px', fontSize: 'var(--fs-sm)' }
  const th: React.CSSProperties = { ...cell, fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', textAlign: 'left' }
  const numIn: React.CSSProperties = { width: 58, fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '3px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: '#fff', color: 'var(--text)', textAlign: 'right' }

  return (
    <div style={wrap}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--info)' }}>CRR workup{workup?.quote_number ? ` · ${workup.quote_number}` : ''}</span>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{counted.length} test{counted.length === 1 ? '' : 's'} · <b>{suggested}</b> test shift{suggested === 1 ? '' : 's'} → <b>~{money(price)}</b></span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--info)' }}>{open ? 'Hide' : 'Details'} {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 70px 78px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <span style={th}>Rev</span>
              <span style={th}>Test</span>
              <span style={{ ...th, textAlign: 'right' }}>Hours</span>
              <span style={{ ...th, textAlign: 'right' }}>Shifts</span>
            </div>
            {summary.tests.map((t) => (
              <div key={t.ovKey} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 70px 78px', alignItems: 'center', borderBottom: '1px solid var(--border)', opacity: t.skipped ? 0.55 : 1 }}>
                <span style={{ ...cell, color: 'var(--muted)' }}>{t.rev}</span>
                <span style={cell}><b>{t.testKey}</b>{t.label ? <span style={{ color: 'var(--muted)' }}> — {t.label}</span> : null}</span>
                <span style={{ ...cell, textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{t.timeRaw || '—'}</span>
                <span style={{ ...cell, textAlign: 'right' }}>
                  {t.skipped ? (
                    <span style={{ color: 'var(--dim)' }} title="No time on the CRR row">n/a</span>
                  ) : (
                    <input
                      value={ov[t.ovKey] ?? (t.computedShifts ?? 0).toString()}
                      onChange={(e) => setOv((s) => ({ ...s, [t.ovKey]: e.target.value }))}
                      inputMode="decimal"
                      title={`CRR computed: ${t.computedShifts ?? 0} (edit to override)`}
                      style={numIn}
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)', fontSize: 'var(--fs-sm)' }}>
            <span style={{ color: 'var(--muted)' }}>Total {effTotal} → billable <b>{suggested}</b> shift{suggested === 1 ? '' : 's'}</span>
            <span style={{ color: 'var(--muted)' }}>· test price <b>~{money(price)}</b> at {money(rate)}/shift{pia !== 1 ? ` × ${pia}` : ''}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 'var(--fs-caption)', fontStyle: 'italic' }}>Reference only — not applied to the quote.</span>
          </div>
        </div>
      )}
    </div>
  )
}
