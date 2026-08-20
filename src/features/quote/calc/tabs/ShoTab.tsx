import { type Dispatch, type SetStateAction } from 'react'
import { sf } from '../../../../lib/format'
import { type SetupInputs, smartSetup } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { ShoState, CalcSelection } from '../types'

// Shock (Other) — pulse-shape shock with an optional HFV-discounted setup.
export function ShoTab({ sho, setSho, su, sendItems }: { sho: ShoState; setSho: Dispatch<SetStateAction<ShoState>>; su: SetupInputs; sendItems: (items: CalcSelection[]) => void }) {
  const shoBase = smartSetup(sho.std, su)
  const shoSetupAmt = sho.hfvDisc ? Math.ceil((shoBase * 0.75) / 25) * 25 : shoBase
  const shoPia = sf(sho.pia, 1)
  const shoSetupSug = Math.round(shoSetupAmt * shoPia)
  const shoTestSug = Math.round(sf(sho.testing, 1250) * shoPia)
  return (
    <>
      <div style={grid2}>
        <Labeled label="Pulse shape">
          <select value={sho.shape} onChange={(e) => setSho((s) => ({ ...s, shape: e.target.value }))} style={input}>
            <option>Half Sine</option>
            <option>Sawtooth</option>
            <option>Bench Handling</option>
            <option>Drop Shock</option>
          </select>
        </Labeled>
        <Labeled label="Setup base ($)"><input value={sho.std} onChange={(e) => setSho((s) => ({ ...s, std: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Testing ($)"><input value={sho.testing} onChange={(e) => setSho((s) => ({ ...s, testing: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={sho.pia} onChange={(e) => setSho((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="HFV discount">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, cursor: 'pointer' }}>
            <input type="checkbox" checked={sho.hfvDisc} onChange={(e) => setSho((s) => ({ ...s, hfvDisc: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{sho.hfvDisc ? '25% off setup' : 'off'}</span>
          </label>
        </Labeled>
        <Labeled label="Spec"><input value={sho.spec} onChange={(e) => setSho((s) => ({ ...s, spec: e.target.value }))} style={input} /></Labeled>
      </div>
      <Suggest rows={[['Shock (Other) – Setup', shoSetupSug], ['Shock (Other) – Testing', shoTestSug]]} />
      <AddButton onClick={() => sendItems([{ key: 'sho_setup', price: shoSetupSug }, { key: 'sho_test', price: shoTestSug }])} />
    </>
  )
}
