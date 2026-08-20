// EMI test-specification definitions (MIL-STD-461 Rev F / Rev G), ported verbatim
// from Classic. Produces the per-test label / description / positions / note used
// by the EMI Test Specification PDFs. Descriptions interpolate test counts and
// position tallies from calcEmiShifts, and location-specific wording from the
// EMI_TEXT_LOOKUP table.

import { calcEmiShifts } from './emiShifts'

const OUT_OF_HOUSE = '__OUTSOURCE__'

type LookupEntry = string | { fig?: string; limit?: string; text?: string; ref?: string }
type RevMap = Record<string, LookupEntry>

const EMI_TEXT_LOOKUP: Record<string, { F: RevMap; G: RevMap }> = {
  RE102: {
    F: {
      'Below Deck': { fig: 'Figure RE102-1', limit: 'Metallic Ships below deck' },
      'Below Deck Non-metallic': { fig: 'Figure RE102-1', limit: 'Non-metallic Ships below deck' },
      'Subs Internal': { fig: 'Figure RE102-2', limit: 'Submarine internal' },
      'Ground Navy Fixed': { fig: 'Figure RE102-4', limit: 'Ground Navy Fixed' },
      'Ground Air Force': { fig: 'Figure RE102-4', limit: 'Ground Air Force' },
      'Aircraft Fixed Wing Internal ≥25m': { fig: 'Figure RE102-3', limit: 'Aircraft Internal' },
      'Space System Internal': { fig: 'Figure RE102-3', limit: 'Space System Internal' },
      'Above Deck': OUT_OF_HOUSE,
      'Subs External': OUT_OF_HOUSE,
      'Aircraft Fixed Wing Internal <25m': OUT_OF_HOUSE,
      'Aircraft Fixed Wing External': OUT_OF_HOUSE,
      'Ground Navy Mobile': OUT_OF_HOUSE,
      'Ground Army': OUT_OF_HOUSE,
    },
    G: {
      'Below Deck': { fig: 'Figure RE102-1', limit: 'Metallic Ships below deck' },
      'Below Deck Non-metallic': { fig: 'Figure RE102-1', limit: 'Non-metallic Ships below deck' },
      'Subs Internal': { fig: 'Figure RE102-2', limit: 'Submarine internal' },
      'Ground Navy Fixed': { fig: 'Figure RE102-4', limit: 'Ground Navy Fixed' },
      'Ground Air Force': { fig: 'Figure RE102-4', limit: 'Ground Air Force' },
      'Aircraft Fixed Wing Internal ≥25m': { fig: 'Figure RE102-3', limit: 'Aircraft Internal' },
      'Space System Internal': { fig: 'Figure RE102-3', limit: 'Space System Internal' },
      'Above Deck': OUT_OF_HOUSE,
      'Subs External': OUT_OF_HOUSE,
      'Aircraft Fixed Wing Internal <25m': OUT_OF_HOUSE,
      'Aircraft Fixed Wing External': OUT_OF_HOUSE,
      'Ground Navy Mobile': OUT_OF_HOUSE,
      'Ground Army': OUT_OF_HOUSE,
    },
  },
  RS103: {
    F: {
      'Below Deck': { ref: 'Table VII', limit: '10 V/m', text: 'Tested to MIL-STD-461F Table VII for Ships Metallic Below Deck from 2 MHz to 18 GHz at 10 V/m.' },
      'Below Deck Non-metallic': { ref: 'Table VII', limit: '50/10 V/m', text: 'Tested to MIL-STD-461F Table VII for Ships Non-metallic Below Deck from 2 MHz to 18 GHz at 50 V/m (2-30 MHz), 10 V/m (30 MHz-18 GHz).' },
      'Subs Internal': { ref: 'Table VII', limit: '5/10 V/m', text: 'Tested to MIL-STD-461F Table VII for Submarine Internal from 2 MHz to 18 GHz at 5 V/m (2-30 MHz), 10 V/m (30 MHz-18 GHz).' },
      'Above Deck': OUT_OF_HOUSE,
      'Subs External': OUT_OF_HOUSE,
      'Aircraft Fixed Wing Internal ≥25m': OUT_OF_HOUSE,
      'Aircraft Fixed Wing Internal <25m': OUT_OF_HOUSE,
      'Aircraft Fixed Wing External': OUT_OF_HOUSE,
      'Ground Navy Fixed': OUT_OF_HOUSE,
      'Ground Navy Mobile': OUT_OF_HOUSE,
      'Ground Army': OUT_OF_HOUSE,
      'Ground Air Force': OUT_OF_HOUSE,
      'Space System Internal': OUT_OF_HOUSE,
    },
    G: {
      'Below Deck': { ref: 'Table XI', limit: '10 V/m', text: 'Tested to MIL-STD-461G Table XI for Ships Metallic Below Deck from 2 MHz to 18 GHz at 10 V/m.' },
      'Below Deck Non-metallic': { ref: 'Table XI', limit: '50/10 V/m', text: 'Tested to MIL-STD-461G Table XI for Ships Non-metallic Below Deck from 2 MHz to 18 GHz at 50 V/m (2-30 MHz), 10 V/m (30 MHz-18 GHz).' },
      'Subs Internal': { ref: 'Table XI', limit: '5/10 V/m', text: 'Tested to MIL-STD-461G Table XI for Submarine Internal from 2 MHz to 18 GHz at 5 V/m (2-30 MHz), 10 V/m (30 MHz-18 GHz).' },
      'Above Deck': OUT_OF_HOUSE,
      'Subs External': OUT_OF_HOUSE,
      'Aircraft Fixed Wing Internal ≥25m': OUT_OF_HOUSE,
      'Aircraft Fixed Wing Internal <25m': OUT_OF_HOUSE,
      'Aircraft Fixed Wing External': OUT_OF_HOUSE,
      'Ground Navy Fixed': OUT_OF_HOUSE,
      'Ground Navy Mobile': OUT_OF_HOUSE,
      'Ground Army': OUT_OF_HOUSE,
      'Ground Air Force': OUT_OF_HOUSE,
      'Space System Internal': OUT_OF_HOUSE,
    },
  },
  CE101: { F: {}, G: {} },
  CE102: {
    F: { ALL: { text: 'Tested on each AC (or DC) power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation.' } },
    G: { ALL: { text: 'Tested on each AC (or DC) power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation.' } },
  },
  CS101: {
    F: { ALL: { text: 'Tested on each AC (or DC) high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS101-1, Curve 1 and Figure CS101-2.' } },
    G: { ALL: { text: 'Tested on each AC (or DC) high side for a total of one (1) test. Tested to MIL-STD-461G Figure CS101-1, Curve 1 and Figure CS101-2.' } },
  },
  CS115: {
    F: { ALL: { text: 'Bulk injection on the AC power input and on the high side individually. Tested to MIL-STD-461F Figure CS115-1.' } },
    G: { ALL: { text: 'Bulk injection on the AC power input and on the high side individually. Tested to MIL-STD-461G Figure CS115-1.' } },
  },
  CS116: {
    F: { ALL: { text: 'Bulk injection on the AC power input lead and on each lead individually. Tested to MIL-STD-461F Figure CS116-2 at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.' } },
    G: { ALL: { text: 'Bulk injection on the AC power input lead and on each lead individually. Tested to MIL-STD-461G Figure CS116-2 at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.' } },
  },
  RE101: {
    F: { ALL: { text: 'Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RE101-2 (Navy) or RE101-1 (Army) from 30 Hz to 100 kHz.' } },
    G: { ALL: { text: 'Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RE101-2 (Navy) or RE101-1 (Army) from 30 Hz to 100 kHz.' } },
  },
  RS101: {
    F: { ALL: { text: 'Applicable to all equipment enclosures including electrical cable interfaces. Applicability depends on application. Tested to MIL-STD-461F Figure RS101-1 (Navy) or RS101-2 (Army) from 30 Hz to 100 kHz.' } },
    G: { ALL: { text: 'Applicable to all equipment enclosures including electrical cable interfaces. Applicability depends on application. Tested to MIL-STD-461G Figure RS101-1 (Navy) or RS101-2 (Army) from 30 Hz to 100 kHz.' } },
  },
}

