import { type Dispatch, type SetStateAction } from 'react'
import { sf, money } from '../../../../lib/format'
import { type SetupInputs, smartSetup, hfvTestingPrice } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { HfvState, CalcSelection } from '../types'

export function HfvTab({ hfv, setHfv, su, sendItems }: { hfv: HfvState; setHfv: Dispatch<SetStateAction<HfvState>>; su: SetupInputs; sendItems: (items: CalcSelection[]) => void }) {
  const hfvTest = hfvTestingPrice(sf(hfv.dur, 30))
  const hfvPia = sf(hfv.pia, 1)
  const hfvSetupSug = Math.round(smartSetup(hfv.std, su) * hfvPia)
  const hfvTestSug = Math.round(hfvTest * hfvPia)
  return (
    <>
      <div style={grid2}>
        <Labeled label="Setup base ($)"><input value={hfv.std} onChange={(e) => setHfv((s) => ({ ...s, std: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Duration/axis (min)"><input value={hfv.dur} onChange={(e) => setHfv((s) => ({ ...s, dur: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={hfv.pia} onChange={(e) => setHfv((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Spec"><input value={hfv.spec} onChange={(e) => setHfv((s) => ({ ...s, spec: e.target.value }))} style={input} /></Labeled>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>≤60 min $1,225 · +$750/hr to 3 hr · +$525/hr beyond → {money(hfvTest)}/axis</div>
      <Suggest rows={[['Setup', hfvSetupSug], ['Testing', hfvTestSug]]} />
      <AddButton onClick={() => sendItems([{ key: 'hfv_setup', price: hfvSetupSug }, { key: 'hfv_test', price: hfvTestSug }])} />
    </>
  )
}
