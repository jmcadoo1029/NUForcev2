// Power Quality test-specification definitions (MIL-STD-1399-300B and 300 Part 1),
// ported verbatim from Classic. Static lists (no dynamic interpolation) of the
// per-test requirement / reference / note text used by the PQ spec PDFs.

export interface PqTestDef {
  key: string
  label: string
  req: string | null
  ref: string | null
  note: string | null
}

export function getPq300bTestDefinitions(): PqTestDef[] {
  return [
    { key: 'B5.3.1', label: 'Voltage and frequency tolerance test', req: 'Type 1 single phase (123/107) V ac, (62/57) Hz', ref: 'Table II for shipboard and submarine applications', note: null },
    { key: 'B5.3.2', label: 'Voltage and frequency transient tolerance and recovery test', req: '138 V ac / 63.3 Hz; 92 V ac / 56.7 Hz', ref: 'Table III', note: null },
    { key: 'B5.3.3', label: 'Voltage spike test', req: '900 to 1000 V peak line-to-line and line-to-ground, or 2400 to 2500 V peak line-to-line and line-to-ground', ref: 'Figure 23, 24 or 25', note: 'Voltage spike impulse wave shape using IEC 61000-4-5 1.2/50 uS open circuit waveform definition. Overshoot may exceed figure. Or voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixtures (MIL-DTL-16377 SSL).' },
    { key: 'B5.3.4', label: 'Emergency condition test', req: '70 ms dropout, 2 minute dropout; voltage and frequency decay characteristics for half-load curve; 67.2 Hz for 2 minutes / 155.25 V ac for 2 min', ref: 'Figure 8, Table VI', note: null },
    { key: 'B5.3.5', label: 'Grounding test', req: '100,000-ohm; each lead grounded individually for 5 minutes', ref: null, note: null },
    { key: 'B5.3.6', label: 'User equipment power profile test', req: 'User voltage and power characteristics per Section 5.3.6 a. through m. as required', ref: null, note: 'Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher. If inrush exceeds source capability the measurement cannot be made as desired. Will report what is measured and make a best effort attempt using facility power directly (5 attempts).' },
    { key: 'B5.3.7', label: 'Current waveform test', req: '120 Hz to 20 kHz, < 1 kVA limits as applicable', ref: null, note: 'Requirement met using MIL-STD-461F/G test method CE101 with frequency extended to 20 kHz. A non-regulated power source may be needed as regulated source switching produces inconsistent current waveform data. Not required for currents < 1 A per NAVSEA.' },
    { key: 'B5.3.8', label: 'Voltage and frequency modulation test', req: 'Frequency modulation 0.5%; voltage modulation 2%. Periods of 17 ms, 75 ms, 250 ms, 500 ms, 1 s, 5 s and 10 s each repeated ten consecutive times', ref: 'Table VII', note: null },
    { key: 'B5.3.9', label: 'Simulated human body leakage current test', req: '60 Hz to 700 Hz < 5 mA; 700 Hz to 100 kHz < 70 mA', ref: 'Figure 28, Figure 31', note: null },
    { key: 'B5.3.10.1', label: 'Equipment insulation resistance test', req: '500 V dc for 60 seconds; resistance to ground > 10 MOhm', ref: null, note: null },
    { key: 'B5.3.10.2', label: 'Active ground detection test', req: 'For 440 V rms EUT: AC source 622.2 V peak, DC source 505 VDC. For 115 V rms EUT: AC source 162.6 V peak, DC source 155 VDC.', ref: null, note: 'AGD is run on one line only per NAVSEA direction. Verify if legacy requirements apply.' },
  ]
}

export function getPq300p1TestDefinitions(): PqTestDef[] {
  return [
    { key: '5.3.1', label: 'Grounding (susceptibility) test', req: '100,000-ohm; each lead grounded individually for 5 minutes', ref: null, note: null },
    { key: '5.3.2', label: 'User equipment power profile test', req: 'User voltage and power characteristics per Section 5.3.2 a. through o. as required', ref: null, note: 'Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher. If inrush exceeds source capability the measurement cannot be made as desired. Will report what is measured and make a best effort attempt using facility power directly (5 attempts).' },
    { key: '5.3.3', label: 'Voltage and frequency maximum departure tolerance test', req: 'Type 1 single phase (127/104) VAC, (63/57) Hz or Type 1 single phase (484/396) VAC, (63/57) Hz', ref: 'Table III for shipboard and submarine applications. Tested for 30 minutes in four (4) modes after temperature stability.', note: null },
    { key: '5.3.4', label: 'Voltage and frequency transient tolerance and recovery test', req: '138 VAC / 63.3 Hz; 92 VAC / 56.7 Hz or 528 VAC / 63.3 Hz; 352 VAC / 56.7 Hz', ref: 'Table IV, duration 2 seconds', note: null },
    { key: '5.3.5', label: 'Voltage spike (susceptibility) test', req: '900 to 1000 V peak line-to-line and line-to-ground, or 2400 to 2500 V peak line-to-line and line-to-ground', ref: 'Figure 28, 29 or 30', note: 'Voltage spike impulse wave shape using IEC 61000-4-5 1.2/50 uS open circuit waveform definition. Overshoot may exceed figure. Or voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixtures (MIL-DTL-16377 SSL).' },
    { key: '5.3.6', label: 'Emergency conditions (susceptibility) test', req: '70 ms dropout, 2 minute dropout; voltage and frequency decay for half-load curve; 67.2 Hz for 2 min / 155.25 VAC for 2 min or 594 VAC for 2 min', ref: 'Figure 9, Table VII', note: 'Tc time to be provided by supplier, otherwise default times shall be used.' },
    { key: '5.3.7', label: 'Current waveform (emission) test', req: 'Per Section 5.3.7, performed in accordance with CE101 testing', ref: null, note: 'Requirement met using MIL-STD-461G test method CE101 with frequency extended to 20 kHz. A non-regulated power source may be needed as regulated source switching produces inconsistent current waveform data. Not required for currents < 1 A per NAVSEA.' },
    { key: '5.3.8', label: 'Voltage and frequency modulation (susceptibility) test', req: 'Frequency modulation 0.5%; voltage modulation 2%. Periods of 50 ms, 500 ms, 1 s and 10 s each repeated ten consecutive times', ref: 'Table VIII', note: null },
    { key: '5.3.9', label: 'Simulated human body impedance ground current test', req: '60 Hz to 700 Hz < 5 mA; 700 Hz to 100 kHz < 70 mA', ref: 'Figure 33 through Figure 36 depending on source voltage', note: null },
    { key: '5.3.10.1', label: 'Equipment line-to-ground voltage (susceptibility) test', req: '150 VDC (for 115 VAC) or 500 VDC (for 440 VAC) for 60 seconds; resistance to ground > 10 MOhm', ref: null, note: null },
    { key: '5.3.10.2', label: 'Equipment line-to-ground voltage test (AGD)', req: 'For 440 V rms EUT: AC source 622.2 V peak, DC source 505 VDC. For 115 V rms EUT: AC source 162.6 V peak, DC source 155 VDC.', ref: null, note: 'AGD is run on one line only per NAVSEA direction. Verify if legacy requirements apply.' },
  ]
}
