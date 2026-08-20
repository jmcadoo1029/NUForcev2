import { Modal } from '../../components'

// Fab & Mod hours cheat sheet — estimated fabrication times per test type, ported
// verbatim from Classic's Fab Guide modal. Reference only; opens from the "?" next
// to the Fab hours input on Setup Details.

const SECTIONS: { hdr: string; rows: [string, string, string][] }[] = [
  { hdr: 'Medium weight shock', rows: [['Standard', '4 holes', 'Up to 8 hrs'], ['Standard', '8 holes', 'Up to 12 hrs'], ['Standard', '16 holes', '16 hrs'], ['Standard', '>16 holes', '>16 hrs'], ['Bookend (in stock)', 'Up to 12" valves', '8 – 12 hrs'], ['Bookend (in stock)', '>12" valves', '>12 hrs']] },
  { hdr: 'Lightweight shock', rows: [['Standard', '4 holes', '4 hrs'], ['Standard', '6 – 8 holes', '6 hrs'], ['Standard', '8+ holes', '8 hrs'], ['Bookend (in stock)', 'Any', '8 hrs or less']] },
  { hdr: 'Vibration — with MWS (use MWS rules)', rows: [['Standard', '4 holes', 'Up to 8 hrs'], ['Standard', '8 holes', 'Up to 12 hrs'], ['Standard', '16 holes', '16 hrs'], ['Standard', '>16 holes', '>16 hrs'], ['Bookend (in stock)', 'Up to 12" valves', '8 – 12 hrs'], ['Bookend (in stock)', '>12" valves', '>12 hrs']] },
  { hdr: 'Vibration — with LWS or standalone <250 lbs (use LWS rules)', rows: [['Standard', '4 holes', '4 hrs'], ['Standard', '6 – 8 holes', '6 hrs'], ['Standard', '8+ holes', '8 hrs'], ['Bookend (in stock)', 'Any', '8 hrs or less']] },
  { hdr: 'Vibration — standalone >250 lbs (use MWS rules)', rows: [['Standard', '4 holes', 'Up to 8 hrs'], ['Standard', '8 holes', 'Up to 12 hrs'], ['Standard', '16 holes', '16 hrs'], ['Standard', '>16 holes', '>16 hrs']] },
  { hdr: 'AB / SB noise — <250 lbs (use LWS rules)', rows: [['Standard', '4 holes', '4 hrs'], ['Standard', '6 – 8 holes', '6 hrs'], ['Standard', '8+ holes', '8 hrs']] },
  { hdr: 'AB / SB noise — >250 lbs (use MWS rules)', rows: [['Standard', '4 holes', 'Up to 8 hrs'], ['Standard', '8 holes', 'Up to 12 hrs'], ['Standard', '16 holes', '16 hrs'], ['Standard', '>16 holes', '>16 hrs']] },
  { hdr: 'HFV / shock (other)', rows: [['Standard', '4 holes', '4 hrs'], ['Standard', '6 – 8 holes', '6 hrs'], ['Standard', '8+ holes', '8 hrs']] },
]

export function FabGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Estimated fab times per test" onClose={onClose} width={640}>
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {SECTIONS.map((sec) => (
          <div key={sec.hdr} style={{ marginBottom: 'var(--sp-4)' }}>
            <div style={{ background: 'var(--info-soft, #e8f0fb)', color: 'var(--info, #1a5276)', padding: '5px 11px', fontSize: 'var(--fs-sm)', fontWeight: 700, borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>{sec.hdr}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
              <tbody>
                {sec.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                    <td style={{ padding: '5px 11px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', width: '32%' }}>{row[0]}</td>
                    <td style={{ padding: '5px 11px', borderBottom: '1px solid var(--border)', width: '34%' }}>{row[1]}</td>
                    <td style={{ padding: '5px 11px', borderBottom: '1px solid var(--border)', fontWeight: 600, width: '34%' }}>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', padding: '6px 2px' }}>All estimates assume standard materials and normal geometry. Review with engineering for unusual cases.</div>
      </div>
    </Modal>
  )
}
