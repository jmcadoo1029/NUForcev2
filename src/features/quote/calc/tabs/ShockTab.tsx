import { type Dispatch, type SetStateAction } from 'react'
import { sf, money } from '../../../../lib/format'
import { type SetupInputs, smartSetup, mwTesting, mwDisc, lwDisc, r25 } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { ShockState, CalcSelection } from '../types'

// `vibSetup` (the Vibration fixture setup) comes from the parent so the "moving
// from Vibration" discount reuses the same value the Vibration tab computes.
export function ShockTab({ shock, setShock, su, vibSetup, sendItems }: { shock: ShockState; setShock: Dispatch<SetStateAction<ShockState>>; su: SetupInputs; vibSetup: number; sendItems: (items: CalcSelection[]) => void }) {
  const isMW = shock.cat === 'Medium Weight'
  const shPia = sf(shock.pia, 1)
  const shSetupBase = shock.fromVib ? (isMW ? mwDisc(vibSetup) : lwDisc(vibSetup)) : smartSetup(shock.std, su)
  const shTestBase = isMW ? mwTesting(sf(shock.wt)) : sf(shock.lwTesting)
  const shSetupSug = r25(shSetupBase * shPia)
  const shTestSug = r25(shTestBase * shPia)
  const shName = isMW ? 'Medium Weight Shock' : 'Lightweight Shock'
  return (
    <>
      <div style={grid2}>
        <Labeled label="Category">
          <select value={shock.cat} onChange={(e) => setShock((s) => ({ ...s, cat: e.target.value, std: e.target.value === 'Medium Weight' ? '1500' : '900' }))} style={input}>
            <option>Medium Weight</option>
            <option>Lightweight</option>
          </select>
        </Labeled>
        <Labeled label="Weight (lbs)"><input value={shock.wt} onChange={(e) => setShock((s) => ({ ...s, wt: e.target.value }))} inputMode="decimal" placeholder={isMW ? 'sets MW price' : '—'} style={input} /></Labeled>
        {!isMW && <Labeled label="Testing ($)"><input value={shock.lwTesting} onChange={(e) => setShock((s) => ({ ...s, lwTesting: e.target.value }))} inputMode="decimal" style={input} /></Labeled>}
        <Labeled label="PIA (qty)"><input value={shock.pia} onChange={(e) => setShock((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Moving from Vibration">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, cursor: 'pointer' }}>
            <input type="checkbox" checked={shock.fromVib} onChange={(e) => setShock((s) => ({ ...s, fromVib: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{shock.fromVib ? 'reuse vib fixture' : 'off'}</span>
          </label>
        </Labeled>
      </div>
      {isMW && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>MW testing is weight-based: {money(mwTesting(sf(shock.wt)))} (≤2500 $4,575 · ≤3500 $5,575 · &gt;3500 $6,250)</div>}
      <Suggest rows={[[`${shName} – Setup`, shSetupSug], [`${shName} – Testing`, shTestSug]]} />
      <AddButton onClick={() => sendItems([{ key: isMW ? 'mws_setup' : 'lws_setup', price: shSetupSug }, { key: isMW ? 'mws_test' : 'lws_test', price: shTestSug }])} />
    </>
  )
}
