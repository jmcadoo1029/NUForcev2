import { type Dispatch, type SetStateAction } from 'react'
import { sf } from '../../../../lib/format'
import { PQ_P1, PQ_300B, pqRowShifts, PQ_SR, r25 } from '../../../../data/calcPricing'
import { Labeled, Suggest, Warnings, PqTable, AddButton, input, grid2 } from '../ui'
import type { PqState, PqExpandState, CalcSelection } from '../types'
import { CrrStrip } from '../CrrStrip'
import { PQ_SPECS, type CrrWorkup } from '../../../../lib/crr'

// Power Quality (MIL-STD-1399-300) — shift-based. Phase (from the Test Item)
// drives the per-row shift counts and several advisory warnings.
export function PqTab({ pq, setPq, pqExpand, setPqExpand, ti, sendItems, crrWorkup }: { pq: PqState; setPq: Dispatch<SetStateAction<PqState>>; pqExpand: PqExpandState; setPqExpand: Dispatch<SetStateAction<PqExpandState>>; ti?: Record<string, any>; sendItems: (items: CalcSelection[]) => void; crrWorkup?: CrrWorkup | null }) {
  const pqRate = sf(pq.rate, PQ_SR)
  const pqIs3ph = sf(ti?.phase, 3) >= 3
  const pqPia = sf(pq.pia, 1)
  const pqTestShifts = [...PQ_P1, ...PQ_300B].reduce((a, r) => a + (pq.rows[r.key] ? pqRowShifts(r, pqIs3ph) : 0), 0)
  const pqSetupSug = r25(sf(pq.setupShifts, 1.5) * pqRate * pqPia)
  const pqTestSug = r25(pqTestShifts * pqRate * pqPia)
  const pqTdSug = r25(sf(pq.tdShifts, 1.0) * pqRate)
  const pqWarnings: string[] = (() => {
    const w: string[] = []
    const amps = sf(ti?.amps, 0)
    const phaseN = sf(ti?.phase, 3)
    const cwSel = pq.rows['5.3.7'] || pq.rows['B5.3.7']
    const agdSel = pq.rows['5.3.10.2'] || pq.rows['B5.3.10.2']
    const spikeSel = pq.rows['5.3.5'] || pq.rows['B5.3.3']
    if (sf(ti?.volt, 0) >= 440 && (String(ti?.pwrType ?? '') || 'AC') === 'AC') w.push('440 VAC — power source rental required (not in the suggested price; add via Budget).')
    if (amps > 0 && amps < 1 && cwSel) w.push('Current Waveform test (5.3.7 / B5.3.7) is not required for EUT currents under 1 A per NAVSEA — consider removing it.')
    if (agdSel) w.push('AGD test (5.3.10.2 / B5.3.10.2): if required (common for submarines), a high-voltage power supply rental will likely be needed.')
    if (phaseN > 3) w.push('Unit has multiple power feeds — discuss which lines require testing and which tests apply to each feed before finalizing scope.')
    if (spikeSel) w.push('Voltage Spike testing: NU Labs uses an IEC 61000-4-5 waveform instead of the MIL-STD waveform, as noted in the Test Specifications.')
    return w
  })()
  return (
    <>
      <CrrStrip workup={crrWorkup} specs={PQ_SPECS} rate={pqRate} pia={pqPia} />
      <div style={grid2}>
        <Labeled label="Shift rate ($)"><input value={pq.rate} onChange={(e) => setPq((s) => ({ ...s, rate: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={pq.pia} onChange={(e) => setPq((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Setup shifts"><input value={pq.setupShifts} onChange={(e) => setPq((s) => ({ ...s, setupShifts: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Teardown shifts"><input value={pq.tdShifts} onChange={(e) => setPq((s) => ({ ...s, tdShifts: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>{pqIs3ph ? '3-phase' : 'single-phase'} shift counts (from the Test Item phase).</div>
      <PqTable title="MIL-STD-1399-300 Part 1" rows={PQ_P1} selected={pq.rows} is3ph={pqIs3ph} open={pqExpand.p1} onToggleOpen={() => setPqExpand((e) => ({ ...e, p1: !e.p1 }))} onToggleRow={(k) => setPq((s) => ({ ...s, rows: { ...s.rows, [k]: !s.rows[k] } }))} onToggleAll={(v) => setPq((s) => { const rows = { ...s.rows }; PQ_P1.forEach((r) => (rows[r.key] = v)); return { ...s, rows } })} />
      <PqTable title="MIL-STD-1399-300B" rows={PQ_300B} selected={pq.rows} is3ph={pqIs3ph} open={pqExpand.b3} onToggleOpen={() => setPqExpand((e) => ({ ...e, b3: !e.b3 }))} onToggleRow={(k) => setPq((s) => ({ ...s, rows: { ...s.rows, [k]: !s.rows[k] } }))} onToggleAll={(v) => setPq((s) => { const rows = { ...s.rows }; PQ_300B.forEach((r) => (rows[r.key] = v)); return { ...s, rows } })} />
      <Suggest rows={[['Setup', pqSetupSug], ['Testing', pqTestSug], ['Teardown', pqTdSug]]} />
      <Warnings items={pqWarnings} />
      <AddButton onClick={() => sendItems([{ key: 'pq_setup', price: pqSetupSug }, { key: 'pq_test', price: pqTestSug }, { key: 'pq_td', price: pqTdSug }])} />
    </>
  )
}
