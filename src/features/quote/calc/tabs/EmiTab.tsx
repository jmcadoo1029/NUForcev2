import { type Dispatch, type SetStateAction } from 'react'
import { sf } from '../../../../lib/format'
import { EMI_SR, r25 } from '../../../../data/calcPricing'
import { calcEmiShifts, emiTestList, EMI_TEST_LABELS, emiTestFlags, EMI_PLATS, EMI_LOCS_CAN, EMI_LOCS_TBD, EMI_LOCS_CANT } from '../../../../data/emiShifts'
import { Labeled, Suggest, Chk, LocGroup, Warnings, AddButton, input, grid2, sectionLabel } from '../ui'
import type { EmiState, EmiBudgetState, CalcBudgetRow, CalcSelection } from '../types'
import { CrrStrip } from '../CrrStrip'
import { EMI_SPECS, type CrrWorkup } from '../../../../lib/crr'

// EMI (MIL-STD-461) — shift-based, with positions computed from the Test Item
// size / phase / cables. The most involved tab: platform + location context feed
// per-test enable/disable flags and advisory warnings, and two rental add-ons can
// be pushed one-way into the Budget list.
export function EmiTab({
  emi, setEmi, emiOpen, setEmiOpen, emiBudget, setEmiBudget, ti, setup, onSetupChange, onAddBudget, onOpenQuestions, sendItems, crrWorkup,
}: {
  emi: EmiState
  setEmi: Dispatch<SetStateAction<EmiState>>
  emiOpen: boolean
  setEmiOpen: Dispatch<SetStateAction<boolean>>
  emiBudget: EmiBudgetState
  setEmiBudget: Dispatch<SetStateAction<EmiBudgetState>>
  ti?: Record<string, any>
  setup: Record<string, any>
  onSetupChange: (patch: Record<string, any>) => void
  onAddBudget: (rows: CalcBudgetRow[]) => void
  onOpenQuestions: () => void
  sendItems: (items: CalcSelection[]) => void
  crrWorkup?: CrrWorkup | null
}) {
  const emiRate = sf(emi.rate, EMI_SR)
  const emiPia = sf(emi.pia, 1)
  const emiTests = emiTestList(emi.revF, emi.revG)
  const emiShiftMap = calcEmiShifts({ dimL: ti?.dimL, dimW: ti?.dimW, dimH: ti?.dimH, phases: ti?.phase, setupCables: setup?.cables, revs: { 'Rev F': emi.revF, 'Rev G': emi.revG } })
  const emiFlagCtx = { amps: sf(ti?.amps), hz: sf(ti?.hz), isDC: String(ti?.pwrType ?? '') === 'DC', isSub: !!emi.plats['Submarines'], locs: emi.locs }
  const emiFlagOf = (t: string) => emiTestFlags(t, emi.revF, emi.revG, emiFlagCtx)
  const emiTestShifts = emiTests.reduce((a, t) => a + (emi.tests[t] && !emiFlagOf(t).disabled ? emiShiftMap[t]?.rounded || 0 : 0), 0)
  const emiSetupSug = r25(sf(emi.setupShifts, 3) * emiRate * emiPia)
  const emiTestSug = r25(emiTestShifts * emiRate * emiPia)
  const emiTdSug = r25(sf(emi.tdShifts, 1) * emiRate)
  const emiSelCount = emiTests.filter((t) => emi.tests[t] && !emiFlagOf(t).disabled).length
  const emiWarnings: string[] = (() => {
    const w: string[] = []
    if (sf(ti?.volt, 0) >= 440 && (String(ti?.pwrType ?? '') || 'AC') === 'AC' && (emi.tests.CE101 || emi.tests.CE102)) w.push('440 VAC — power source rental (~$6,500) required for CE101/CE102; add it to the Budget (raw).')
    if (emi.tests.RS103) w.push('RS103 selected — amplifier rental (~$5,000) applies; add it to the Budget (raw; budget applies markup).')
    if (!sf(ti?.dimL) || !sf(ti?.dimW) || !sf(ti?.dimH)) w.push('Enter the Test Item dimensions — RE102 / RS101 / RS103 positions (and price) depend on size.')
    emiTests.forEach((t) => { if (emi.tests[t]) emiFlagOf(t).warnings.forEach((x) => { if (!w.includes(x)) w.push(x) }) })
    return w
  })()
  const emiRs103Applies = !!emi.tests.RS103 && !emiFlagOf('RS103').disabled
  const emi440Applies = sf(ti?.volt, 0) >= 440 && (String(ti?.pwrType ?? '') || 'AC') === 'AC' && (emi.tests.CE101 || emi.tests.CE102)
  const emiBudgetRows = (): CalcBudgetRow[] => {
    const rows: CalcBudgetRow[] = []
    if (emiRs103Applies && emiBudget.rs103On) rows.push({ desc: 'RS103 amplifier rental', qty: '1', unitCost: String(sf(emiBudget.rs103Amt)) })
    if (emi440Applies && emiBudget.v440On) rows.push({ desc: '440V AC power source rental', qty: '1', unitCost: String(sf(emiBudget.v440Amt)) })
    return rows
  }
  return (
    <>
      <CrrStrip workup={crrWorkup} specs={EMI_SPECS} rate={emiRate} pia={emiPia} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>MIL-STD-461</span>
        <Chk label="Rev F" checked={emi.revF} onChange={(v) => setEmi((s) => ({ ...s, revF: v }))} />
        <Chk label="Rev G" checked={emi.revG} onChange={(v) => setEmi((s) => ({ ...s, revG: v }))} />
        <button onClick={onOpenQuestions} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer' }}>Customer Questions</button>
      </div>
      <div style={grid2}>
        <Labeled label="Shift rate ($)"><input value={emi.rate} onChange={(e) => setEmi((s) => ({ ...s, rate: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="PIA (qty)"><input value={emi.pia} onChange={(e) => setEmi((s) => ({ ...s, pia: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Setup shifts"><input value={emi.setupShifts} onChange={(e) => setEmi((s) => ({ ...s, setupShifts: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="Teardown shifts"><input value={emi.tdShifts} onChange={(e) => setEmi((s) => ({ ...s, tdShifts: e.target.value }))} inputMode="decimal" style={input} /></Labeled>
        <Labeled label="# Cables"><input value={setup?.cables ?? ''} onChange={(e) => onSetupChange({ cables: e.target.value })} inputMode="decimal" style={input} /></Labeled>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>Shifts computed from Test Item size ({sf(ti?.dimL) || '—'}×{sf(ti?.dimW) || '—'}×{sf(ti?.dimH) || '—'} in), phase ({sf(ti?.phase, 3)}), cables ({Math.max(1, sf(setup?.cables, 0)) || 1}).</div>

      {/* Platform */}
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={sectionLabel}>Platform</div>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {EMI_PLATS.map((p) => <Chk key={p} label={p} checked={!!emi.plats[p]} onChange={(v) => setEmi((s) => ({ ...s, plats: { ...s.plats, [p]: v } }))} />)}
        </div>
      </div>

      {/* Location / RE102 limits */}
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={sectionLabel}>Location <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--dim)' }}>· RE102 limits</span></div>
        <LocGroup title="In-house capable" tone="var(--pos)" items={EMI_LOCS_CAN} locs={emi.locs} onToggle={(k, v) => setEmi((s) => ({ ...s, locs: { ...s.locs, [k]: v } }))} />
        <LocGroup title="Feasibility TBD" tone="var(--warn)" items={EMI_LOCS_TBD} locs={emi.locs} onToggle={(k, v) => setEmi((s) => ({ ...s, locs: { ...s.locs, [k]: v } }))} />
        <LocGroup title="Subcontract required" tone="var(--accent)" items={EMI_LOCS_CANT} locs={emi.locs} onToggle={(k, v) => setEmi((s) => ({ ...s, locs: { ...s.locs, [k]: v } }))} />
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--sp-3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--bg)' }}>
          <button onClick={() => setEmiOpen((o) => !o)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{emiOpen ? '▾' : '▸'} Tests</span>
            <span style={{ fontSize: 'var(--fs-sm)', color: emiSelCount ? 'var(--accent)' : 'var(--muted)' }}>{emiSelCount} selected · {emiTestShifts} sh</span>
          </button>
          <button onClick={() => setEmi((s) => { const selectable = emiTests.filter((t) => !emiFlagOf(t).disabled); const all = selectable.every((t) => s.tests[t]); const tests = { ...s.tests }; selectable.forEach((t) => (tests[t] = !all)); return { ...s, tests } })} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>{emiTests.filter((t) => !emiFlagOf(t).disabled).every((t) => emi.tests[t]) ? 'Clear all' : 'Select all'}</button>
        </div>
        {emiOpen && (
          <div style={{ padding: '6px 8px' }}>
            {emiTests.map((t) => {
              const on = !!emi.tests[t]
              const sh = emiShiftMap[t]?.rounded ?? 0
              const fl = emiFlagOf(t)
              return (
                <div key={t} style={{ borderRadius: 6, background: on && !fl.disabled ? 'var(--accent-soft)' : 'transparent', marginBottom: 2 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', cursor: fl.disabled ? 'not-allowed' : 'pointer', opacity: fl.disabled ? 0.55 : 1 }}>
                    <input type="checkbox" checked={on && !fl.disabled} disabled={fl.disabled} onChange={() => setEmi((s) => ({ ...s, tests: { ...s.tests, [t]: !s.tests[t] } }))} style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{EMI_TEST_LABELS[t] || t}</span>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', flexShrink: 0 }}>{fl.disabled ? '—' : `${sh} sh`}</span>
                  </label>
                  {fl.disabled && fl.reason && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', padding: '0 6px 5px 29px' }}>{fl.reason}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Suggest rows={[['Setup', emiSetupSug], ['Testing', emiTestSug], ['Teardown', emiTdSug]]} />
      <Warnings items={emiWarnings} />

      {(emiRs103Applies || emi440Applies) && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <div style={sectionLabel}>Budget add-ons <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--dim)' }}>· raw cost → Budget list</span></div>
          {emiRs103Applies && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1 }}><Chk label="RS103 amplifier rental" checked={emiBudget.rs103On} onChange={(v) => setEmiBudget((b) => ({ ...b, rs103On: v }))} /></div>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>$</span>
              <input value={emiBudget.rs103Amt} onChange={(e) => setEmiBudget((b) => ({ ...b, rs103Amt: e.target.value }))} inputMode="decimal" style={{ ...input, width: 92, textAlign: 'right' }} />
            </div>
          )}
          {emi440Applies && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1 }}><Chk label="440V AC power source" checked={emiBudget.v440On} onChange={(v) => setEmiBudget((b) => ({ ...b, v440On: v }))} /></div>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>$</span>
              <input value={emiBudget.v440Amt} onChange={(e) => setEmiBudget((b) => ({ ...b, v440Amt: e.target.value }))} inputMode="decimal" style={{ ...input, width: 92, textAlign: 'right' }} />
            </div>
          )}
          <button onClick={() => { const rows = emiBudgetRows(); if (rows.length) onAddBudget(rows) }} disabled={emiBudgetRows().length === 0} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: emiBudgetRows().length ? 'var(--accent)' : 'var(--dim)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '6px 14px', cursor: emiBudgetRows().length ? 'pointer' : 'default', marginTop: 4 }}>+ Add checked to Budget</button>
        </div>
      )}

      <AddButton onClick={() => sendItems([{ key: 'emi_setup', price: emiSetupSug }, { key: 'emi_test', price: emiTestSug }, { key: 'emi_td', price: emiTdSug }])} />
    </>
  )
}
