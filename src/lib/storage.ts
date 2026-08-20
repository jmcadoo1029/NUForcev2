import { SUPABASE_URL, REST_APIKEY } from './config'
import { getAccessToken } from './auth'

// Thin wrapper over Supabase Storage's REST API, using the shared user session
// token (same session as PostgREST). Uploads and downloads bytes; signed URLs
// live in sentDocs.ts (signedDownloadUrl) and are reused for re-download.

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAccessToken()
  return { apikey: REST_APIKEY, Authorization: `Bearer ${token || ''}`, ...(extra || {}) }
}

/** Encode each path segment but keep the slashes between folders. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export interface UploadResult {
  bucket: string
  path: string
  mime: string
  byteSize: number
}

/**
 * Upload bytes to a bucket at path (upsert). Returns the stored location so the
 * caller can persist a row pointing at it. Throws on failure so callers can
 * surface the error (writes are user-initiated).
 */
export async function uploadObject(bucket: string, path: string, data: Blob | ArrayBuffer, mime: string): Promise<UploadResult> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime })
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodePath(path)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': mime, 'x-upsert': 'true' }),
    body: blob,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Storage upload failed (${res.status})${detail ? ': ' + detail : ''}`)
  }
  return { bucket, path, mime, byteSize: blob.size }
}

/** Download an object's raw bytes (authenticated). Returns null on any failure. */
export async function downloadObject(bucket: string, path: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodePath(path)}`, { headers: authHeaders() })
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

/** Strip the "data:...;base64," prefix a FileReader data URL carries. */
function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/** A Blob as base64 (no data-URL prefix) — the shape Resend attachments want. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // Chunked to avoid a call-stack blowup on large PDFs.
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Read a picked File as base64 (no data-URL prefix). */
export async function fileToBase64(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  return stripDataUrl(dataUrl)
}

/** Download a stored object and return it as base64 for attaching. Null on miss. */
export async function downloadObjectBase64(bucket: string, path: string): Promise<string | null> {
  const blob = await downloadObject(bucket, path)
  if (!blob) return null
  return blobToBase64(blob)
}
