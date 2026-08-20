import { type Dispatch, type SetStateAction } from 'react'
import { type SetupInputs, ENV_TYPES, ENV_TYPE_CATALOG, ALT_DWELL_PRICES, envPricing } from '../../../../data/calcPricing'
import { TH_PRICES } from '../../../../data/catalog'
import { Labeled, Suggest, AddButton, input, grid2 } from '../ui'
import type { EnvState, CalcSelection } from '../types'

export function EnvTab({ env, setEnv, su, sendItems }: { env: EnvState; setEnv: Dispatch<SetStateAction<EnvState>>; su: SetupInputs; sendItems: (items: CalcSelection[]) => void }) {
  const envP = envPricing(env, su)
  const envCat = ENV_TYPE_CATALOG[env.type] || { test: '' }
  const isTHType = ['Temperature & Humidity', 'Temperature Only', 'Humidity Only'].includes(env.type)
  return (
    <>
      <div style={grid2}>
        <Labeled label="Test type">
          <select value={env.type} onChange={(e) => setEnv((s) => ({ ...s, type: e.target.value }))} style={input}>
            {ENV_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Labeled>
        <Labeled label="Spec"><input value={env.spec} onChange={(e) => setEnv((s) => ({ ...s, spec: e.target.value }))} style={input} /></Labeled>
        {isTHType && (
          <Labeled label="T&H duration">
            <select value={env.thDur} onChange={(e) => setEnv((s) => ({ ...s, thDur: e.target.value }))} style={input}>
              {Object.keys(TH_PRICES).map((d) => <option key={d}>{d}</option>)}
            </select>
          </Labeled>
        )}
        {env.type === 'Altitude' && (
          <Labeled label="Dwell time">
            <select value={env.altDwell} onChange={(e) => setEnv((s) => ({ ...s, altDwell: e.target.value }))} style={input}>
              {Object.keys(ALT_DWELL_PRICES).map((d) => <option key={d}>{d}</option>)}
            </select>
          </Labeled>
        )}
      </div>
      <Suggest rows={envP.setup > 0 ? [['Setup', envP.setup], ['Testing', envP.testing]] : [['Testing', envP.testing]]} />
      <AddButton
        onClick={() => {
          const items: CalcSelection[] = []
          if (envP.setup > 0 && envCat.setup) items.push({ key: envCat.setup, price: envP.setup })
          if (envCat.test) items.push({ key: envCat.test, price: envP.testing })
          sendItems(items)
        }}
      />
    </>
  )
}
