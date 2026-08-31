import { restFetch } from './restFetch'

// Email templates for NUForce sends. Ships defaults in code; the quote_templates
// table (if present) overrides them so senders can edit wording in-app. Reads
// fail soft to the defaults, so a missing table never blocks composing. The
// client fills placeholders before send; the edge function sends final text.

export type TemplateKey =
  | 'quote'
  | 'follow_up'
  | 'follow_up_combined'
  // Mass-email audience starters — editable here so the wording lives in one place;
  // the Mass Emails composer seeds each audience from these. They use the mass
  // merge token {first name} and a manual [Your Name] the sender fills in.
  | 'mass_all'
  | 'mass_code'
  | 'mass_campaign'
  | 'mass_account'

// The mass-email audience keys (subset of TemplateKey), in audience order.
export const MASS_TEMPLATE_KEYS = ['mass_all', 'mass_code', 'mass_campaign', 'mass_account'] as const
export type MassTemplateKey = (typeof MASS_TEMPLATE_KEYS)[number]

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
  // Combined follow-up only: one line per quote, "#26-100 — Widget A", built from
  // every quote in the bundle (each with its own test item). Replaces the singular
  // {Quote #}/{Test Item} pairing that only makes sense for a single quote.
  quoteList: '{Quote List}',
  senderName: '{First & Last name of NU Labs person sending the quote}',
  // Mass-email merge token — the composer/edge function fills each recipient's
  // first name at send. [Your Name] in a mass body is left literal for the sender.
  massFirstName: '{first name}',
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

// Combined follow-up — one email covering several quotes to the same contact.
// {Quote List} expands to one "#number — test item" line per quote, so each unit
// is named without the singular "the {Test Item}" phrasing.
const DEFAULT_FOLLOW_UP_COMBINED: EmailTemplate = {
  key: 'follow_up_combined',
  subject: `Following up on your NU Labs quotes`,
  body: `Dear {First Name of contact},

I'm following up on the following NU Labs quotes:

{Quote List}

I wanted to check in on where things stand, and see whether there's anything we can clarify or provide to help move them forward.

If it's helpful, I'm happy to walk through any of these or answer questions about scheduling and turnaround. Just let me know.

Thank you, and have a great day,

${SIGNATURE}`,
}

// ── Mass-email audience starters ───────────────────────────────────────────────
// One per Mass Emails audience. {first name} is merged per recipient at send;
// [Your Name] is a manual placeholder the sender types in. Editable in the Email
// Templates manager; the composer seeds each audience from the saved version.
const DEFAULT_MASS_ALL: EmailTemplate = {
  key: 'mass_all',
  subject: 'NU Laboratories — Our Testing Capabilities',
  body: `Hello, {first name}!

This is [Your Name], Sales Manager, from NU Laboratories wanting to thank you for all of the fantastic opportunities! It has been an absolute pleasure working with you, and I hope that we can continue to meet your testing needs for many years to come!

I want to take this time to remind you of all of the great services that NU Laboratories has to offer, including (but not limited to) medium weight and lightweight shock, acoustic noise, including high intensity noise susceptibility with OASPL's reaching upwards of 170 dB, as well as noise emissions testing, Type I and II vibration, EMI, Power Quality, temperature/humidity, salt/fog, etc. Please take a few minutes to visit our website at www.nulabs.com to see the wide range of our capabilities.

Please contact me via phone or email to discuss any upcoming projects, it would be our pleasure to assist in your testing needs this year!

Looking forward to hearing from you soon!`,
}

const DEFAULT_MASS_CODE: EmailTemplate = {
  key: 'mass_code',
  subject: 'NU Laboratories — Let’s line up your next test',
  body: `Hello, {first name}!

This is [Your Name] at NU Laboratories. Our records show we’ve had the pleasure of quoting testing for you in the past, and I wanted to reach out to make sure we stay on your radar for any upcoming projects.

NU Laboratories offers a full range of testing services — shock (medium and lightweight), vibration, acoustic and high-intensity noise, EMI, Power Quality, DC Magnetics, temperature/humidity, salt fog, altitude, and more. Whatever you have coming down the pipeline, there’s a good chance we can handle it in-house and turn it around quickly.

If you have a project you’d like quoted, just reply to this email or give me a call — it would be our pleasure to support your testing needs again.

Looking forward to hearing from you!`,
}

const DEFAULT_MASS_CAMPAIGN: EmailTemplate = {
  key: 'mass_campaign',
  subject: 'Great meeting you — NU Laboratories',
  body: `Hi {first name},

It was a pleasure meeting you! This is [Your Name] from NU Laboratories, following up from our conversation.

As a quick reminder of what we do: NU Laboratories is a full-service test lab specializing in shock, vibration, acoustic and high-intensity noise, EMI, Power Quality, DC Magnetics, and a wide range of environmental testing (temperature/humidity, salt fog, altitude, and more). You can see our full capabilities at www.nulabs.com.

We’d love the opportunity to be a testing partner for your team. If you have any projects in the pipeline — now or down the road — I’d welcome the chance to put together a quote and show you what we can do.

Please feel free to reply here or reach out anytime. Looking forward to staying in touch!`,
}

const DEFAULT_MASS_ACCOUNT: EmailTemplate = {
  key: 'mass_account',
  subject: 'NU Laboratories — Here for your team’s testing needs',
  body: `Hello, {first name}!

This is [Your Name] at NU Laboratories. I’m reaching out to your team to make sure we’re a resource whenever a testing need comes up.

NU Laboratories provides a full range of testing under one roof — shock (medium and lightweight), vibration, acoustic and high-intensity noise, EMI, Power Quality, DC Magnetics, temperature/humidity, salt fog, altitude, and more. If any project on your side calls for testing, we’d be glad to put together a quote and turn it around quickly.

Please feel free to reach out to me directly with anything you have coming up — it would be our pleasure to support your team.

Looking forward to working with you!`,
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  quote: DEFAULT_QUOTE,
  follow_up: DEFAULT_FOLLOW_UP,
  follow_up_combined: DEFAULT_FOLLOW_UP_COMBINED,
  mass_all: DEFAULT_MASS_ALL,
  mass_code: DEFAULT_MASS_CODE,
  mass_campaign: DEFAULT_MASS_CAMPAIGN,
  mass_account: DEFAULT_MASS_ACCOUNT,
}

export interface TemplateVars {
  contactFirstName?: string
  quoteNumber?: string
  testItem?: string
  quoteList?: string
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
  out = sub(out, TOKENS.quoteList, vars.quoteList, '[quotes]')
  out = sub(out, TOKENS.senderName, vars.senderName, '[your name]')
  // Mass merge token (harmless for quote templates, which don't contain it).
  out = sub(out, TOKENS.massFirstName, vars.contactFirstName, '[first name]')
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
