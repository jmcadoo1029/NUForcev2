// Pricing Calculator math — the "suggested pricing" helpers ported from Classic's
// PricingCalculator component (NOT Advanced Mode / calcSummary). These produce
// suggested numbers only; nothing here writes to a quote. Shared so the
// calculator and the Product Picker can't drift.

import { sf } from '../lib/format'
import { TH_PRICES } from './catalog'

export interface SetupInputs {
  techRate: number
  fabHours: number
  holes: number
  drillTap: boolean
}

export const SETUP_DEFAULTS: SetupInputs = { techRate: 175, fabHours: 4, holes: 0, drillTap: false }

// Round to the nearest $25 (Classic's r25).
export const r25 = (n: number) => Math.round(n / 25) * 25

// Drill + fab labor from the shared setup inputs.
export function drillFab(su: SetupInputs) {
  const drill = su.holes * 0.5 * su.techRate * (su.drillTap ? 1.5 : 1)
  const fab = su.fabHours * su.techRate
  return { drill, fab }
}

// A section's suggested setup = its base + global drill + fab (Classic smartBase).
export function smartSetup(std: number | string, su: SetupInputs) {
  const { drill, fab } = drillFab(su)
  return Math.round(sf(std) + drill + fab)
}

// Medium-weight shock testing, weight-based (Classic mwTesting, the quote table).
export const mwTesting = (wt: number) => (!wt || wt <= 0 ? 4575 : wt <= 2500 ? 4575 : wt <= 3500 ? 5575 : 6250)

// "Moving from Vibration" setup discounts (Classic mwDisc / lwDisc), applied to
// the Vibration setup when a shock reuses the same fixture.
export const mwDisc = (vs: number) => (vs <= 4000 ? 1000 : vs <= 5000 ? 1250 : vs <= 7000 ? 1500 : vs <= 9000 ? 1750 : 2000)
export const lwDisc = (vs: number) => (vs <= 2000 ? 500 : vs <= 3000 ? 750 : 1000)

// ── Noise ─────────────────────────────────────────────────────────────────
export const NOISE_BASE_30: Record<string, number> = { '<=140dB': 3950, '145dB': 4500, '150dB': 5250, '155dB': 5950, '160dB': 7450, '165dB': 8500, '170dB': 12500 }
export const NOISE_BASE_60: Record<string, number> = { '<=140dB': 4925, '145dB': 5750, '150dB': 6875, '155dB': 7925, '160dB': 9175, '165dB': 10750, '170dB': 15750 }
export const NOISE_CHAMBERS: Record<string, number> = { Speakerbox: 1000, '64 Reverb Chamber': 1500, '300 Reverb Chamber': 2000, 'Prog Wave Tube': 2750 }
export const NOISE_COMP_COST: Record<string, number> = { '<=140dB': 0, '145dB': 750, '150dB': 1500, '155dB': 2500, '160dB': 2500, '165dB': 3500, '170dB': 3500 }
export const NOISE_LEVELS = ['<=140dB', '145dB', '150dB', '155dB', '160dB', '165dB', '170dB']

// Noise testing price (Classic noiseTestingPrice): ≤30min → base30, ≤1hr →
// base60; multi-hour adds $500/hr for hrs 2–20, all overage at $375/hr once >20h,
// resetting a new base every 40 hrs. Compressor cost marked up 25%.
export function noiseTestingPrice(durVal: string, durUnit: string, level: string, compCost: number): number {
  const base30 = NOISE_BASE_30[level] || 0
  const base60 = NOISE_BASE_60[level] || 0
  const compUp = (compCost || 0) * 1.25
  const raw = parseFloat(durVal) || 0
  if (raw <= 0) return Math.round(base30 + compUp)
  const totalHrs = durUnit === 'hours' ? Math.ceil(raw) : raw <= 30 ? null : Math.ceil(raw / 60)
  if (totalHrs === null) return Math.round(base30 + compUp)
  if (totalHrs <= 1) return Math.round(base60 + compUp)
  const BLOCK = 40
  const fullBlocks = Math.floor((totalHrs - 1) / BLOCK)
  const remaining = totalHrs - fullBlocks * BLOCK
  const blockAdder = (h: number) => (h <= 1 ? 0 : h > 20 ? (h - 1) * 375 : (h - 1) * 500)
  return Math.round(base60 * (fullBlocks + 1) + blockAdder(remaining) + compUp)
}

// Compressor cost for a level (Prog Wave Tube always $3500).
export const noiseCompCost = (chamber: string, level: string) => (chamber === 'Prog Wave Tube' ? 3500 : NOISE_COMP_COST[level] || 0)

