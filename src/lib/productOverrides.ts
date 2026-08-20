import { restFetch } from './restFetch'
import type { ProductOverride } from '../data/catalog'

// Read/write access to product_overrides — the persisted deltas over the code
// catalog (active/dormant, price/label overrides on base entries, and manager-
// added products). Reads fail soft (table may not exist yet); writes are gated by
// the caller on WRITES_ENABLED.

const COLS = 'id,base_key,code,label,price,active,removed,custom'

export async function fetchProductOverrides(): Promise<ProductOverride[]> {
  try {
    return (await restFetch<ProductOverride[]>('GET', `product_overrides?select=${COLS}`)) || []
  } catch {
    return []
  }
}

/** Upsert an override on a base catalog entry (unique on base_key). */
export async function upsertBaseOverride(
  baseKey: string,
  patch: { active?: boolean | null; price?: number | null; label?: string | null; code?: string | null },
  by: string,
): Promise<void> {
  await restFetch('POST', 'product_overrides?on_conflict=base_key', {
    body: {
      base_key: baseKey,
      active: patch.active ?? null,
      price: patch.price ?? null,
      label: patch.label ?? null,
      code: patch.code ?? null,
      removed: false,
      custom: false,
      updated_by: by,
      updated_at: new Date().toISOString(),
    },
    upsert: true,
  })
}

/** Remove a base-entry override (reset it to the code default). */
export async function deleteBaseOverride(baseKey: string): Promise<void> {
  await restFetch('DELETE', `product_overrides?base_key=eq.${encodeURIComponent(baseKey)}`)
}

/** Insert a manager-added product; returns the new row id. */
export async function insertProduct(p: { code: string; label: string; price: number | null; active: boolean }, by: string): Promise<string | null> {
  const rows = await restFetch<{ id: string }[]>('POST', 'product_overrides', {
    body: { base_key: null, code: p.code, label: p.label, price: p.price, active: p.active, custom: true, removed: false, updated_by: by, updated_at: new Date().toISOString() },
    returnRepresentation: true,
  })
  return rows?.[0]?.id ?? null
}

/** Update a manager-added product by id. */
export async function updateProduct(id: string, p: { code?: string; label?: string; price?: number | null; active?: boolean }, by: string): Promise<void> {
  await restFetch('PATCH', `product_overrides?id=eq.${encodeURIComponent(id)}`, {
    body: { ...p, updated_by: by, updated_at: new Date().toISOString() },
  })
}

/** Delete an override row by id (a manager-added product). */
export async function deleteOverrideById(id: string): Promise<void> {
  await restFetch('DELETE', `product_overrides?id=eq.${encodeURIComponent(id)}`)
}
