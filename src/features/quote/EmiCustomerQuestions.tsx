import { useState } from 'react'
import { Modal, Button } from '../../components'

// EMI customer info-gathering questions (ported from Classic). Rendered as a
// numbered, single-spaced, editable list so it copies cleanly into an email.

const QUESTIONS = [
  'Revision of MIL-STD-461 — Rev F or Rev G?',
  'Classification of testing per the table in the standard (Army, Navy, Air Force; aircraft (external, safety critical, internal, flight line), ship (metallic or non-metallic), submarine (internal or external), ground, space).',
  'Location of the unit if on a ship (above deck & exposed below deck, below deck, hangar deck) — e.g. Navy, ships, metallic, below deck.',
  'Dimensions of EUT(s) (drawings if possible), including where cables enter/exit.',
  'Weight of EUT(s).',
  'Input power requirements (AC or DC voltage, # phases and nominal current, inrush current; if 3-phase, delta or wye).',
  'Number, size (OD), shielded or unshielded, length (in application), and location of cables on the EUT (helpful to know what is on each cable and how shields are terminated).',
  'Special interface requirements (test box, monitoring equipment needed to ensure functionality and/or susceptibility measurement, peripherals, pumps, compressed air, etc.).',
  'General operation description — a block diagram with all peripherals shown would be very helpful.',
  'How many modes of operation must be tested?',
  'Does this unit have an operating frequency of 100 kHz or less (or 150 kHz or less for Rev G CS101) AND an operating sensitivity of 1 µV or better (such as 0.5 µV)? If yes, specify the operating frequency.',
  'Are there any UPS/batteries or battery backup involved? If yes, what is the time to discharge from 100% to 20% at the fastest achievable rate, and the time to charge from 20–80% in the operating mode that will be used?',
  'What is the highest operating frequency of any oscillators (461 Rev F only)?',
  'Any procurement-specification extended frequency range requirements or optional tests?',
]
const DEFAULT_TEXT = QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n')

export function EmiCustomerQuestions({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(DEFAULT_TEXT)
  const [copied, setCopied] = useState('')
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied('Copied to clipboard')
        setTimeout(() => setCopied(''), 2000)
      })
      .catch(() => setCopied('Copy failed — select the text and Ctrl+C'))
  }
  return (
    <Modal title="Customer Questions — EMI" onClose={onClose} width={760}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>Edit as needed for this customer, then copy into your email.</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', minHeight: '52vh', fontFamily: 'inherit', fontSize: 'var(--fs-base)', lineHeight: 1.5, padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <Button variant="secondary" small onClick={() => setText(DEFAULT_TEXT)}>Reset to default</Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          {copied && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--pos)', fontWeight: 600 }}>{copied}</span>}
          <Button small onClick={copy}>Copy to clipboard</Button>
        </div>
      </div>
    </Modal>
  )
}
