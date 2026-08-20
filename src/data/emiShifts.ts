// EMI shift model — ported verbatim from Classic's calcEmiShifts. Given the unit
// dimensions (in inches → cm), cable count, phase count, and MIL-STD-461 revision
// (F vs G), it returns the billable shift count for each EMI test. Pure math; the
// EMI calculator tab turns these shifts into a suggested price. This is the load-
// bearing part, so it's kept 1:1 with Classic.

import { sf } from '../lib/format'

export const EMI_TESTS_F = ['CE101', 'CE102', 'CS101', 'CS106', 'CS114', 'CS116', 'RE101', 'RE102', 'RS101', 'RS103', 'RS105']
export const EMI_TESTS_G = ['CE101', 'CE102', 'CS101', 'CS109', 'CS114', 'CS115', 'CS116', 'RE101', 'RE102', 'RS101', 'RS103']

// Rev F and Rev G are independent (a quote can cover both) — the applicable test
// list is the union when both are on. This is why CS106/RS105 (F-only) reappear
// once Rev F is selected alongside G.
export function emiTestList(revF: boolean, revG: boolean): string[] {
  if (revF && revG) return [...new Set([...EMI_TESTS_F, ...EMI_TESTS_G])]
  if (revG && !revF) return EMI_TESTS_G
  return EMI_TESTS_F
}

// Platform + location (RE102 limits) options, from Classic's EmiForm.
export const EMI_PLATS = ['Surface Ships', 'Submarines']
export const EMI_LOCS_CAN = ['Below Deck', 'Below Deck Non-metallic', 'Subs Internal', 'Aircraft Fixed Wing Internal ≥25m', 'Ground Navy Fixed', 'Ground Air Force', 'Space System Internal']
export const EMI_LOCS_TBD = ['High-Gain Preamp (≥48 dB) — Feasibility TBD']
export const EMI_LOCS_CANT = ['Above Deck', 'Subs External', 'Aircraft Fixed Wing Internal <25m', 'Aircraft Fixed Wing External', 'Ground Navy Mobile', 'Ground Army']

export interface EmiFlagCtx {
  amps: number
  hz: number
  isDC: boolean
  isSub: boolean
  locs: Record<string, boolean>
}
export interface EmiFlags {
  disabled: boolean // not selectable (CS109 always; RE102 when the location is subcontract-only)
  reason: string // why it's disabled
  warnings: string[] // advisory notes
}

