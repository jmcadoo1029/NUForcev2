import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Button, useToast } from '../../components'
import { buildCatalog, buildCatalogRaw, sortCatalog, setCatalogOverrides } from '../../data/catalog'
import { PCODE_OPTS } from '../../data/constants'
import { sf, money } from '../../lib/format'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { fetchIsApprover } from '../../lib/perms'
import { fetchProductOverrides, upsertBaseOverride, deleteBaseOverride, insertProduct, updateProduct, deleteOverrideById } from '../../lib/productOverrides'

// Master product catalog — every line item the Product Picker offers. Managers
// add, edit, and activate/deactivate products here; edits persist to
// product_overrides (deltas over the code catalog) so formula prices stay in code
// while manager changes stick. Deactivating keeps a product for old/imported lines
// but hides it from the Picker. Gated by WRITES_ENABLED; editing is manager-only.

interface CatItem {
  key: number // local row id
  baseKey?: string // code-catalog key (base entry); undefined for manager-added
  ovId?: string // product_overrides row id (manager-added product)
  code: string
  label: string
  price: string
  custom?: boolean
  active: boolean
}

let seq = 1
const seed = (): CatItem[] =>
  sortCatalog(buildCatalog(), 'code').map((p) => {
    const added = p.key.startsWith('ov_')
    return {
      key: seq++,
      baseKey: added ? undefined : p.key,
      ovId: added ? p.key.slice(3) : undefined,
      code: p.code,
      label: p.label,
      price: p.custom ? (p.price ? String(p.price) : '') : String(p.price),
      custom: p.custom,
      active: p.active !== false,
    }
  })

const byCode = (a: CatItem, b: CatItem) => (parseInt(a.code) || 0) - (parseInt(b.code) || 0) || a.label.localeCompare(b.label)
const roleOf = (label: string) => (/set ?up/i.test(label) ? 'Setup' : /test/i.test(label) ? 'Test' : '—')

