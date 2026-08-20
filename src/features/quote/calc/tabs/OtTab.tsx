import { type Dispatch, type SetStateAction } from 'react'
import { sf, money } from '../../../../lib/format'
import { OT_DEFAULTS, otRowTotal } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, sectionLabel } from '../ui'
import type { OtRatesState, OtRow, CalcCustom } from '../types'

// Overtime — editable rate table + per-row (weekday/weekend × techs × hours)
// amounts. Sent as custom lines (code 94), not catalog items.
export function OtTab({ otRates, setOtRates, otRows, setOtRows, onSendCustom }: { otRates: OtRatesState; setOtRates: Dispatch<SetStateAction<OtRatesState>>; otRows: OtRow[]; setOtRows: Dispatch<SetStateAction<OtRow[]>>; onSendCustom: (lines: CalcCustom[]) => void }) {
  const otR = { wkBase: sf(otRates.wkBase, OT_DEFAULTS.wkBase), wkRate: sf(otRates.wkRate, OT_DEFAULTS.wkRate), weBase: sf(otRates.weBase, OT_DEFAULTS.weBase), weRate: sf(otRates.weRate, OT_DEFAULTS.weRate) }
  const otRowAmt = (r: { type: string; techs: string; hours: string }) => Math.round(otRowTotal(r.type, sf(r.techs, 1), sf(r.hours, 0), otR))
  const otTotal = otRows.reduce((a, r) => a + otRowAmt(r), 0)
  return (
    <>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <div style={sectionLabel}>Rates <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--dim)' }}>· editable</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-3)' }}>
          <Labeled label="Weekday min call ($)"><input value={otRates.wkBase} onChange={(e) => setOtRates((r) => ({ ...r, wkBase: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
          <Labeled label="Weekday $/tech/hr"><input value={otRates.wkRate} onChange={(e) => setOtRates((r) => ({ ...r, wkRate: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
          <Labeled label="Weekend min call ($)"><input value={otRates.weBase} onChange={(e) => setOtRates((r) => ({ ...r, weBase: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
          <Labeled label="Weekend $/tech/hr"><input value={otRates.weRate} onChange={(e) => setOtRates((r) => ({ ...r, weRate: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        </div>
      </div>
      {otRows.map((r, i) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 92px 26px', gap: 'var(--sp-2)', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
          <select value={r.type} onChange={(e) => setOtRows((rs) => rs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} style={input}>
            <option>Weekday</option>
            <option>Weekend</option>
          </select>
          <input value={r.techs} onChange={(e) => setOtRows((rs) => rs.map((x, j) => (j === i ? { ...x, techs: e.target.value } : x)))} inputMode="decimal" placeholder="techs" style={{ ...input, textAlign: 'center' }} />
          <input value={r.hours} onChange={(e) => setOtRows((rs) => rs.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))} inputMode="decimal" placeholder="hrs" style={{ ...input, textAlign: 'center' }} />
          <div style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(otRowAmt(r))}</div>
          <button onClick={() => setOtRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <button onClick={() => setOtRows((rs) => [...rs, { key: (rs[rs.length - 1]?.key || 0) + 1, type: 'Weekday', techs: '1', hours: '0' }])} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', cursor: 'pointer', marginBottom: 'var(--sp-3)' }}>+ Add overtime row</button>
      <Suggest rows={[['Overtime', otTotal]]} />
      <AddButton onClick={() => onSendCustom(otRows.filter((r) => otRowAmt(r) > 0).map((r) => ({ code: '94', label: `Overtime (${r.type})`, price: otRowAmt(r) })))} />
    </>
  )
}
