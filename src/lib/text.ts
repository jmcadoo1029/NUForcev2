// Text helpers, ported from the classic app.

/** Turn an email into a display name: "jane.doe@nulabs.com" → "Jane Doe". */
export function prettifyEmail(email: string | null | undefined): string {
  if (!email) return ''
  const local = String(email).split('@')[0]
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
