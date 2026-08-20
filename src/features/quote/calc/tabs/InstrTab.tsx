import { type Dispatch, type SetStateAction } from 'react'
import { sf, money } from '../../../../lib/format'
import { INSTR_ITEMS } from '../../../../data/calcPricing'
import { Suggest, AddButton, input } from '../ui'
import type { InstrState, CalcSelection } from '../types'

// Instrumentation — a flat catalog of per-channel add-ons plus High Speed Video.
export function InstrTab({ instr, setInstr, sendItems }: { instr: InstrState; setInstr: Dispatch<SetStateAction<InstrState>>; sendItems: (items: CalcSelection[]) => void }) {
  const instrTotal = INSTR_ITEMS.reduce((a, it) => a + (instr[it.key] ? it.price * sf(instr[it.chKey], 1) : 0), 0) + (instr.hsv ? 1950 : 0)
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--sp-3)' }}>
        {INSTR_ITEMS.map((it) => {
          const on = !!instr[it.key]
          return (
            <div key={it.key} onClick={() => setInstr((p) => ({ ...p, [it.key]: !p[it.key] }))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--accent-soft)' : 'var(--bg)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)') }}>
              <input type="checkbox" checked={on} readOnly style={{ accentColor: 'var(--accent)', width: 16, height: 16, pointerEvents: 'none' }} />
              <span style={{ flex: 1, fontSize: 'var(--fs-base)', fontWeight: on ? 600 : 400 }}>{it.label}</span>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{money(it.price)}/ch</span>
              {on && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>ch</span>
                  <input type="number" min="1" value={instr[it.chKey]} onChange={(e) => setInstr((p) => ({ ...p, [it.chKey]: e.target.value }))} style={{ ...input, width: 52, textAlign: 'center' }} />
                  <span style={{ fontWeight: 700, minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(it.price * sf(instr[it.chKey], 1))}</span>
                </div>
              )}
            </div>
          )
        })}
        <div onClick={() => setInstr((p) => ({ ...p, hsv: !p.hsv }))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', background: instr.hsv ? 'var(--accent-soft)' : 'var(--bg)', border: '1px solid ' + (instr.hsv ? 'var(--accent)' : 'var(--border)') }}>
          <input type="checkbox" checked={!!instr.hsv} readOnly style={{ accentColor: 'var(--accent)', width: 16, height: 16, pointerEvents: 'none' }} />
          <span style={{ flex: 1, fontSize: 'var(--fs-base)', fontWeight: instr.hsv ? 600 : 400 }}>High Speed Video</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>flat</span>
          {instr.hsv && <span style={{ fontWeight: 700, minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(1950)}</span>}
        </div>
      </div>
      {instrTotal > 0 && <Suggest rows={[['Instrumentation', instrTotal]]} />}
      <AddButton
        onClick={() => {
          const items: CalcSelection[] = []
          INSTR_ITEMS.forEach((it) => { if (instr[it.key]) items.push({ key: it.catKey, price: it.price * sf(instr[it.chKey], 1) }) })
          if (instr.hsv) items.push({ key: 'hsv', price: 1950 })
          sendItems(items)
        }}
      />
    </>
  )
}
