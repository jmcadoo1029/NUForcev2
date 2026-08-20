import { restFetch } from './restFetch'
import { uploadObject, downloadObjectBase64 } from './storage'

// The NUForce document library. Rows in quote_documents point at bytes stored in
// the 'quote-documents' Storage bucket. Three kinds:
//   • 'terms'      — global (quote_id null). The Terms & Conditions PDF, stored
//                    once, offered on every send (default on, uncheckable).
//   • 'spec'       — a generated Test Specification PDF, saved to the quote so it
//                    persists and can be re-selected on later sends.
//   • 'attachment' — an ad-hoc uploaded file for one send.
// The Quote PDF itself is not stored here — it's regenerated fresh at send time.
//
// Reads fail soft to [] so a not-yet-created table never breaks the quote page.
// Writes throw so user-initiated saves can surface errors. All callers gate on
// WRITES_ENABLED.

const BUCKET = 'quote-documents'

export type QuoteDocKind = 'terms' | 'spec' | 'attachment'

export interface QuoteDocument {
  id: string
  quote_id: string | null
  kind: QuoteDocKind
  label: string
  file_name: string
  mime: string | null
  byte_size: number | null
  storage_bucket: string
  storage_path: string
  active: boolean
  created_at: string
  created_by: string | null
}

const COLS = 'id,quote_id,kind,label,file_name,mime,byte_size,storage_bucket,storage_path,active,created_at,created_by'

/** Documents available to attach on a send for this quote: the quote's own
 * spec/attachment docs plus every global doc (the Terms & Conditions). Active only. */
export async function fetchAttachableDocuments(quoteId: string): Promise<QuoteDocument[]> {
  try {
    const q = encodeURIComponent(quoteId)
    const filter = `active=eq.true&or=(quote_id.eq.${q},quote_id.is.null)&order=kind.asc,created_at.desc`
    return (await restFetch<QuoteDocument[]>('GET', `quote_documents?select=${COLS}&${filter}`)) || []
  } catch {
    return []
  }
}

/** The current global Terms & Conditions doc, or null if none stored yet. */
export async function fetchTermsDocument(): Promise<QuoteDocument | null> {
  try {
    const rows = await restFetch<QuoteDocument[]>('GET', `quote_documents?select=${COLS}&kind=eq.terms&quote_id=is.null&active=eq.true&order=created_at.desc&limit=1`)
    return rows?.[0] || null
  } catch {
    return null
  }
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file'
}

// A storage path that won't collide. We keep the caller's timestamp out of here
// (Date.now is fine in the browser at call time, but tests pass one in).
function storagePath(kind: QuoteDocKind, quoteId: string | null, fileName: string, stamp: number): string {
  const folder = kind === 'terms' ? 'global/terms' : `quote/${quoteId || 'unassigned'}`
  return `${folder}/${stamp}-${slug(fileName)}`
}

export interface StoreDocInput {
  quoteId: string | null
  kind: QuoteDocKind
  label: string
  fileName: string
  mime: string
  blob: Blob
  by: string
  stamp?: number // defaults to Date.now(); injectable for tests
}

/** Upload bytes to Storage and record a quote_documents row. Returns the row. */
export async function storeDocument(input: StoreDocInput): Promise<QuoteDocument> {
  const stamp = input.stamp ?? Date.now()
  const path = storagePath(input.kind, input.quoteId, input.fileName, stamp)
  const up = await uploadObject(BUCKET, path, input.blob, input.mime)
  const rows = await restFetch<QuoteDocument[]>('POST', `quote_documents?select=${COLS}`, {
    body: {
      quote_id: input.quoteId,
      kind: input.kind,
      label: input.label,
      file_name: input.fileName,
      mime: input.mime,
      byte_size: up.byteSize,
      storage_bucket: up.bucket,
      storage_path: up.path,
      created_by: input.by,
    },
    returnRepresentation: true,
  })
  const row = rows?.[0]
  if (!row) throw new Error('Document stored but no row returned')
  return row
}

/** Soft-delete: mark a document inactive so it stops appearing in pickers. */
export async function deactivateDocument(id: string): Promise<void> {
  await restFetch('PATCH', `quote_documents?id=eq.${encodeURIComponent(id)}`, { body: { active: false } })
}

/** Fetch a stored document's bytes as base64, for attaching to a send. */
export async function documentToBase64(doc: QuoteDocument): Promise<string | null> {
  return downloadObjectBase64(doc.storage_bucket, doc.storage_path)
}

export { BUCKET as QUOTE_DOCS_BUCKET, storagePath as _storagePathForTest }
