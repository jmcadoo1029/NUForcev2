import { Card, CardLabel } from '../../../components'
import { str } from '../../../lib/format'
import { GSI_OPTS, DOC_OPTS } from '../../../data/quoteDefaults'
import { Field, ListRow, RegField, regInput, gridEdit3, gridEdit2 } from './fields'

// Test Item card — clean single-column list + Regulatory row in view mode;
// Classic's exact inputs in edit mode (so the calculator's size/weight/power
// links stay intact). `acct` seeds the default Loads sentence.
export function TestItemCard({ editing, ti, setTi, acct }: { editing: boolean; ti: Record<string, any>; setTi: (patch: Record<string, any>) => void; acct: string }) {
  const s = str
  const dims = ti.dimL && ti.dimW && ti.dimH ? `${s(ti.dimL)} × ${s(ti.dimW)} × ${s(ti.dimH)} in` : ''
  const power = [ti.volt && `${s(ti.volt)}V`, ti.pwrType && s(ti.pwrType), ti.phase && `${s(ti.phase)}-phase`, ti.hz && `${s(ti.hz)} Hz`, ti.amps && `${s(ti.amps)}A`].filter(Boolean).join(' · ')
  // Loads: show the entered value; if it's null (never set) but we know the
  // account, fall back to Classic's default sentence. An empty string hides it.
  const loads = ti.loads != null && s(ti.loads).trim() !== '' ? s(ti.loads) : ti.loads == null && acct ? `All electrical and/or resistive loads will be provided by ${acct} unless otherwise discussed.` : ''
  const qty = s(ti.qty) && s(ti.qty) !== '1' ? s(ti.qty) : ''

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Test item</CardLabel>

      {!editing ? (
        <>
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <ListRow label="Item" value={s(ti.item)} />
            <ListRow label="Quantity" value={qty} />
            <ListRow label="Model" value={s(ti.model)} />
            <ListRow label="Drawing" value={s(ti.drawing)} />
            <ListRow label="Dimensions" value={dims} />
            <ListRow label="Weight" value={ti.wt ? `${s(ti.wt)} lbs` : ''} />
            <ListRow label="Power" value={power} />
            <ListRow label="Loads" value={loads} />
            <ListRow label="Mounting" value={s(ti.mounting)} />
            <ListRow label="Pressure / Flow" value={s(ti.pressureFlow)} />
          </div>
          <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'var(--sp-3)' }}>Regulatory</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-3)' }}>
              <Field label="GSI" value={s(ti.gsi) || 'Unknown'} />
              <Field label="Cust. witness" value={s(ti.witness) || 'Unknown'} />
              <Field label="Doc restriction" value={s(ti.docRestriction) || 'None'} />
              <Field label="DPAS rating" value={s(ti.dpas) || 'None'} />
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 'var(--sp-2)' }}>
          <div style={gridEdit3}>
            <RegField label="Item"><input value={s(ti.item)} onChange={(e) => setTi({ item: e.target.value })} style={regInput} /></RegField>
            <RegField label="Qty"><input value={s(ti.qty)} onChange={(e) => setTi({ qty: e.target.value })} style={regInput} /></RegField>
            <RegField label="Model No."><input value={s(ti.model)} onChange={(e) => setTi({ model: e.target.value })} style={regInput} /></RegField>
            <RegField label="Drawing No."><input value={s(ti.drawing)} onChange={(e) => setTi({ drawing: e.target.value })} style={regInput} /></RegField>
          </div>

          <div style={gridEdit3}>
            <RegField label="L × W × H (in)">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={s(ti.dimL)} onChange={(e) => setTi({ dimL: e.target.value })} placeholder="L" style={{ ...regInput, textAlign: 'center' }} />
                <input value={s(ti.dimW)} onChange={(e) => setTi({ dimW: e.target.value })} placeholder="W" style={{ ...regInput, textAlign: 'center' }} />
                <input value={s(ti.dimH)} onChange={(e) => setTi({ dimH: e.target.value })} placeholder="H" style={{ ...regInput, textAlign: 'center' }} />
              </div>
            </RegField>
            <RegField label="Weight (lbs)"><input value={s(ti.wt)} onChange={(e) => setTi({ wt: e.target.value })} style={regInput} /></RegField>
          </div>

          <div style={gridEdit3}>
            <RegField label="Voltage">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={s(ti.volt)} onChange={(e) => setTi({ volt: e.target.value })} style={regInput} />
                {['AC', 'DC'].map((t) => {
                  const on = (s(ti.pwrType) || 'AC') === t
                  return (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}>
                      <input type="checkbox" checked={on} onChange={() => setTi({ pwrType: t })} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
                      <span style={{ fontSize: 'var(--fs-sm)', color: on ? 'var(--accent)' : 'var(--muted)', fontWeight: on ? 700 : 400 }}>{t}</span>
                    </label>
                  )
                })}
              </div>
            </RegField>
            <RegField label="Phase"><input value={s(ti.phase)} onChange={(e) => setTi({ phase: e.target.value })} style={regInput} /></RegField>
            <RegField label="Hz"><input value={s(ti.hz)} onChange={(e) => setTi({ hz: e.target.value })} style={regInput} /></RegField>
            <RegField label="Inrush (A)"><input value={s(ti.inrush)} onChange={(e) => setTi({ inrush: e.target.value })} style={regInput} /></RegField>
            <RegField label="Op. Amps"><input value={s(ti.amps)} onChange={(e) => setTi({ amps: e.target.value })} style={regInput} /></RegField>
          </div>

          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <RegField label="Loads">
              <input
                value={ti.loads != null ? s(ti.loads) : acct ? `All electrical and/or resistive loads will be provided by ${acct} unless otherwise discussed.` : ''}
                onChange={(e) => setTi({ loads: e.target.value })}
                placeholder={acct ? 'Auto: uses Account name — clear to override' : 'Enter load details'}
                style={regInput}
              />
            </RegField>
          </div>

          <div style={gridEdit2}>
            <RegField label="Mounting"><input value={s(ti.mounting)} onChange={(e) => setTi({ mounting: e.target.value })} style={regInput} /></RegField>
            <RegField label="Pressure / Flow"><input value={s(ti.pressureFlow)} onChange={(e) => setTi({ pressureFlow: e.target.value })} style={regInput} /></RegField>
          </div>

          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3) var(--sp-4)', marginTop: 'var(--sp-2)' }}>
            <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'var(--sp-3)' }}>Regulatory</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-3)' }}>
              <RegField label="GSI">
                <select value={s(ti.gsi) || 'Unknown'} onChange={(e) => setTi({ gsi: e.target.value })} style={regInput}>
                  {GSI_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </RegField>
              <RegField label="Cust. witness">
                <select value={s(ti.witness) || 'Unknown'} onChange={(e) => setTi({ witness: e.target.value })} style={regInput}>
                  {GSI_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </RegField>
              <RegField label="Doc restriction">
                <select value={s(ti.docRestriction) || 'None'} onChange={(e) => setTi({ docRestriction: e.target.value })} style={regInput}>
                  {DOC_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </RegField>
              <RegField label="DPAS rating">
                <input value={s(ti.dpas)} onChange={(e) => setTi({ dpas: e.target.value })} placeholder="—" style={regInput} />
              </RegField>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
