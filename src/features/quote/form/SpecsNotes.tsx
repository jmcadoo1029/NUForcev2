import { Card, CardLabel } from '../../../components'
import { str } from '../../../lib/format'
import { AutoTextarea, textArea, cleanNotes } from './fields'

// Specifications + Notes cards. Specs is a single free-text field. Notes shows the
// quote's saved auto-notes (read-only) above the editable per-quote notes. Both
// hide when empty and not editing. `savedNotes` is the raw quote data.notes.
export function SpecsNotes({ editing, ti, setTi, savedNotes }: { editing: boolean; ti: Record<string, any>; setTi: (patch: Record<string, any>) => void; savedNotes: string }) {
  const s = str
  const notes = cleanNotes(savedNotes)
  const tiNotes = cleanNotes(s(ti.tiNotes))

  return (
    <>
      {(editing || s(ti.tiSpecs)) && (
        <Card style={{ marginBottom: 'var(--sp-4)' }}>
          <CardLabel>Specifications</CardLabel>
          {editing ? (
            <AutoTextarea value={s(ti.tiSpecs)} onChange={(v) => setTi({ tiSpecs: v })} placeholder="Test specifications…" style={{ ...textArea, marginTop: 'var(--sp-2)' }} />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{s(ti.tiSpecs)}</div>
          )}
        </Card>
      )}

      {(editing || notes || tiNotes) && (
        <Card style={{ marginBottom: 'var(--sp-4)' }}>
          <CardLabel>Notes</CardLabel>
          {editing ? (
            <>
              {notes && (
                <div style={{ marginTop: 'var(--sp-2)', marginBottom: 'var(--sp-3)', paddingBottom: 'var(--sp-3)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>Saved notes · read-only</div>
                  <div style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>{notes}</div>
                </div>
              )}
              <AutoTextarea value={s(ti.tiNotes)} onChange={(v) => setTi({ tiNotes: v })} placeholder="Notes for this quote…" style={{ ...textArea, marginTop: notes ? 0 : 'var(--sp-2)' }} />
            </>
          ) : (
            <>
              {notes && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', marginBottom: tiNotes ? 'var(--sp-3)' : 0 }}>{notes}</div>}
              {tiNotes && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{tiNotes}</div>}
            </>
          )}
        </Card>
      )}
    </>
  )
}
