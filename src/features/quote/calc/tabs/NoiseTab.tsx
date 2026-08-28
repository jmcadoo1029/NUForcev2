import { type Dispatch, type SetStateAction } from 'react'
import { sf, money } from '../../../../lib/format'
import { NOISE_CHAMBERS, NOISE_LEVELS, noiseTestingPrice, noiseCompCost, noiseChamberFit } from '../../../../data/calcPricing'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { NoiseState, CalcSelection } from '../types'

export function NoiseTab({ noise, setNoise, ti, sendItems }: { noise: NoiseState; setNoise: Dispatch<SetStateAction<NoiseState>>; ti?: Record<string, any>; sendItems: (items: CalcSelection[]) => void }) {
  const noiseComp = noiseCompCost(noise.chamber, noise.level)
  const noiseTest = noiseTestingPrice(noise.durVal, noise.durUnit, noise.level, noiseComp)
  const noisePia = sf(noise.pia, 1)
  const noiseSetupSug = Math.round((NOISE_CHAMBERS[noise.chamber] || 1000) * noisePia)
  const noiseTestSug = Math.round(noiseTest * noisePia)
  // The compressor cost (marked up 25%) is baked into the testing price. Split it
  // out for the breakdown so it's itemized, while keeping the total unchanged:
  // Testing (ex-compressor) + Compressor = the same Testing suggestion as before.
  const noiseCompSug = Math.round(noiseComp * 1.25 * noisePia)
  const noiseTestExCompSug = noiseTestSug - noiseCompSug
  const noiseFit = noiseChamberFit(sf(ti?.dimL), sf(ti?.dimW), sf(ti?.dimH), noise.level, noise.chamber)
  return (
    <>
      <div style={grid2}>
        <Labeled label="Chamber">
          <select value={noise.chamber} onChange={(e) => setNoise((s) => ({ ...s, chamber: e.target.value }))} style={input}>
            {Object.keys(NOISE_CHAMBERS).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Labeled>
        <Labeled label="OASPL level">
          <select value={noise.level} onChange={(e) => setNoise((s) => ({ ...s, level: e.target.value }))} style={input}>
            {NOISE_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Labeled>
        <Labeled label="Duration"><input value={noise.durVal} onChange={(e) => setNoise((s) => ({ ...s, durVal: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Unit">
          <select value={noise.durUnit} onChange={(e) => setNoise((s) => ({ ...s, durUnit: e.target.value }))} style={input}>
            <option>minutes</option>
            <option>hours</option>
          </select>
        </Labeled>
        <Labeled label="PIA (qty)"><input value={noise.pia} onChange={(e) => setNoise((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Spec"><input value={noise.spec} onChange={(e) => setNoise((s) => ({ ...s, spec: e.target.value }))} style={input} /></Labeled>
      </div>
      {noiseFit.rec && (
        <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)', color: noiseFit.ok ? 'var(--pos)' : 'var(--accent)' }}>
          {noiseFit.ok ? `✓ ${noise.chamber} fits this unit` : `Recommended: ${noiseFit.rec} — ${noise.chamber} may not fit`}
        </div>
      )}
      {noiseComp > 0 && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginBottom: 'var(--sp-3)' }}>Compressor {money(noiseComp)} → {money(Math.round(noiseComp * 1.25))} marked up (itemized in testing below)</div>}
      <Suggest rows={noiseComp > 0 ? [['Setup', noiseSetupSug], ['Testing (ex. compressor)', noiseTestExCompSug], ['Compressor (25% markup)', noiseCompSug]] : [['Setup', noiseSetupSug], ['Testing', noiseTestSug]]} />
      <AddButton onClick={() => sendItems([{ key: 'noise_setup', price: noiseSetupSug }, { key: 'noise_test', price: noiseTestSug }])} />
    </>
  )
}
