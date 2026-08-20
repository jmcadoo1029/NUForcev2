import { restFetch } from './restFetch'
import { SUPABASE_URL, REST_APIKEY } from './config'
import { getAccessToken } from './auth'

// Read-only access to a quote's sent-document history. Each row is one file that
// went out with a send (the generated Quote/Budget PDF, or an attachment picked
// from the sender's computer). The actual bytes live in Supabase Storage; the row
// keeps the metadata plus the object path so the exact file can be re-downloaded
// later via a short-lived signed URL. Writing these rows + uploading the bytes is
// Phase 7; this module only reads, and fails soft so a not-yet-created table never
// breaks the quote page.

export type SentDocKind = 'quote_pdf' | 'budget_pdf' | 'attachment'

export interface SentDocument {
  id: string
  quote_id: string
  follow_up_id: string | null // the send event this file belonged to
  revision: string | null // quote revision at send time
  sent_at: string | null
  sent_by: string | null
  kind: SentDocKind
  file_name: string
  mime: string | null
  byte_size: number | null
  storage_bucket: string | null
  storage_path: string | null
}

const COLS = 'id,quote_id,follow_up_id,revision,sent_at,sent_by,kind,file_name,mime,byte_size,storage_bucket,storage_path'

/** All files ever sent for a quote, newest first. Fails soft to []. */
export async function fetchSentDocuments(quoteId: string): Promise<SentDocument[]> {
  try {
    return (
      (await restFetch<SentDocument[]>(
        'GET',
        `sent_documents?select=${COLS}&quote_id=eq.${encodeURIComponent(quoteId)}&order=sent_at.desc`,
      )) || []
    )
  } catch {
    return []
  }
}

/** Sent files across a set of quote ids (a revision family), newest first. */
export async function fetchSentDocumentsForQuotes(quoteIds: string[]): Promise<SentDocument[]> {
  if (!quoteIds.length) return []
  try {
    const idList = quoteIds.map((id) => encodeURIComponent(id)).join(',')
    return (await restFetch<SentDocument[]>('GET', `sent_documents?select=${COLS}&quote_id=in.(${idList})&order=sent_at.desc`)) || []
  } catch {
    return []
  }
}

/**
 * Ask Supabase Storage for a short-lived signed URL to a stored object, so the
 * exact bytes that were sent can be re-downloaded. This is a read; it works in
 * the read-only phase. Returns null on any failure (missing object, no session).
 */
export async function signedDownloadUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const token = getAccessToken()
  if (!token) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: { apikey: REST_APIKEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { signedURL?: string }
    if (!body.signedURL) return null
    // The endpoint returns a path relative to /storage/v1; make it absolute.
    return `${SUPABASE_URL}/storage/v1${body.signedURL}`
  } catch {
    return null
  }
}
