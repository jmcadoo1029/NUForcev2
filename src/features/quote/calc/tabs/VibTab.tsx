import { type Dispatch, type SetStateAction } from 'react'
import { sf } from '../../../../lib/format'
import { type SetupInputs, smartSetup, r25 } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { VibState, CalcSelection } from '../types'

export function VibTab({ vib, setVib, su, sendItems }: { vib: VibState; setVib: Dispatch<SetStateAction<VibState>>; su: SetupInputs; sendItems: (items: CalcSelection[]) => void }) {
  const vibPia = sf(vib.pia, 1)
  const vibSetupSug = r25(smartSetup(vib.std, su) * vibPia)
  const vibTestSug = r25(sf(vib.testing) * vibPia)
  return (
    <>
      <div style={grid2}>
        <Labeled label="Setup base ($)"><input value={vib.std} onChange={(e) => setVib((v) => ({ ...v, std: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Testing ($)"><input value={vib.testing} onChange={(e) => setVib((v) => ({ ...v, testing: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={vib.pia} onChange={(e) => setVib((v) => ({ ...v, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Spec"><input value={vib.spec} onChange={(e) => setVib((v) => ({ ...v, spec: e.target.value }))} style={input} /></Labeled>
      </div>
      <Suggest rows={[['Setup', vibSetupSug], ['Testing', vibTestSug]]} />
      <AddButton onClick={() => sendItems([{ key: 'vib_setup', price: vibSetupSug }, { key: 'vib_test', price: vibTestSug }])} />
    </>
  )
}
