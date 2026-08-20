import { type Dispatch, type SetStateAction } from 'react'
import { sf } from '../../../../lib/format'
import { type SetupInputs, smartSetup } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { StdState, CalcSelection } from '../types'

// Shared setup+testing tab used by Airborne and Structureborne (identical shape;
// only the display name and the line-item key prefix differ).
export function StdTestTab({ state, setState, su, sendItems, name, keyPrefix }: { state: StdState; setState: Dispatch<SetStateAction<StdState>>; su: SetupInputs; sendItems: (items: CalcSelection[]) => void; name: string; keyPrefix: string }) {
  const pia = sf(state.pia, 1)
  const setupSug = Math.round(smartSetup(state.std, su) * pia)
  const testSug = Math.round(sf(state.testing) * pia)
  return (
    <>
      <div style={grid2}>
        <Labeled label="Setup base ($)"><input value={state.std} onChange={(e) => setState((s) => ({ ...s, std: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Testing ($)"><input value={state.testing} onChange={(e) => setState((s) => ({ ...s, testing: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={state.pia} onChange={(e) => setState((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Spec"><input value={state.spec} onChange={(e) => setState((s) => ({ ...s, spec: e.target.value }))} style={input} /></Labeled>
      </div>
      <Suggest rows={[[`${name} – Setup`, setupSug], [`${name} – Testing`, testSug]]} />
      <AddButton onClick={() => sendItems([{ key: `${keyPrefix}_setup`, price: setupSug }, { key: `${keyPrefix}_test`, price: testSug }])} />
    </>
  )
}
