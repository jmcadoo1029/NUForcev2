import { useRef, useState } from 'react'
import { sf, money } from '../../lib/format'
import { type SetupInputs, SETUP_DEFAULTS, drillFab, smartSetup, PQ_SR, DCM_SR, EMI_SR, OT_DEFAULTS } from '../../data/calcPricing'
import { getEmi461fTestDefinitions, getEmi461gTestDefinitions } from '../../data/emiSpecDefs'
import { getPq300bTestDefinitions, getPq300p1TestDefinitions } from '../../data/pqSpecDefs'
import { menuItemStyle } from '../../components'
import { Labeled, input, sectionLabel, tabBtn, tabBtnOn, specTriggerBtn } from './calc/ui'
import type { CalcSelection, CalcCustom, CalcBudgetRow } from './calc/types'
import { FabGuide } from './FabGuide'
import { EmiCustomerQuestions } from './EmiCustomerQuestions'
import { VibTab } from './calc/tabs/VibTab'
import { ShockTab } from './calc/tabs/ShockTab'
import { NoiseTab } from './calc/tabs/NoiseTab'
import { EnvTab } from './calc/tabs/EnvTab'
import { HfvTab } from './calc/tabs/HfvTab'
import { ShoTab } from './calc/tabs/ShoTab'
import { StdTestTab } from './calc/tabs/StdTestTab'
import { InstrTab } from './calc/tabs/InstrTab'
import { EmiTab } from './calc/tabs/EmiTab'
import { PqTab } from './calc/tabs/PqTab'
import { useCrrWorkup, deriveCrrShifts, EMI_SPECS, PQ_SPECS, DCM_SPECS } from '../../lib/crr'
import { DcmTab } from './calc/tabs/DcmTab'
import { OtTab } from './calc/tabs/OtTab'

// Public types re-exported for consumers (e.g. QuotePage imports CalcSelection).
export type { CalcSelection, CalcCustom, CalcBudgetRow } from './calc/types'

// Pricing Calculator — the "suggested pricing" tool, ported from Classic's
// PricingCalculator. A right-side drawer of per-test tabs. Each tab shows a
// SUGGESTED setup/testing price from the shared setup inputs + test item; it does
// not touch the quote until you hit "Add to quote", which drops the suggested
// lines into the draft line items (preview until Phase 7). The parent owns all
// tab state (so EMI/PQ/DCM selections stay reachable by the Spec Builder) and the
// shared setup inputs; each tab is a presentational component fed its state slice.

type Tab = 'vib' | 'shock' | 'noise' | 'env' | 'hfv' | 'sho' | 'ab' | 'sb' | 'instr' | 'emi' | 'pq' | 'dcm' | 'ot'
const TABS: { key: Tab; label: string }[] = [
  { key: 'vib', label: 'Vibration' },
  { key: 'shock', label: 'Shock' },
  { key: 'noise', label: 'Noise' },
  { key: 'env', label: 'Environmental' },
  { key: 'hfv', label: 'HF Vibration' },
  { key: 'sho', label: 'Shock (Other)' },
  { key: 'ab', label: 'Airborne' },
  { key: 'sb', label: 'Structureborne' },
  { key: 'instr', label: 'Instrumentation' },
  { key: 'emi', label: 'EMI' },
  { key: 'pq', label: 'Power Quality' },
  { key: 'dcm', label: 'DC Magnetics' },
  { key: 'ot', label: 'Overtime' },
]

