import { type Dispatch, type SetStateAction } from 'react'
import { sf } from '../../../../lib/format'
import { DCM_SR, r25 } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { DcmState, CalcSelection } from '../types'
import { CrrStrip } from '../CrrStrip'
import { DCM_SPECS, type CrrWorkup } from '../../../../lib/crr'

// DC Magnetics — shift-based. `include` gates whether the fixed test set is
// emitted into the Spec Builder output (handled by the parent's payload builder).
export function DcmTab({ dcm, setDcm, sendItems, crrWorkup }: { dcm: DcmState; setDcm: Dispatch<SetStateAction<DcmState>>; sendItems: (items: CalcSelection[]) => void; crrWorkup?: CrrWorkup | null }) {
  const dcmRate = sf(dcm.rate, DCM_SR)
  const dcmPia = sf(dcm.pia, 1)
  const dcmSetupSug = r25(sf(dcm.setupShifts, 1.5) * dcmRate * dcmPia)
  const dcmTestSug = r25(sf(dcm.testShifts, 2.0) * dcmRate * dcmPia)
  return (
    <>
      <CrrStrip workup={crrWorkup} specs={DCM_SPECS} rate={dcmRate} pia={dcmPia} />
      <div style={grid2}>
        <Labeled label="Shift rate ($)"><input value={dcm.rate} onChange={(e) => setDcm((s) => ({ ...s, rate: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={dcm.pia} onChange={(e) => setDcm((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Setup shifts"><input value={dcm.setupShifts} onChange={(e) => setDcm((s) => ({ ...s, setupShifts: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Testing shifts"><input value={dcm.testShifts} onChange={(e) => setDcm((s) => ({ ...s, testShifts: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Spec"><input value={dcm.spec} onChange={(e) => setDcm((s) => ({ ...s, spec: e.target.value }))} style={input} /></Labeled>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 'var(--sp-2) 0 var(--sp-3)', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!dcm.include} onChange={(e) => setDcm((s) => ({ ...s, include: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Include DC Magnetics in the Spec Builder output</span>
      </label>
      <Suggest rows={[['Setup', dcmSetupSug], ['Testing', dcmTestSug]]} />
      <AddButton onClick={() => sendItems([{ key: 'dcm_setup', price: dcmSetupSug }, { key: 'dcm_test', price: dcmTestSug }])} />
    </>
  )
}