// Per-test applicability flags (grey/disable + advisory warnings), ported from
// Classic's getTestFlags. Driven by amps, operating frequency, DC power, platform
// (submarine), and location. Locations gate RE102; nothing changes the shift math.
export function emiTestFlags(test: string, revF: boolean, revG: boolean, ctx: EmiFlagCtx): EmiFlags {
  const { amps, hz, isDC, isSub, locs } = ctx
  const L = (k: string) => !!locs[k]
  const warnings: string[] = []
  let disabled = false
  let reason = ''

  if (test === 'CS109') {
    disabled = true
    reason = hz > 100000 ? 'CS109 does not apply for operating frequency >100 kHz.' : 'NU Labs does not perform CS109 — it must be subcontracted if the spec requires it.'
  }
  if (test === 'CS101') {
    if (revF && amps > 100) {
      disabled = true
      reason = 'CS101 generally does not apply for EUT currents >100 A/phase (Rev F).'
    } else if (revG && amps > 30 && hz > 150000) {
      disabled = true
      reason = 'CS101 does not apply for >30 A/phase when operating frequency >150 kHz (Rev G).'
    } else if (revG && amps > 30) {
      warnings.push('Rev G: CS101 applies for >30 A/phase only if operating frequency ≤150 kHz AND sensitivity better than 1 µV. Verify before including.')
    }
    if (amps > 18) warnings.push('Amplifier limit: transformer secondary current max ~23 A. Check feasibility if EUT current is near this limit.')
  }
  if (test === 'RS101') {
    if (hz > 100000) {
      disabled = true
      reason = 'RS101 does not apply for operating frequency >100 kHz.'
    } else {
      warnings.push('RS101 requires operating frequency ≤100 kHz AND sensitivity better than 1 µV. Verify with customer before including.')
    }
    if (isSub) warnings.push('Army curve is feasible but pushes our Crown 5002 amp to its limits. Navy curve is OK.')
  }
  if (test === 'RS103') {
    warnings.push('NU Labs RS103 capability is limited to 10 V/m (ships metallic below deck / subs internal). Max frequency 18 GHz.')
    if (L('Below Deck Non-metallic')) warnings.push('Ships non-metallic below deck (50/10 V/m) needs our rented 500 W amp for 2–30 MHz at 50 V/m — confirm availability or subcontract.')
    if (L('Above Deck')) warnings.push('Ships above deck / exposed below deck (50 V/m 2–30 MHz) needs a rented 500 W amp — subcontract or add rental cost.')
    if (L('Subs External') || L('Aircraft Fixed Wing External') || L('Ground Navy Mobile') || L('Ground Army')) warnings.push('Selected location may require field strengths >10 V/m — verify limits; subcontracting may be required.')
  }
  if (test === 'RE102') {
    const cant = EMI_LOCS_CANT.filter((k) => L(k))
    const can = EMI_LOCS_CAN.some((k) => L(k)) || L('High-Gain Preamp (≥48 dB) — Feasibility TBD')
    if (cant.length) {
      disabled = true
      reason = 'RE102 subcontract required for the selected location(s): ' + cant.join(', ') + '.'
    }
    if (L('Aircraft Fixed Wing Internal ≥25m')) warnings.push('Aircraft internal ≥25 m: NU can perform in-house — verify nose-to-tail length before quoting.')
    if (L('Space System Internal')) warnings.push('Space System Internal: may be doable — verify limits with production before committing.')
    if (L('High-Gain Preamp (≥48 dB) — Feasibility TBD')) warnings.push('High-gain preamp (≥48 dB) may extend RE102 for some limits — feasibility not yet confirmed.')
    if (!can && !cant.length) warnings.push('No location selected — verify RE102 applicability and limits with customer.')
  }
  if (test === 'RE101' && hz > 100000) warnings.push('RE101 applicability should be verified for operating frequency >100 kHz.')
  if (isDC && ['CS101', 'CS106', 'CS114', 'CS115', 'CS116'].includes(test)) warnings.push('EUT is DC powered — this test still applies but limits may differ. Confirm the applicable figure with customer.')

  return { disabled, reason, warnings }
}

// Human labels for the EMI tests.
export const EMI_TEST_LABELS: Record<string, string> = {
  CE101: 'CE101 — Conducted Emissions, power leads (30 Hz–10 kHz)',
  CE102: 'CE102 — Conducted Emissions, power leads (10 kHz–10 MHz)',
  CS101: 'CS101 — Conducted Susceptibility, power leads',
  CS106: 'CS106 — Conducted Susceptibility, transients (461F)',
  CS109: 'CS109 — Structure current (subcontract)',
  CS114: 'CS114 — Conducted Susceptibility, bulk cable injection',
  CS115: 'CS115 — Conducted Susceptibility, impulse excitation (461G)',
  CS116: 'CS116 — Conducted Susceptibility, damped sinusoidal transients',
  RE101: 'RE101 — Radiated Emissions, magnetic field',
  RE102: 'RE102 — Radiated Emissions, electric field (10 kHz–18 GHz)',
  RS101: 'RS101 — Radiated Susceptibility, magnetic field',
  RS103: 'RS103 — Radiated Susceptibility, electric field (2 MHz–18 GHz)',
  RS105: 'RS105 — Radiated Susceptibility, transient EM field',
}

export interface EmiCalcInput {
  dimL?: string | number
  dimW?: string | number
  dimH?: string | number
  cables?: string | number // EMI-instance cable count (overrides setup when > 0)
  setupCables?: string | number // Setup Details cable count (fallback)
  phases?: string | number
  revs?: Record<string, boolean>
}
export interface EmiShift {
  raw: number
  rounded: number
  // Extra detail used by the Test Specification PDF (not used by pricing):
  sigTests?: number // signal-lead tests (= cable count)
  pwrTests?: number // power-lead tests
  totalTests?: number // sig + pwr
  pos?: Record<string, number> // per-band / per-face position counts
}