export function PricingCalculator({
  onSend,
  onSendCustom,
  onAddBudget,
  onClose,
  ti,
  qi,
  setup,
  onSetupChange,
}: {
  onSend: (items: CalcSelection[]) => void
  onSendCustom: (lines: CalcCustom[]) => void
  onAddBudget: (rows: CalcBudgetRow[]) => void
  onClose: () => void
  ti?: Record<string, any>
  qi?: Record<string, any> // quote info (opp/date) — for spec-PDF headers
  setup: Record<string, any> // the quote's Setup Details (shared, live)
  onSetupChange: (patch: Record<string, any>) => void
}) {
  const [tab, setTab] = useState<Tab>('vib')
  const [fabGuideOpen, setFabGuideOpen] = useState(false)
  const [emiQOpen, setEmiQOpen] = useState(false)

  // Setup inputs come from the quote's Setup Details section (shared source), so
  // the calculator is seeded from — and edits — the same values.
  const su: SetupInputs = {
    techRate: sf(setup?.techRate, SETUP_DEFAULTS.techRate),
    fabHours: sf(setup?.fabHours, SETUP_DEFAULTS.fabHours),
    holes: sf(setup?.holes, SETUP_DEFAULTS.holes),
    drillTap: !!setup?.drillTap,
  }

  const [vib, setVib] = useState({ std: '900', testing: '3250', pia: '1', spec: '', freqRange: '' })
  const [shock, setShock] = useState({ cat: 'Medium Weight', std: '1500', wt: sf(ti?.wt) ? String(sf(ti?.wt)) : '', fromVib: false, pia: '1', lwTesting: '1450' })
  const [noise, setNoise] = useState({ chamber: 'Speakerbox', level: '<=140dB', durVal: '30', durUnit: 'minutes', pia: '1', spec: '' })
  const [env, setEnv] = useState({ type: 'Temperature & Humidity', thDur: '0 to 1 Day', altDwell: '1-30 min', spec: '' })
  const [hfv, setHfv] = useState({ std: '500', dur: '30', pia: '1', spec: '' })
  const [sho, setSho] = useState({ std: '500', testing: '1250', hfvDisc: false, pia: '1', shape: 'Half Sine', spec: '' })
  const [ab, setAb] = useState({ std: '1000', testing: '2850', pia: '1', spec: '' })
  const [sb, setSb] = useState({ std: '850', testing: '2650', pia: '1', spec: '' })
  const [instr, setInstr] = useState<Record<string, any>>({ shock: false, shockCh: '1', cmShock: false, cmShockCh: '1', vib: false, vibCh: '1', cmVib: false, cmVibCh: '1', hsv: false })
  const [pq, setPq] = useState<{ rate: string; setupShifts: string; tdShifts: string; pia: string; rows: Record<string, boolean>; spec: string }>({ rate: String(PQ_SR), setupShifts: '1.5', tdShifts: '1.0', pia: '1', rows: {}, spec: '' })
  const [dcm, setDcm] = useState({ rate: String(DCM_SR), setupShifts: '1.5', testShifts: '2.0', pia: '1', spec: '', include: false })
  const [otRates, setOtRates] = useState({ wkBase: String(OT_DEFAULTS.wkBase), wkRate: String(OT_DEFAULTS.wkRate), weBase: String(OT_DEFAULTS.weBase), weRate: String(OT_DEFAULTS.weRate) })
  const [otRows, setOtRows] = useState<{ key: number; type: string; techs: string; hours: string }[]>([{ key: 1, type: 'Weekday', techs: '1', hours: '0' }])
  const [pqExpand, setPqExpand] = useState({ p1: true, b3: false })
  const [emi, setEmi] = useState<{ revF: boolean; revG: boolean; rate: string; setupShifts: string; tdShifts: string; pia: string; tests: Record<string, boolean>; plats: Record<string, boolean>; locs: Record<string, boolean>; spec: string }>({ revF: true, revG: false, rate: String(EMI_SR), setupShifts: '3.0', tdShifts: '1.0', pia: '1', tests: {}, plats: {}, locs: {}, spec: '' })
  const [emiOpen, setEmiOpen] = useState(true)
  // CRR workup for this quote (read-only reference in the EMI / PQ tabs).
  const { workup: crrWorkup } = useCrrWorkup(qi?.opp)
  const emiHasCrr = deriveCrrShifts(crrWorkup, EMI_SPECS).tests.length > 0
  const pqHasCrr = deriveCrrShifts(crrWorkup, PQ_SPECS).tests.length > 0
  const dcmHasCrr = deriveCrrShifts(crrWorkup, DCM_SPECS).tests.length > 0
  // EMI budget add-ons — pre-checked, editable raw amounts. Ported one-way to the Budget list.
  const [emiBudget, setEmiBudget] = useState({ rs103On: true, rs103Amt: '5000', v440On: true, v440Amt: '6500' })

  // Test Spec Builder — a standalone tool at /classic-spec-builder.html opened in
  // a new tab. Three sources: blank (Classic), from the quote's calculator
  // selections (NUForce), or from the CRR workup (needs Workspace — preview).
  const [specMenuOpen, setSpecMenuOpen] = useState(false)
  const SPEC_URL = '/classic-spec-builder.html'

  // Build the from-quote payload the HTML tool reads from localStorage: one
  // section per active standard, rows as [test, label, comments]. Ported from
  // Classic's buildSpecBuilderPayload.
  const buildSpecPayload = () => {
    const sections: { type: string; rows: string[][] }[] = []
    // EMI — F is the default when neither rev is picked; G only when picked.
    const includeF = emi.revF || (!emi.revF && !emi.revG)
    const includeG = emi.revG
    const emiKeys = new Set(Object.entries(emi.tests || {}).filter(([, v]) => v).map(([k]) => k))
    const rowsForRev = (defs: any[]) => defs.filter((r) => emiKeys.has(r.key)).map((r) => {
      let desc = r.desc
      if (r.positions && r.positions.length > 0) desc = desc + '\n' + r.positions.map((p: any) => '  ' + p.range + ': ' + p.pos).join('\n')
      return [r.key, r.label, desc]
    })
    if (includeF && emiKeys.size > 0) { const f = rowsForRev(getEmi461fTestDefinitions(emi, ti, setup)); if (f.length > 0) sections.push({ type: 'EMI', rows: f }) }
    if (includeG && emiKeys.size > 0) { const g = rowsForRev(getEmi461gTestDefinitions(emi, ti, setup)); if (g.length > 0) sections.push({ type: 'EMI', rows: g }) }
    // PQ — 300B keys start with "B"; strip it for display. Both share pq.rows.
    const pqKeys = new Set(Object.entries(pq.rows || {}).filter(([, v]) => v).map(([k]) => k))
    if (pqKeys.size > 0) {
      const pqRowsFromDefs = (defs: any[]) => defs.filter((r) => pqKeys.has(r.key)).map((r) => {
        const parts: string[] = []
        if (r.req) parts.push(r.req)
        if (r.ref) parts.push('Tables / Figures: ' + r.ref)
        const displayKey = r.key.startsWith('B') ? r.key.slice(1) : r.key
        return [displayKey, r.label, parts.join('\n')]
      })
      const b3 = pqRowsFromDefs(getPq300bTestDefinitions()); if (b3.length > 0) sections.push({ type: 'Power Quality', rows: b3 })
      const p1 = pqRowsFromDefs(getPq300p1TestDefinitions()); if (p1.length > 0) sections.push({ type: 'Power Quality', rows: p1 })
    }
    // DC Magnetics — fixed test set, gated by the "include" checkbox.
    if (dcm.include) sections.push({ type: 'DC Magnetics', rows: [['DC Magnetics', 'DOD-STD-1399 Section 070', 'Field Strength: 1,600 A/m. Positions: Three (3) orthogonal positions.']] })
    return { quote: qi?.opp || '', sections }
  }

  const openSpec = (mode: '' | 'from-quote') => {
    const q = encodeURIComponent(qi?.opp || '')
    const params = [q ? `quote=${q}` : '', mode ? `mode=${mode}` : ''].filter(Boolean).join('&')
    window.open(params ? `${SPEC_URL}?${params}` : SPEC_URL, '_blank', 'noopener,noreferrer')
  }
  const openClassicSpecBuilder = () => openSpec('')
  const openSpecFromQuote = () => {
    try { localStorage.setItem('nuforce_spec_builder_payload', JSON.stringify(buildSpecPayload())) } catch (e) { console.warn('spec payload write failed', e) }
    openSpec('from-quote')
  }

  const { drill, fab } = drillFab(su)
  // vibSetup (the Vibration fixture setup) is shared with the Shock tab's
  // "moving from Vibration" discount, so it stays computed in the parent.
  const vibSetup = smartSetup(vib.std, su)

  // Hand the suggested items (catalog key + price) to the Product Picker, which
  // pre-checks the matching line items. Value copies only — no live link back.
  const sendItems = (items: CalcSelection[]) => {
    const valid = items.filter((i) => i.price > 0)
    if (valid.length) onSend(valid)
  }

  // Close only when the press STARTS and ENDS on the backdrop itself. Without this,
  // dragging to select text inside an input and releasing over the backdrop fires a
  // click on the backdrop and wrongly closes the calculator.
  const downOnBackdrop = useRef(false)
  return (
    <>
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,30,45,0.45)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', width: 'min(480px, 96vw)', height: '100%', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 3 }}>
          <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 'var(--fs-md)' }}>Pricing Calculator</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setSpecMenuOpen((v) => !v)} title="Open the Test Spec Builder — choose a source" style={specTriggerBtn}>Spec Builder</button>
              {specMenuOpen && (
                <>
                  <div onClick={() => setSpecMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 230, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', zIndex: 6, overflow: 'hidden' }}>
                    <button onClick={() => { setSpecMenuOpen(false); openClassicSpecBuilder() }} title="Open a blank Test Spec Builder in a new tab" style={menuItemStyle}>Classic Spec Builder</button>
                    <button onClick={() => { setSpecMenuOpen(false); openSpecFromQuote() }} title="Pre-fill from this quote's calculator selections" style={{ ...menuItemStyle, borderTop: '1px solid var(--border)' }}>Spec Builder from NUForce</button>
                  </div>
                </>
              )}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: 'var(--sp-4) var(--sp-5)', flex: 1 }}>
          {/* Shared setup inputs */}
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div style={sectionLabel}>Setup details <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--dim)' }}>· shared with the quote</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-3)' }}>
              <Labeled label="Tech rate ($/hr)"><input value={setup?.techRate ?? ''} onChange={(e) => onSetupChange({ techRate: e.target.value })} inputMode="decimal" style={input} /></Labeled>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Fab hours
                  <button onClick={() => setFabGuideOpen(true)} title="Estimated fab times per test" aria-label="Fab hours cheat sheet" style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: '50%', width: 16, height: 16, padding: 0, cursor: 'pointer', fontSize: 10, color: 'var(--muted)', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
                </div>
                <input value={setup?.fabHours ?? ''} onChange={(e) => onSetupChange({ fabHours: e.target.value })} inputMode="decimal" style={input} />
              </div>
              <Labeled label="Holes"><input value={setup?.holes ?? ''} onChange={(e) => onSetupChange({ holes: e.target.value })} inputMode="decimal" style={input} /></Labeled>
              <Labeled label="Drill & tap">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!setup?.drillTap} onChange={(e) => onSetupChange({ drillTap: e.target.checked })} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{setup?.drillTap ? '×1.5' : 'off'}</span>
                </label>
              </Labeled>
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
              Drill {money(Math.round(drill))} · Fab {money(Math.round(fab))} added to every setup
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {TABS.map((t) => {
              const hasCrr = (t.key === 'emi' && emiHasCrr) || (t.key === 'pq' && pqHasCrr) || (t.key === 'dcm' && dcmHasCrr)
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{ ...tabBtn, ...(tab === t.key ? tabBtnOn : null), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {t.label}
                  {hasCrr && <span title="CRR workup available" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>

          {tab === 'vib' && <VibTab vib={vib} setVib={setVib} su={su} sendItems={sendItems} />}
          {tab === 'shock' && <ShockTab shock={shock} setShock={setShock} su={su} vibSetup={vibSetup} sendItems={sendItems} />}
          {tab === 'noise' && <NoiseTab noise={noise} setNoise={setNoise} ti={ti} sendItems={sendItems} onAddBudget={onAddBudget} />}
          {tab === 'env' && <EnvTab env={env} setEnv={setEnv} su={su} sendItems={sendItems} />}
          {tab === 'hfv' && <HfvTab hfv={hfv} setHfv={setHfv} su={su} sendItems={sendItems} />}
          {tab === 'sho' && <ShoTab sho={sho} setSho={setSho} su={su} sendItems={sendItems} />}
          {tab === 'ab' && <StdTestTab state={ab} setState={setAb} su={su} sendItems={sendItems} name="Airborne Noise" keyPrefix="ab" />}
          {tab === 'sb' && <StdTestTab state={sb} setState={setSb} su={su} sendItems={sendItems} name="Structureborne Noise" keyPrefix="sb" />}
          {tab === 'instr' && <InstrTab instr={instr} setInstr={setInstr} sendItems={sendItems} />}
          {tab === 'emi' && <EmiTab emi={emi} setEmi={setEmi} emiOpen={emiOpen} setEmiOpen={setEmiOpen} emiBudget={emiBudget} setEmiBudget={setEmiBudget} ti={ti} setup={setup} onSetupChange={onSetupChange} onAddBudget={onAddBudget} onOpenQuestions={() => setEmiQOpen(true)} sendItems={sendItems} crrWorkup={crrWorkup} />}
          {tab === 'pq' && <PqTab pq={pq} setPq={setPq} pqExpand={pqExpand} setPqExpand={setPqExpand} ti={ti} sendItems={sendItems} crrWorkup={crrWorkup} />}
          {tab === 'dcm' && <DcmTab dcm={dcm} setDcm={setDcm} sendItems={sendItems} crrWorkup={crrWorkup} />}
          {tab === 'ot' && <OtTab otRates={otRates} setOtRates={setOtRates} otRows={otRows} setOtRows={setOtRows} onSendCustom={onSendCustom} />}

          <div style={{ marginTop: 'var(--sp-5)', fontSize: 'var(--fs-sm)', color: 'var(--muted)', fontStyle: 'italic' }}>
            Suggested prices only — nothing is added to the quote until you press “Add to quote”, and it isn’t stored until you Save the quote.
          </div>
        </div>
      </div>
    </div>
    {fabGuideOpen && <FabGuide onClose={() => setFabGuideOpen(false)} />}
    {emiQOpen && <EmiCustomerQuestions onClose={() => setEmiQOpen(false)} />}
    </>
  )
}