function getEmiTestText(testKey: string, rev: 'F' | 'G', locsObj: Record<string, boolean> | undefined): string | null {
  const table = EMI_TEXT_LOOKUP[testKey]
  if (!table) return null
  const revMap = table[rev]
  if (!revMap) return null
  if (revMap.ALL) return (revMap.ALL as any).text || null
  const entries: string[] = []
  Object.entries(locsObj || {}).forEach(([locKey, isSelected]) => {
    if (!isSelected) return
    const entry = revMap[locKey]
    if (!entry || entry === OUT_OF_HOUSE) return
    if (typeof entry === 'string') { entries.push(entry); return }
    if (entry.text) { entries.push(entry.text); return }
    entries.push(`Tested to MIL-STD-461${rev} ${entry.fig} for ${entry.limit} applications.`)
  })
  if (entries.length === 0) return null
  return entries.join(' Additionally, ')
}

export interface EmiTestDef {
  key: string
  label: string
  desc: string
  note?: string | null
  positions?: { range: string; pos: string }[]
}

const posLabel = (n: number) => n + ' position' + (n !== 1 ? 's' : '')

export function getEmi461fTestDefinitions(activeEmi: any, ti: any, setup: any): EmiTestDef[] {
  const d = calcEmiShifts({
    dimL: activeEmi.dimL || ti?.dimL || '0',
    dimW: activeEmi.dimW || ti?.dimW || '0',
    dimH: activeEmi.dimH || ti?.dimH || '0',
    cables: activeEmi.cables || '0',
    setupCables: setup?.cables || '0',
    phases: activeEmi.phases || ti?.phase || '3',
    revs: { 'Rev F': true },
  })
  const c114 = d.CS114, c116 = d.CS116, re102p = d.RE102.pos!, rs101p = d.RS101.pos!, rs103p = d.RS103.pos!
  const isDCquote = (ti?.pwrType || 'AC') === 'DC'
  const acdc = isDCquote ? 'DC' : 'AC'

  return [
    { key: 'CE101', label: 'Conducted Emissions, Power Leads, 30 Hz to 10 kHz', desc: 'Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE101-2 from 30 Hz to 10 kHz with a relaxation of the limit determined during testing.', note: null },
    { key: 'CE102', label: 'Conducted Emissions, Power Leads, 10 kHz to 10 MHz', desc: 'Tested on each ' + acdc + ' power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation.', note: null },
    { key: 'CS101', label: 'Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz', desc: 'Tested on each ' + acdc + ' high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS101-1 (Curve 1 or 2) and Figure CS101-2.', note: null },
    { key: 'CS106', label: 'Conducted Susceptibility, Transients, Power Leads', desc: isDCquote ? 'Tested on the DC high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS106-1. Testing performed with a test generator compliant with CS06. Tested in charged mode of operation only.' : 'Tested on each AC high side for a total of two (2) tests. Tested to MIL-STD-461F Figure CS106-1. Testing performed with a test generator compliant with CS06. Tested in charged mode of operation only.', note: 'The overshoot on this generator is slightly higher than specified in CS106 but test results are generally accepted as this is considered worst case.' },
    { key: 'CS114', label: 'Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and 4 kHz to 1 MHz at 77 dB uA', desc: 'Bulk injection on AC power input lead and on one lead individually. Common mode test on input leads for a total of ' + c114.pwrTests + ' tests for power leads. ' + c114.sigTests + ' test(s) on signal leads for a total of ' + c114.totalTests + ' tests. Tested to MIL-STD-461F Figure CS114-1, Curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB uA.', note: null },
    { key: 'CS116', label: 'Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads, 10 kHz to 100 MHz', desc: 'Bulk injection on AC power input lead and on each lead individually for a total of ' + c116.pwrTests + ' tests for power leads. ' + c116.sigTests + ' test(s) on signal leads for a total of ' + c116.totalTests + ' tests. Tested to MIL-STD-461F Figure CS116-2 at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.', note: null },
    { key: 'RE101', label: 'Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz', desc: getEmiTestText('RE101', 'F', activeEmi.locs) || 'Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RE101-2 (Navy) or RE101-1 (Army) from 30 Hz to 100 kHz.', note: null },
    {
      key: 'RE102', label: 'Radiated Emissions, Electric Field, 10 kHz to 18 GHz',
      desc: getEmiTestText('RE102', 'F', activeEmi.locs) || 'Tested to MIL-STD-461F Figure RE102-1 for Metallic Ships below deck applications.',
      positions: [
        { range: '10 kHz - 30 MHz', pos: posLabel(1) },
        { range: '30 MHz - 200 MHz', pos: posLabel(1) },
        { range: '200 MHz - 1 GHz', pos: posLabel(re102p.sub1GHz) },
        { range: '1 GHz - 4 GHz', pos: posLabel(re102p.b1_4) },
        { range: '4 GHz - 15 GHz', pos: posLabel(re102p.b4_15) },
        { range: '15 GHz - 18 GHz', pos: posLabel(re102p.b15_18) },
      ],
      note: 'Tested at width and cables only. Testing required to 10x the highest operating frequency or 1 GHz (whichever is greater), or if not known, to 18 GHz.',
    },
    { key: 'RS101', label: 'Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz', desc: 'Applicable to all equipment enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RS101-1 (Navy) or RS101-2 (Army) from 30 Hz to 100 kHz at approximately ' + rs101p.total + ' positions (' + rs101p.LW + ' LxW + ' + rs101p.LH + ' LxH + ' + rs101p.WH + ' WxH).', note: 'Applicability depends on application.' },
    {
      key: 'RS103', label: 'Radiated Susceptibility, Electric Field, 2 MHz to 18 GHz',
      desc: getEmiTestText('RS103', 'F', activeEmi.locs) || 'Tested to MIL-STD-461F Table VII for Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.',
      positions: [
        { range: '2 MHz - 30 MHz', pos: posLabel(rs103p.b2_30) },
        { range: '30 MHz - 200 MHz', pos: posLabel(rs103p.b30_200) },
        { range: '200 MHz - 1 GHz', pos: posLabel(rs103p.b200_1G) },
        { range: '1 GHz - 4 GHz', pos: posLabel(rs103p.b1_4) },
        { range: '4 GHz - 15 GHz', pos: posLabel(rs103p.b4_15) },
        { range: '15 GHz - 18 GHz', pos: posLabel(rs103p.b15_18) },
      ],
      note: null,
    },
  ]
}