export function calcEmiShifts(s: EmiCalcInput): Record<string, EmiShift> {
  const L = sf(s.dimL) * 2.54,
    W = sf(s.dimW) * 2.54,
    H = sf(s.dimH) * 2.54
  const emiCables = sf(s.cables, 0)
  const setupCables = sf(s.setupCables, 0)
  const cables = Math.max(1, emiCables > 0 ? emiCables : setupCables)
  const phases = Math.max(1, sf(s.phases || 3, 3))
  const ru = (x: number) => (x > 0 ? Math.ceil(x) : 0)
  const rp = (x: number) => Math.max(1, Math.ceil(x)) // round up, min 1 position
  const useG = (s.revs || {})['Rev G'] || false // G wins when both checked
  const res: Record<string, EmiShift> = {}

  // CE101 / CE102 — rev × phase lookup (F: 1φ=4hr,3φ=6hr / G: 1φ=6hr,3φ=8hr)
  const ce_F: Record<number, number> = { 1: 4, 3: 6 }
  const ce_G: Record<number, number> = { 1: 6, 3: 8 }
  const ceHrs = (useG ? ce_G : ce_F)[phases] || (useG ? ce_G[3] : ce_F[3])
  const ce = ceHrs / 8
  res.CE101 = { raw: ce, rounded: ru(ce) }
  res.CE102 = { raw: ce, rounded: ru(ce) }

  // CS101 — flat 6 hr
  const cs101 = 6 / 8
  res.CS101 = { raw: cs101, rounded: ru(cs101) }

  // CS106 — 461F only; 1φ=4hr, 3φ=3hr
  const cs106 = (phases === 1 ? 4 : 3) / 8
  res.CS106 = { raw: cs106, rounded: ru(cs106) }

  // CS114 — rev-aware setup/cal + throughput 3 tests/day (signal cables + power tests)
  const cs114PwrTests = phases === 1 ? (useG ? 3 : 2) : useG ? 4 : 3
  const cs114Setup = (useG ? 15 : 9) / 8
  const cs114TotalTests = cables + cs114PwrTests
  const cs114TestShifts = cs114TotalTests > 0 ? Math.ceil(cs114TotalTests / 3) : 0
  const cs114 = cs114Setup + cs114TestShifts
  res.CS114 = { raw: cs114, rounded: ru(cs114), sigTests: cables, pwrTests: cs114PwrTests, totalTests: cs114TotalTests }

  // CS109 — not performed at NU Labs; subcontract only, no shift cost
  res.CS109 = { raw: 0, rounded: 0 }

  // CS115 — same test count as CS114, 5 min/test, 0.5 shift setup
  const cs115Total = cables + cs114PwrTests
  const cs115 = 0.5 + (5 * cs115Total) / 60 / 8
  res.CS115 = { raw: cs115, rounded: ru(cs115), sigTests: cables, pwrTests: cs114PwrTests, totalTests: cs115Total }

  // CS116 — rev-aware power tests, throughput 4 tests/day
  const cs116PwrTests = phases === 1 ? (useG ? 3 : 2) : useG ? 4 : 3
  const cs116Setup = 3.5 / 8
  const cs116TotalTests = cables + cs116PwrTests
  const cs116TestShifts = cs116TotalTests > 0 ? Math.ceil(cs116TotalTests / 4) : 0
  const cs116 = cs116Setup + cs116TestShifts
  res.CS116 = { raw: cs116, rounded: ru(cs116), sigTests: cables, pwrTests: cs116PwrTests, totalTests: cs116TotalTests }

  // RE101 — 6 sides × 2 positions + 1 per cable, 60 min cal + 15 min/pos, floor 1.5 shifts
  const re101Pos = 12 + cables
  const re101Raw = Math.max(1.5, (1 + (15 * re101Pos) / 60) / 8)
  res.RE101 = { raw: re101Raw, rounded: ru(re101Raw) }

  // RE102 — width-only (F) or width×height (G) positions above 200 MHz; rev-specific sweep times
  const re102Pos = {
    b10k_30M: 1,
    b30_200M: 1,
    sub1GHz: useG ? rp(W / 50) * rp(H / 50) : rp(W / 50),
    b1_4: useG ? rp((W + 7) / 93) * rp((H + 7) / 93) : rp((W + 7) / 93),
    b4_15: useG ? rp((W + 7) / 52) * rp((H + 7) / 52) : rp((W + 7) / 52),
    b15_18: useG ? rp((W + 7) / 14) * rp((H + 7) / 14) : rp((W + 7) / 14),
  }
  const re102Times = useG
    ? { b10k_30M: 3, b30_200M: 130 / 60, sub1GHz: 340 / 60, b1_4: 307 / 60, b4_15: 307 / 60, b15_18: 55 / 60 }
    : { b10k_30M: 4, b30_200M: 5, sub1GHz: 12, b1_4: 6, b4_15: 15.5, b15_18: 3.5 }
  const sweepHigh = useG ? 2 : 1
  const re102 =
    1.5 +
    (re102Pos.b10k_30M * re102Times.b10k_30M * 1) / 60 / 8 +
    (re102Pos.b30_200M * re102Times.b30_200M * sweepHigh) / 60 / 8 +
    (re102Pos.sub1GHz * re102Times.sub1GHz * sweepHigh) / 60 / 8 +
    (re102Pos.b1_4 * re102Times.b1_4 * sweepHigh) / 60 / 8 +
    (re102Pos.b4_15 * re102Times.b4_15 * sweepHigh) / 60 / 8 +
    (re102Pos.b15_18 * re102Times.b15_18 * sweepHigh) / 60 / 8
  res.RE102 = { raw: re102, rounded: ru(re102), pos: re102Pos }

  // RS101 — face-area positions + 1 per cable, 22 min/pos (×0.7 if any dim > 30 cm), 3 hr setup
  const rs101LW = Math.max(1, Math.ceil((L * W) / 900)) * 2
  const rs101LH = Math.max(1, Math.ceil((L * H) / 900)) * 2
  const rs101WH = Math.max(1, Math.ceil((W * H) / 900)) * 2
  const facePos = rs101LW + rs101LH + rs101WH
  const rs101Mult = L > 30 || W > 30 || H > 30 ? 0.7 : 1.0
  const rs101 = 3 / 8 + (facePos * 22 * rs101Mult) / 60 / 8 + (cables * 22 * rs101Mult) / 60 / 8
  res.RS101 = { raw: rs101, rounded: ru(rs101), pos: { LW: rs101LW, LH: rs101LH, WH: rs101WH, cables, total: facePos + cables } }

  // RS103 — per-band positions from L/W, per-position times, 3.0-shift setup baseline
  const rs103Pos = {
    b2_30: Math.max(2, rp((200 + W) / 188)),
    b30_200: 1,
    b200_1G: rp(L / 89.5) + rp(W / 89.5),
    b1_4: rp(L / 93) + rp(W / 93),
    b4_15: rp(L / 52) + rp(W / 52),
    b15_18: rp(L / 14) + rp(W / 14),
  }
  const rs103 =
    3.0 +
    (rs103Pos.b2_30 * 16) / 60 / 8 +
    (rs103Pos.b30_200 * 25) / 60 / 8 +
    (rs103Pos.b200_1G * 21) / 60 / 8 +
    (rs103Pos.b1_4 * 32) / 60 / 8 +
    (rs103Pos.b4_15 * 30) / 60 / 8 +
    (rs103Pos.b15_18 * 12) / 60 / 8
  res.RS103 = { raw: rs103, rounded: ru(rs103), pos: rs103Pos }

  // RS105 — fixed 1.5 shifts
  res.RS105 = { raw: 1.5, rounded: 1.5 }

  return res
}