// Chamber fit check from the unit dimensions (Classic recommendation logic).
export function noiseChamberFit(dimL: number, dimW: number, dimH: number, level: string, chamber: string) {
  const cuIn = dimL * dimW * dimH
  const cuFt = cuIn / 1728
  const db = level === '<=140dB' ? 140 : parseInt(level) || 0
  const fitsSpkr = cuIn > 0 && cuIn <= 500 && db <= 145
  const fits64 = cuIn > 0 && cuFt <= 6.4
  const fits300 = cuIn > 0 && cuFt <= 30 && db <= 165
  const fitsPWT = cuIn > 0 && dimH <= 40 && dimW <= 40 && db <= 165
  const rec = cuIn > 0 ? (fitsSpkr ? 'Speakerbox' : fits64 ? '64 Reverb Chamber' : fits300 ? '300 Reverb Chamber' : 'Prog Wave Tube') : ''
  const ok = !cuIn || (chamber === 'Speakerbox' ? fitsSpkr : chamber === '64 Reverb Chamber' ? fits64 : chamber === '300 Reverb Chamber' ? fits300 : fitsPWT)
  return { rec, ok }
}

// ── HF Vibration ─────────────────────────────────────────────────────────
// $1225 flat ≤1hr, +$750/hr for hrs 1–3, +$525/hr beyond 3 (rounded to $25).
export function hfvTestingPrice(durMin: number): number {
  const hrs = (durMin || 30) / 60
  if (hrs <= 1) return 1225
  if (hrs <= 3) return Math.round((1225 + 750 * (hrs - 1)) / 25) * 25
  return Math.round((1225 + 750 * 2 + 525 * (hrs - 3)) / 25) * 25
}

// ── Environmental ──────────────────────────────────────────────────────────
export const ALT_DWELL_PRICES: Record<string, number> = { '1-30 min': 1000, '31-60 min': 1500, '1-2 hr': 2275 }
export const ENV_TYPES = ['Temperature & Humidity', 'Temperature Only', 'Humidity Only', 'Altitude', 'Salt Fog', 'ESS', 'Rapid Decompression', 'Explosive Decompression', 'Acceleration', 'Inclination', 'Drip Test', 'Submergence', 'Spray Test', 'Insulation Resistance']

// Per-type base setup/testing (null = computed: testing from duration/dwell, or
// setup from fab+drill). Ported from Classic ENV_BASE_PRICING.
const ENV_BASE: Record<string, { setup: number | null; testing: number | null }> = {
  th: { setup: 500, testing: null }, sf: { setup: 0, testing: 1750 }, alt: { setup: 500, testing: null },
  ess: { setup: 0, testing: 1000 }, acc: { setup: null, testing: 1950 }, incl: { setup: null, testing: 1750 },
  rd: { setup: 1000, testing: 2275 }, ed: { setup: 1250, testing: 2450 }, drip: { setup: null, testing: 1250 },
  sub: { setup: 750, testing: 1250 }, spray: { setup: null, testing: 1500 }, insres: { setup: 0, testing: 500 },
}
const ENV_TYPE_KEY: Record<string, string> = {
  'Temperature & Humidity': 'th', 'Temperature Only': 'th', 'Humidity Only': 'th', Altitude: 'alt', 'Salt Fog': 'sf',
  ESS: 'ess', 'Rapid Decompression': 'rd', 'Explosive Decompression': 'ed', Acceleration: 'acc', Inclination: 'incl',
  'Drip Test': 'drip', Submergence: 'sub', 'Spray Test': 'spray', 'Insulation Resistance': 'insres',
}
// The catalog line-item keys each env type maps to (for "add to quote").
export const ENV_TYPE_CATALOG: Record<string, { setup?: string; test: string }> = {
  'Temperature & Humidity': { setup: 'th_setup', test: 'th_test' }, 'Temperature Only': { setup: 'to_setup', test: 'to_test' }, 'Humidity Only': { setup: 'hu_setup', test: 'hu_test' },
  Altitude: { setup: 'alt_setup', test: 'alt_test' }, 'Salt Fog': { setup: 'sf_setup', test: 'sf_test' }, ESS: { setup: 'ess_setup', test: 'ess_test' },
  'Rapid Decompression': { setup: 'rd_setup', test: 'rd_test' }, 'Explosive Decompression': { setup: 'ed_setup', test: 'ed_test' }, Acceleration: { setup: 'acc_setup', test: 'acc_test' },
  Inclination: { setup: 'incl_setup', test: 'incl_test' }, 'Drip Test': { setup: 'drip_setup', test: 'drip_test' }, Submergence: { setup: 'sub_setup', test: 'sub_test' },
  'Spray Test': { setup: 'spray_setup', test: 'spray_test' }, 'Insulation Resistance': { test: 'insres' },
}

export interface EnvState { type: string; thDur: string; altDwell: string }

