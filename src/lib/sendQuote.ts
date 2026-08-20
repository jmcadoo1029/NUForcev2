import { FN_BASE, REST_APIKEY } from './config'
import { getAccessToken } from './auth'
import { restFetch } from './restFetch'
import { uploadObject, blobToBase64 } from './storage'
import { QUOTE_DOCS_BUCKET } from './quoteDocs'

// Client side of the quote-send flow. invokeQuoteSend() calls the edge function
// (see docs/quote-send-function-handoff.md); the function does the Resend send +
// the CMMC audit row. On success the caller (composer) records the send in
// NUForce: mark-sent / follow-up reschedule (followups.ts) and the sent-files
// log here. Bytes for each attachment are uploaded to Storage so the exact file
// can be re-downloaded later.
//
// The edge function is NOT deployed yet. invokeQuoteSend detects that (404/501)
// and returns { notDeployed: true } so the UI can say so cleanly instead of
// throwing a raw network error.

export type SendKind = 'quote' | 'follow_up'

export interface SendAttachmentPayload {
  filename: string
  contentBase64: string
  mime: string
}

export interface QuoteSendRequest {
  kind: SendKind
  quoteId: string
  opportunity: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  fromName: string
  attachments: SendAttachmentPayload[]
}

export interface QuoteSendResult {
  ok: boolean
  notDeployed?: boolean
  resendId?: string
  status?: string
  sentAt?: string
  error?: string
}

/** Call the quote-send edge function. Never throws — returns a structured result. */
export async function invokeQuoteSend(req: QuoteSendRequest): Promise<QuoteSendResult> {
  const token = getAccessToken()
  if (!token) return { ok: false, error: 'No active session.' }
  let res: Response
  try {
    res = await fetch(`${FN_BASE}/quote-send`, {
      method: 'POST',
      headers: { apikey: REST_APIKEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  // Not deployed yet: Supabase returns 404 for an unknown function.
  if (res.status === 404 || res.status === 501) return { ok: false, notDeployed: true, error: 'The quote-send email function is not deployed yet.' }
  let json: any = null
  try { json = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) return { ok: false, error: (json && (json.error || json.message)) || `Send failed (${res.status}).`, status: json?.status }
  // Function returns { ok, resendId, status, sentAt } (or ok:false + error).
  if (json && json.ok === false) return { ok: false, error: json.error || 'Send failed.', status: json.status }
  return { ok: true, resendId: json?.resendId, status: json?.status || 'sent', sentAt: json?.sentAt }
}

// ── sent-files logging ──────────────────────────────────────────────────────

export type SentDocLogKind = 'quote_pdf' | 'budget_pdf' | 'attachment'

export interface OutgoingFile {
  kind: SentDocLogKind
  fileName: string
  mime: string
  blob: Blob
}

/** Base64 for each outgoing file, in the shape the edge function wants. */
export async function filesToAttachments(files: OutgoingFile[]): Promise<SendAttachmentPayload[]> {
  return Promise.all(
    files.map(async (f) => ({ filename: f.fileName, mime: f.mime, contentBase64: await blobToBase64(f.blob) })),
  )
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'
}

export interface LogSentFilesInput {
  quoteId: string
  followUpId: string | null
  revision: string | null
  sentBy: string
  files: OutgoingFile[]
  stamp?: number
}

/**
 * Upload each sent file's bytes to Storage and insert a sent_documents row, so
 * the exact file is re-downloadable from the Sent files log. Best-effort: a
 * failure to log one file never fails the send (the email already went).
 */
export async function logSentFiles(input: LogSentFilesInput): Promise<void> {
  const stamp = input.stamp ?? Date.now()
  for (const f of input.files) {
    try {
      const path = `sent/${input.quoteId}/${stamp}-${slug(f.fileName)}`
      const up = await uploadObject(QUOTE_DOCS_BUCKET, path, f.blob, f.mime)
      await restFetch('POST', 'sent_documents', {
        body: {
          quote_id: input.quoteId,
          follow_up_id: input.followUpId,
          revision: input.revision,
          sent_by: input.sentBy,
          kind: f.kind,
          file_name: f.fileName,
          mime: f.mime,
          byte_size: up.byteSize,
          storage_bucket: up.bucket,
          storage_path: up.path,
        },
      })
    } catch {
      /* logging is best-effort; keep going */
    }
  }
}
