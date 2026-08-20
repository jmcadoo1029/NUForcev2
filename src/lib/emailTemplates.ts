import { restFetch } from './restFetch'

// Email templates for NUForce sends. Ships defaults in code; the quote_templates
// table (if present) overrides them so senders can edit wording in-app. Reads
// fail soft to the defaults, so a missing table never blocks composing. The
// client fills placeholders before send; the edge function sends final text.

export type TemplateKey = 'quote' | 'follow_up'

export interface EmailTemplate {
  key: TemplateKey
  subject: string
  body: string
}

// Placeholder tokens match exactly what a sender sees in the editor.
export const TOKENS = {
  contactFirstName: '{First Name of contact}',
  quoteNumber: '{Quote #}',
  testItem: '{Test Item}',
  senderName: '{First & Last name of NU Labs person sending the quote}',
} as const

const SIGNATURE = `{First & Last name of NU Labs person sending the quote}
NU Laboratories, Inc.
312 Old Allerton Rd.
Annandale, NJ 08801
(908) 713-9300`

// Jordan's send copy, verbatim.
const DEFAULT_QUOTE: EmailTemplate = {
  key: 'quote',
  subject: `NU Laboratories Quotation #{Quote #} — {Test Item}`,
  body: `Dear {First Name of contact},

Please see the attached quotation #{Quote #} for testing the {Test Item}. If you have any questions, don't hesitate to reach out.

Also attached is our Terms and Conditions page for your signature and return with your purchase order.

Thank you,

${SIGNATURE}`,
}

// Polished follow-up (approved by Jordan): names the test item, offers help,
// easy to reply to.
const DEFAULT_FOLLOW_UP: EmailTemplate = {
  key: 'follow_up',
  subject: `Following up — NU Labs Quote #{Quote #}`,
  body: `Dear {First Name of contact},

I'm following up on NU Labs Quote #{Quote #} for testing the {Test Item}. I wanted to check in on where things stand, and see whether there's anything we can clarify or provide to help move it forward.

If it's helpful, I'm happy to walk through any part of the quote or answer questions about scheduling and turnaround. Just let me know.

Thank you, and have a great day,

${SIGNATURE}`,
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  quote: DEFAULT_QUOTE,
  follow_up: DEFAULT_FOLLOW_UP,
}

export interface TemplateVars {
  contactFirstName?: string
  quoteNumber?: string
  testItem?: string
  senderName?: string
}

function sub(text: string, token: string, value: string | undefined, fallback: string): string {
  const v = (value || '').trim() || fallback
  return text.split(token).join(v)
}

/** Fill the placeholder tokens. Empty values become a readable bracket hint so
 * the sender notices what's missing in the live preview. */
export function fillTemplate(text: string, vars: TemplateVars): string {
  let out = text
  out = sub(out, TOKENS.contactFirstName, vars.contactFirstName, '[contact first name]')
  out = sub(out, TOKENS.quoteNumber, vars.quoteNumber, '[quote #]')
  out = sub(out, TOKENS.testItem, vars.testItem, '[test item]')
  out = sub(out, TOKENS.senderName, vars.senderName, '[your name]')
  return out
}

/** The template for a key: the stored override if present, else the default. */
export async function fetchTemplate(key: TemplateKey): Promise<EmailTemplate> {
  try {
    const rows = await restFetch<Array<{ key: TemplateKey; subject: string; body: string }>>(
      'GET',
      `quote_templates?select=key,subject,body&key=eq.${encodeURIComponent(key)}&limit=1`,
    )
    const r = rows?.[0]
    if (r && (r.subject || r.body)) return { key, subject: r.subject || DEFAULT_TEMPLATES[key].subject, body: r.body || DEFAULT_TEMPLATES[key].body }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_TEMPLATES[key]
}

/** Save (upsert) an edited template so it overrides the default going forward. */
export async function saveTemplate(key: TemplateKey, subject: string, body: string, by: string): Promise<void> {
  await restFetch('POST', 'quote_templates?on_conflict=key', {
    body: { key, subject, body, updated_by: by, updated_at: new Date().toISOString() },
    upsert: true,
  })
}