export function getEmi461gTestDefinitions(activeEmi: any, ti: any, setup: any): EmiTestDef[] {
  const d = calcEmiShifts({
    dimL: activeEmi.dimL || ti?.dimL || '0',
    dimW: activeEmi.dimW || ti?.dimW || '0',
    dimH: activeEmi.dimH || ti?.dimH || '0',
    cables: activeEmi.cables || '0',
    setupCables: setup?.cables || '0',
    phases: activeEmi.phases || ti?.phase || '3',
    revs: { 'Rev G': true },
  })
  const c114 = d.CS114, c116 = d.CS116, re102p = d.RE102.pos!, rs101p = d.RS101.pos!, rs103p = d.RS103.pos!, cs115 = d.CS115
  const isDCquote = (ti?.pwrType || 'AC') === 'DC'
  const acdc = isDCquote ? 'DC' : 'AC'

  return [
    { key: 'CE101', label: 'Conducted Emissions, Audio Frequency Currents, Power Leads', desc: 'Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE101-2 from 120 Hz to 10 kHz with a relaxation of the limit determined during testing.', note: null },
    { key: 'CE102', label: 'Conducted Emissions, Radio Frequency Potentials, Power Leads', desc: 'Tested on each ' + acdc + ' power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE102-1 from 10 kHz to 10 MHz, basic curve relaxed by 6 dB.', note: null },
    { key: 'CS101', label: 'Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz', desc: 'Tested on the ' + acdc + ' high side for a total of one (1) test. Tested to MIL-STD-461G Figure CS101-1 (Curve 1 or 2) and Figure CS101-2 from 30 Hz to 150 kHz.', note: 'Exempt from testing for normal operating current >30 A per phase, or if >30 A per phase with sensitivity worse than 1 uV or operating frequency >150 kHz.' },
    { key: 'CS109', label: 'Conducted Susceptibility, Structure Current', desc: 'Tested to MIL-STD-461G CS109 requirements.', note: 'Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz.' },
    { key: 'CS114', label: 'Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and 4 kHz to 1 MHz at 77 dB uA', desc: 'Bulk injection on AC power input and on the high side of the AC input leads. Common mode test on input leads for a total of ' + c114.pwrTests + ' tests for power leads. ' + c114.sigTests + ' test(s) on signal leads for a total of ' + c114.totalTests + ' tests. Tested to MIL-STD-461G Figure CS114-1, Curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB uA.', note: null },
    { key: 'CS115', label: 'Conducted Susceptibility, Bulk Cable Injection, Impulse Excitation', desc: 'Bulk injection on AC power input and on the high side individually for a total of ' + cs115.pwrTests + ' tests for power leads. ' + cs115.sigTests + ' test(s) on signal leads for a total of ' + cs115.totalTests + ' tests. Tested to MIL-STD-461G Figure CS115-1 for one minute using 30 ns pulse at 5 amps, 30 Hz.', note: null },
    { key: 'CS116', label: 'Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads', desc: 'Bulk injection on AC power input and on the high side and return individually for a total of ' + c116.pwrTests + ' tests for power leads. ' + c116.sigTests + ' test(s) on signal leads for a total of ' + c116.totalTests + ' tests. Tested at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.', note: null },
    { key: 'RE101', label: 'Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz', desc: getEmiTestText('RE101', 'G', activeEmi.locs) || 'Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RE101-2 (Navy) or RE101-1 (Army) from 30 Hz to 100 kHz.', note: null },
    {
      key: 'RE102', label: 'Radiated Emissions, Electric Field, 10 kHz to 18 GHz',
      desc: getEmiTestText('RE102', 'G', activeEmi.locs) || 'Tested to MIL-STD-461G Figure RE102-1 for Metallic Ships below deck applications.',
      positions: [
        { range: '10 kHz - 30 MHz', pos: posLabel(1) },
        { range: '30 MHz - 200 MHz', pos: posLabel(1) },
        { range: '200 MHz - 1 GHz', pos: posLabel(re102p.sub1GHz) },
        { range: '1 GHz - 4 GHz', pos: posLabel(re102p.b1_4) },
        { range: '4 GHz - 15 GHz', pos: posLabel(re102p.b4_15) },
        { range: '15 GHz - 18 GHz', pos: posLabel(re102p.b15_18) },
      ],
      note: 'For 461G: tested in both horizontal and vertical polarizations. Testing required to 10x the highest operating frequency or 1 GHz (whichever is greater), or if not known, to 18 GHz.',
    },
    { key: 'RS101', label: 'Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz', desc: 'Applicable to all equipment enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RS101-1 (Navy) or RS101-2 (Army) from 30 Hz to 100 kHz at approximately ' + rs101p.total + ' positions (' + rs101p.LW + ' LxW + ' + rs101p.LH + ' LxH + ' + rs101p.WH + ' WxH).', note: 'Applicability depends on application. Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz.' },
    {
      key: 'RS103', label: 'Radiated Susceptibility, Electric Field, 2 MHz to 18 GHz',
      desc: getEmiTestText('RS103', 'G', activeEmi.locs) || 'Tested to MIL-STD-461G Table XI for Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.',
      positions: [
        { range: '2 MHz - 30 MHz', pos: posLabel(rs103p.b2_30) },
        { range: '30 MHz - 200 MHz', pos: posLabel(rs103p.b30_200) },
        { range: '200 MHz - 1 GHz', pos: posLabel(rs103p.b200_1G) },
        { range: '1 GHz - 4 GHz', pos: posLabel(rs103p.b1_4) },
        { range: '4 GHz - 15 GHz', pos: posLabel(rs103p.b4_15) },
        { range: '15 GHz - 18 GHz', pos: posLabel(rs103p.b15_18) },
      ],
      note: null,
    },
  ]
}
