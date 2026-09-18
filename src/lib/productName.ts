import { PCODE_OPTS } from '../data/constants'
import { buildCatalogRaw } from '../data/catalog'

// Product-code → display name, shared by the Mass Emails composer and the Email
// Scheduler so the {product} token reads the same everywhere.

// Codes kept OFF the product-code email audience — reports, procedures, admin lines,
// not tests worth a "we quoted you this" blast.
export const EXCLUDE_CODES = new Set(['33', '41', '42', '43', '44', '59', '95'])

// Clean name per code from the Product Picker catalog, with the "– Setup"/"– Testing"
// suffix stripped, falling back to the short PCODE_OPTS label.
const PRODUCT_NAME_BY_CODE: Record<string, string> = (() => {
  const strip = (s: string) => s.replace(/\s*[–—-]\s*(set[\s-]?up|testing)\s*$/i, '').trim()
  const byCode = new Map<string, string[]>()
  for (const p of buildCatalogRaw()) {
    const nm = strip(p.label)
    if (!nm) continue
    const arr = byCode.get(p.code) || []
    if (!arr.includes(nm)) arr.push(nm)
    byCode.set(p.code, arr)
  }
  for (const p of PCODE_OPTS) if (!byCode.has(p.code)) byCode.set(p.code, [p.label])
  const out: Record<string, string> = {}
  byCode.forEach((names, code) => { out[code] = names.join(' / ') })
  return out
})()

// Hand-set names for codes that map to several tests (per Jordan).
const PRODUCT_NAME_OVERRIDE: Record<string, string> = {
  '11': 'Acoustic Noise',
  '12': 'Airborne Noise or Structureborne Noise',
  '51': 'EMI',
  '52': 'shock or vibration',
  '53': 'Temperature & Humidity',
  '56': 'Altitude',
  '58': 'Enclosure Effectiveness',
}

export const productNameForCode = (code: string): string =>
  PRODUCT_NAME_OVERRIDE[code] || PRODUCT_NAME_BY_CODE[code] || PCODE_OPTS.find((p) => p.code === code)?.label || code

// Product-code audience dropdown options (excluded codes removed, multi-label joined).
export const CODE_OPTIONS: { code: string; label: string }[] = (() => {
  const byCode = new Map<string, string[]>()
  for (const p of PCODE_OPTS) {
    if (EXCLUDE_CODES.has(p.code)) continue
    const arr = byCode.get(p.code) || []
    if (!arr.includes(p.label)) arr.push(p.label)
    byCode.set(p.code, arr)
  }
  return Array.from(byCode.entries())
    .map(([code, labels]) => ({ code, label: labels.join(' / ') }))
    .sort((a, b) => Number(a.code) - Number(b.code))
})()

// Fill the {product} token (case-insensitive) with a code's display name.
export const fillProductToken = (text: string, code: string): string =>
  text.replace(/\{product\}/gi, code ? productNameForCode(code) : '[product]')