export function envPricing(env: EnvState, su: SetupInputs): { setup: number; testing: number } {
  const { drill, fab } = drillFab(su)
  const key = ENV_TYPE_KEY[env.type] || 'alt'
  const base = ENV_BASE[key] || { setup: 500, testing: 1000 }
  const isTH = key === 'th'
  const isAlt = key === 'alt'
  const fabDrillBase = env.type === 'Acceleration' ? 2000 : env.type === 'Inclination' ? 1250 : env.type === 'Drip Test' || env.type === 'Spray Test' ? 750 : null
  const setup = fabDrillBase != null ? Math.round(fabDrillBase + drill + fab) : base.setup ?? 0
  const testing = isTH ? TH_PRICES[env.thDur] || 1000 : isAlt ? ALT_DWELL_PRICES[env.altDwell] || 1000 : base.testing || 1000
  return { setup, testing }
}

// ── Shift-based (EMI / PQ / DCM) ─────────────────────────────────────────────
export const EMI_SR = 1600
export const PQ_SR = 1450
export const DCM_SR = 1600

export interface PqRow { key: string; label: string; sh: number; sh3p: number | null }
// MIL-STD-1399-300 Part 1 test list (Classic PQ_P1).
export const PQ_P1: PqRow[] = [
  { key: '5.3.1', label: 'Grounding (susceptibility) test', sh: 0.5, sh3p: null },
  { key: '5.3.2', label: 'User equipment power profile test', sh: 1.0, sh3p: null },
  { key: '5.3.3', label: 'Voltage and frequency maximum departure tolerance test', sh: 1.0, sh3p: null },
  { key: '5.3.4', label: 'Voltage and frequency transient tolerance and recovery test', sh: 1.0, sh3p: null },
  { key: '5.3.5', label: 'Voltage spike (susceptibility) test', sh: 1.5, sh3p: 2.0 },
  { key: '5.3.6', label: 'Emergency conditions (susceptibility) test', sh: 2.0, sh3p: null },
  { key: '5.3.7', label: 'Current waveform (emission) test', sh: 0.75, sh3p: 1.0 },
  { key: '5.3.8', label: 'Voltage and frequency modulation test', sh: 2.0, sh3p: null },
  { key: '5.3.9', label: 'Simulated human body impedance ground current test', sh: 0.75, sh3p: null },
  { key: '5.3.10.1', label: 'Equipment line-to-ground voltage test', sh: 0.5, sh3p: null },
  { key: '5.3.10.2', label: 'Equipment line-to-ground voltage test (AGD)', sh: 0.5, sh3p: null },
]
// MIL-STD-1399-300B test list (Classic PQ_300B).
export const PQ_300B: PqRow[] = [
  { key: 'B5.3.1', label: 'Voltage and frequency tolerance test', sh: 1.0, sh3p: null },
  { key: 'B5.3.2', label: 'Voltage and frequency transient tolerance and recovery test', sh: 1.0, sh3p: null },
  { key: 'B5.3.3', label: 'Voltage spike test', sh: 1.5, sh3p: 2.0 },
  { key: 'B5.3.4', label: 'Emergency condition test', sh: 2.0, sh3p: null },
  { key: 'B5.3.5', label: 'Grounding test', sh: 0.5, sh3p: null },
  { key: 'B5.3.6', label: 'User equipment power profile test', sh: 1.0, sh3p: null },
  { key: 'B5.3.7', label: 'Current waveform test', sh: 0.75, sh3p: 1.0 },
  { key: 'B5.3.8', label: 'Voltage and frequency modulation test', sh: 2.0, sh3p: null },
  { key: 'B5.3.9', label: 'Simulated human body leakage current test', sh: 0.75, sh3p: null },
  { key: 'B5.3.10.1', label: 'Equipment insulation resistance test', sh: 0.5, sh3p: null },
  { key: 'B5.3.10.2', label: 'Active ground detection test', sh: 0.5, sh3p: null },
]
// A PQ row's shift count — 3-phase override when present and the unit is 3-phase.
export const pqRowShifts = (r: PqRow, is3ph: boolean): number => (is3ph && r.sh3p != null ? r.sh3p : r.sh)

// ── Overtime ─────────────────────────────────────────────────────────────────
export interface OtRates { wkBase: number; wkRate: number; weBase: number; weRate: number }
export const OT_DEFAULTS: OtRates = { wkBase: 300, wkRate: 262.5, weBase: 825, weRate: 350 }
export function otRowTotal(type: string, techs: number, hours: number, rates: OtRates): number {
  const we = type === 'Weekend'
  return (we ? rates.weBase : rates.wkBase) + techs * hours * (we ? rates.weRate : rates.wkRate)
}

// ── Instrumentation ─────────────────────────────────────────────────────────
export const INSTR_ITEMS = [
  { key: 'shock', chKey: 'shockCh', catKey: 'shock_inst', label: 'Shock Instrumentation', price: 525 },
  { key: 'cmShock', chKey: 'cmShockCh', catKey: 'cm_shock', label: 'Contact Monitoring (Shock)', price: 350 },
  { key: 'vib', chKey: 'vibCh', catKey: 'vib_ch', label: 'Vib Additional Channels', price: 325 },
  { key: 'cmVib', chKey: 'cmVibCh', catKey: 'cm_vib', label: 'Contact Monitoring (Vibe)', price: 750 },
]