export function ProductCatalog({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const [items, setItems] = useState<CatItem[]>(seed)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const initialRef = useRef<CatItem[]>([])
  const me = getSessionEmail() || ''

  useEffect(() => { initialRef.current = items }, []) // snapshot the loaded state once
  useEffect(() => { let alive = true; fetchIsApprover().then((v) => alive && setIsManager(v)); return () => { alive = false } }, [])

  const rawByKey = useMemo(() => new Map(buildCatalogRaw().map((p) => [p.key, p])), [])

  const update = (key: number, patch: Partial<CatItem>) => setItems((it) => it.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const remove = (key: number) => setItems((it) => it.filter((x) => x.key !== key))
  const add = () => setItems((it) => [...it, { key: seq++, code: '94', label: '', price: '', active: true }].sort(byCode))
  const resort = () => setItems((it) => [...it].sort(byCode))

  const activeCount = items.filter((p) => p.active).length
  const dormantCount = items.length - activeCount

  // Persist the diff between the grid and the base catalog to product_overrides.
  const save = async () => {
    if (!WRITES_ENABLED) { showToast('Preview — catalog writes are off.', 'warn'); resort(); setEditing(false); return }
    setBusy(true)
    try {
      const initial = initialRef.current
      const currentKeys = new Set(items.map((i) => i.key))
      const initialByLocal = new Map(initial.map((i) => [i.key, i]))

      // Removed manager-added products.
      for (const it of initial) {
        if (!currentKeys.has(it.key) && it.ovId) await deleteOverrideById(it.ovId)
      }

      for (const it of items) {
        const before = initialByLocal.get(it.key)
        const changed = !before || before.active !== it.active || before.price !== it.price || before.label !== it.label || before.code !== it.code
        const priceNum = it.price.trim() === '' ? null : sf(it.price)
        if (it.baseKey) {
          if (!changed) continue
          const base = rawByKey.get(it.baseKey)
          if (!base) continue
          const patch = {
            active: it.active !== (base.active !== false) ? it.active : null,
            label: it.label !== base.label ? it.label : null,
            price: priceNum != null && !(!base.custom && priceNum === base.price) ? priceNum : null,
            code: it.code !== base.code ? it.code : null,
          }
          if (patch.active != null || patch.label != null || patch.price != null || patch.code != null) await upsertBaseOverride(it.baseKey, patch, me)
          else await deleteBaseOverride(it.baseKey) // edited back to base default → clear the override
        } else if (it.ovId) {
          if (changed) await updateProduct(it.ovId, { code: it.code, label: it.label, price: priceNum, active: it.active }, me)
        } else {
          if (it.label.trim() || it.code.trim()) await insertProduct({ code: it.code || '94', label: it.label.trim() || 'New product', price: priceNum, active: it.active }, me)
        }
      }

      const rows = await fetchProductOverrides()
      setCatalogOverrides(rows)
      const fresh = seed()
      setItems(fresh)
      initialRef.current = fresh
      setEditing(false)
      showToast('Catalog saved', 'success')
    } catch (e) {
      showToast('Catalog save failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 7000)
    } finally {
      setBusy(false)
    }
  }

  const input: React.CSSProperties = { fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '6px 9px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

  const StatusPill = ({ active }: { active: boolean }) => (
    <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', padding: '2px 9px', borderRadius: 20, color: active ? 'var(--pos)' : 'var(--warn)', background: active ? 'var(--pos-soft, #e6f4ea)' : 'var(--warn-soft)' }}>{active ? 'Active' : 'Dormant'}</span>
  )

  const VIEW_COLS = '62px 1fr 84px 112px 92px'
  const EDIT_COLS = '108px 1fr 104px 108px 30px'

  return (
    <Modal title="Product Catalog" onClose={onClose} width={820}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {items.length} products · <span style={{ color: 'var(--pos)', fontWeight: 600 }}>{activeCount} active</span> · <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{dormantCount} dormant</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          {editing && <Button variant="secondary" small onClick={add} disabled={busy}>+ Add product</Button>}
          {isManager ? (
            editing ? (
              <Button variant="primary" small onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            ) : (
              <Button variant="secondary" small onClick={() => setEditing(true)}>Edit catalog</Button>
            )
          ) : (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', fontStyle: 'italic' }}>View only — managers can edit</span>
          )}
        </div>
      </div>

      {editing && (
        <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn-border)', borderRadius: 'var(--radius-sm)', padding: '9px 13px', fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginBottom: 'var(--sp-4)' }}>
          {WRITES_ENABLED
            ? 'Edits save to the shared catalog on Save. Deactivating keeps a product for old/imported quotes but hides it from the Picker. Base entries deactivate rather than delete; only added products can be removed.'
            : 'Preview — writes are off, so changes here won’t persist yet.'}
        </div>
      )}

      <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: editing ? EDIT_COLS : VIEW_COLS, gap: 'var(--sp-3)', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', padding: '0 2px 8px', position: 'sticky', top: 0, background: 'var(--card)' }}>
          <div>Code</div>
          <div>Product</div>
          <div>{editing ? 'Price' : 'Setup/Test'}</div>
          <div style={{ textAlign: editing ? 'left' : 'right' }}>{editing ? 'Status' : 'Price'}</div>
          <div style={{ textAlign: editing ? 'left' : 'center' }}>{editing ? '' : 'Status'}</div>
        </div>

        {items.map((p) =>
          editing ? (
            <div key={p.key} style={{ display: 'grid', gridTemplateColumns: EDIT_COLS, gap: 'var(--sp-3)', alignItems: 'center', marginBottom: 6, opacity: p.active ? 1 : 0.72 }}>
              <select value={p.code} onChange={(e) => update(p.key, { code: e.target.value })} style={input}>
                {PCODE_OPTS.map((o) => (
                  <option key={o.code + '-' + o.label} value={o.code}>{o.code} — {o.label}</option>
                ))}
              </select>
              <input value={p.label} onChange={(e) => update(p.key, { label: e.target.value })} placeholder="Product name" style={input} />
              <input value={p.price} onChange={(e) => update(p.key, { price: e.target.value })} placeholder={p.custom ? 'TBD' : '0'} inputMode="decimal" style={{ ...input, textAlign: 'right' }} />
              <button
                onClick={() => update(p.key, { active: !p.active })}
                title={p.active ? 'Click to deactivate (make dormant)' : 'Click to activate'}
                style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (p.active ? 'var(--pos)' : 'var(--warn)'), color: p.active ? 'var(--pos)' : 'var(--warn)', background: '#fff', whiteSpace: 'nowrap' }}
              >{p.active ? 'Active' : 'Dormant'}</button>
              {!p.baseKey ? (
                <button onClick={() => remove(p.key)} aria-label="Remove" title="Remove this added product" style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer' }}>×</button>
              ) : (
                <span />
              )}
            </div>
          ) : (
            <div key={p.key} style={{ display: 'grid', gridTemplateColumns: VIEW_COLS, gap: 'var(--sp-3)', alignItems: 'center', padding: '9px 2px', borderBottom: '1px solid var(--border)', opacity: p.active ? 1 : 0.72 }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>{p.code}</div>
              <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text)' }}>{p.label}</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{roleOf(p.label)}</div>
              <div style={{ fontSize: 'var(--fs-base)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.custom && !sf(p.price) ? 'var(--muted)' : 'var(--text)' }}>
                {p.custom && !sf(p.price) ? 'TBD' : money(sf(p.price))}
              </div>
              <div style={{ textAlign: 'center' }}><StatusPill active={p.active} /></div>
            </div>
          ),
        )}
      </div>
    </Modal>
  )
}
