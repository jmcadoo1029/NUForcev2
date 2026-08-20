import { Card, CardLabel } from '../../../components'
import { money, sf, str } from '../../../lib/format'
import type { BudgetRow } from '../../../data/quoteDefaults'
import { budgetRowMarkedUp, budgetHardTotal, budgetMarkedUpTotal } from '../../../data/budget'
import { regInput } from './fields'

// Budget materials — internal materials tracking (not added to the quote total).
// Marked-up figures always round up to the nearest $5 (see data/budget). Shows
// only when editing or there are rows.
export function BudgetCard({
  editing,
  budget,
  onMarkupChange,
  onUpd,
  onAdd,
  onRem,
}: {
  editing: boolean
  budget: { on: boolean; rows: BudgetRow[]; markup: string }
  onMarkupChange: (v: string) => void
  onUpd: (i: number, k: keyof BudgetRow, v: string) => void
  onAdd: () => void
  onRem: (i: number) => void
}) {
  if (!editing && budget.rows.length === 0) return null
  const s = str
  const mp = sf(budget.markup, 25) / 100
  const hard = budgetHardTotal(budget.rows)
  const markedTotal = budgetMarkedUpTotal(budget.rows, mp)

  return (
    <Card style={{ marginBottom: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
        <CardLabel>Budget materials</CardLabel>
        {editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Markup %</span>
            <input value={s(budget.markup)} onChange={(e) => onMarkupChange(e.target.value)} inputMode="decimal" style={{ ...regInput, width: 70, textAlign: 'right' }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>Internal materials tracking — not added to the quote total. Markup applies here only.</div>

      {budget.rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 70px 96px 96px 26px' : '1fr 70px 96px 96px', gap: 'var(--sp-2)', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '0 2px 6px' }}>
          <div>Description</div>
          <div style={{ textAlign: 'right' }}>Qty</div>
          <div style={{ textAlign: 'right' }}>Unit cost</div>
          <div style={{ textAlign: 'right' }}>Marked up</div>
          {editing && <div />}
        </div>
      )}
      {budget.rows.map((r, i) => {
        const markedUp = budgetRowMarkedUp(r, mp)
        return editing ? (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 96px 96px 26px', gap: 'var(--sp-2)', alignItems: 'center', marginBottom: 6 }}>
            <input value={r.desc} onChange={(e) => onUpd(i, 'desc', e.target.value)} placeholder="Material / item" style={regInput} />
            <input value={r.qty} onChange={(e) => onUpd(i, 'qty', e.target.value)} inputMode="decimal" style={{ ...regInput, textAlign: 'right' }} />
            <input value={r.unitCost} onChange={(e) => onUpd(i, 'unitCost', e.target.value)} inputMode="decimal" style={{ ...regInput, textAlign: 'right' }} />
            <div style={{ fontSize: 'var(--fs-base)', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{money(markedUp)}</div>
            <button onClick={() => onRem(i)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
        ) : (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 96px 96px', gap: 'var(--sp-2)', alignItems: 'center', padding: '8px 2px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--fs-base)' }}>{r.desc || '—'}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s(r.qty)}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(sf(r.unitCost))}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{money(markedUp)}</div>
          </div>
        )
      })}
      {editing && (
        <button onClick={onAdd} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', cursor: 'pointer', marginTop: 'var(--sp-2)' }}>+ Add material</button>
      )}
      {hard > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-4)', marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: 'var(--muted)' }}>Hard <b style={{ color: 'var(--text)' }}>{money(hard)}</b></span>
          <span style={{ color: 'var(--muted)' }}>Marked up <b style={{ color: 'var(--text)' }}>{money(markedTotal)}</b></span>
        </div>
      )}
    </Card>
  )
}
