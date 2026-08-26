// ============================================================================
// Supabase Edge Function: resend-webhook
// Receives Resend webhook events and flags bounced/complained contacts.
// Path in Supabase: /functions/resend-webhook/index.ts
// ============================================================================
//
// PUBLIC endpoint — Resend calls this with no Supabase JWT.
//   → You MUST set "Verify JWT" = OFF for this function (dashboard setting).
//   → Security comes from Svix signature verification instead (see below).
//
// Required env vars / secrets:
//   SUPABASE_URL                (auto-provided by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY   (auto-provided by Supabase)
//   RESEND_WEBHOOK_SECRET       (the "whsec_..." signing secret shown in
//                                Resend's webhook config — add under
//                                Edge Function secrets)
//
// Behavior:
//   email.bounced    → if bounce.type !== 'Transient', mark contact invalid
//   email.complained → mark contact invalid (spam complaint)
//   everything else  → acknowledged and ignored (HTTP 200)
//
// Only the `contacts` table is touched. Recipients that don't match a row in
// `contacts` (employees, etc.) simply match zero rows and are ignored.
// Matching is an exact compare on `contacts.email` — Resend echoes the address
// exactly as we sent it, which is the value stored in that column.
//
// ── NUForce addition (2026) ────────────────────────────────────────────────
// On a hard bounce / complaint we ALSO reconcile the NUForce quote-send audit:
// the event's data.email_id equals the resend_id we stored in quote_sends when
// the quote/follow-up went out. We mark that row 'bounced'/'complained' and drop
// a flag on the quote so the sender sees "this one didn't land." Purely additive
// — the existing contacts logic is untouched. See the marked block below.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY           = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') || '';
const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY') || ''; // reused to send status alerts
const SENDING_DOMAIN        = 'mail.nulabs.com';        // verified Resend send-only subdomain
const OVERSIGHT_EMAIL       = 'jordanmcadoo@nulabs.com'; // always copied on problem alerts
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
// ── Svix signature verification (manual — no external dependency) ────────────
// Resend signs webhooks with the Svix scheme:
//   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
//   signature     = base64( HMAC-SHA256( secretBytes, signedContent ) )
// The svix-signature header is a space-delimited list of "v1,<sig>" entries.
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
// Constant-time comparison to avoid timing leaks
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifySignature(
  rawBody: string,
  id: string,
  timestamp: string,
  signatureHeader: string,
): Promise<boolean> {
  if (!RESEND_WEBHOOK_SECRET || !id || !timestamp || !signatureHeader) return false;
  // Replay protection: reject timestamps more than 5 minutes from now.
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) return false;
  // Secret is "whsec_<base64>"; strip the prefix and decode to raw key bytes.
  const rawSecret = RESEND_WEBHOOK_SECRET.startsWith('whsec_')
    ? RESEND_WEBHOOK_SECRET.slice(6)
    : RESEND_WEBHOOK_SECRET;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(rawSecret);
  } catch {
    return false;
  }
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(signedContent),
  );
  const expected = bytesToBase64(new Uint8Array(sigBuf));
  // Header: "v1,<sig> v1,<sig2> ..." — pass if any entry matches.
  return signatureHeader.split(' ').some((part) => {
    const idx = part.indexOf(',');
    if (idx === -1) return false;
    const version = part.slice(0, idx);
    const sig     = part.slice(idx + 1);
    return version === 'v1' && safeEqual(sig, expected);
  });
}

// ── NUForce addition: delivery-status alerts + audit reconcile ───────────────
type SendStatus = 'delivered' | 'bounced' | 'complained' | 'delayed';

// Email the send's owner about a delivery-status event; problems (bounce /
// complaint / delay) are also copied to oversight. Best-effort; needs RESEND_API_KEY.
async function sendStatusAlert(opts: {
  opportunity: string | null; recipient: string; status: SendStatus;
  reason: string; sendKind: string | null; sentByEmail: string | null;
}): Promise<void> {
  if (!RESEND_API_KEY) return;
  const isProblem = opts.status !== 'delivered';
  const to = Array.from(new Set(
    [opts.sentByEmail, ...(isProblem ? [OVERSIGHT_EMAIL] : [])]
      .map((e) => (e || '').trim())
      .filter((e) => e.includes('@')),
  ));
  if (!to.length) return;
  const kind = opts.sendKind === 'follow_up' ? 'Follow-up' : 'Quote';
  const statusLabel = opts.status === 'delivered' ? 'Delivered'
    : opts.status === 'bounced' ? 'Bounced'
    : opts.status === 'complained' ? 'Marked as spam'
    : 'Delivery delayed';
  const opp = opts.opportunity || '(no number)';
  const subject = `${kind} ${opp} — ${statusLabel}: ${opts.recipient}`;
  const body = [
    `${kind} email status update from NUForce.`,
    ``,
    `Quote:     ${opp}`,
    `Recipient: ${opts.recipient}`,
    `Status:    ${statusLabel}`,
    ...(opts.reason ? [`Detail:    ${opts.reason}`] : []),
    `Time:      ${new Date().toISOString()}`,
  ].join('\n');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `NUForce Delivery <notifications@${SENDING_DOMAIN}>`, to, reply_to: OVERSIGHT_EMAIL, subject, text: body }),
    });
  } catch (e) {
    console.error('resend-webhook: sendStatusAlert failed', e);
  }
}

// Reconcile the quote-send audit, flag the quote on hard problems, and alert the
// sender/oversight. Only NUForce quote/follow-up sends match (email_id ↔
// quote_sends.resend_id); anything else matches zero rows and is ignored.
async function reconcileAndNotify(emailId: string, recipient: string, status: SendStatus, reason: string): Promise<void> {
  if (!emailId) return;
  try {
    type Row = { quote_id: string | null; opportunity: string | null; send_kind: string | null; sent_by_email: string | null };
    let rows: Row[] | null = null;
    // Stamp the audit row for terminal statuses; delayed is transient, so just read.
    if (status === 'delayed') {
      const { data } = await sb.from('quote_sends').select('quote_id, opportunity, send_kind, sent_by_email').eq('resend_id', emailId);
      rows = data as Row[] | null;
    } else {
      const { data, error } = await sb
        .from('quote_sends')
        .update({ status, ...(status !== 'delivered' ? { error: reason } : {}) })
        .eq('resend_id', emailId)
        .select('quote_id, opportunity, send_kind, sent_by_email');
      if (error) console.error('resend-webhook: quote_sends update failed', error);
      rows = data as Row[] | null;
    }
    if (!rows || !rows.length) return; // not a NUForce quote/follow-up send
    const now = new Date().toISOString();
    for (const r of rows) {
      // Flag the quote so the sender sees it in-app — hard bounce / complaint only.
      if ((status === 'bounced' || status === 'complained') && r.quote_id) {
        const label = r.send_kind === 'follow_up' ? 'Follow-up email' : 'Quote email';
        const what = status === 'complained' ? 'was marked as spam' : 'bounced';
        const { error: fErr } = await sb.from('quote_flags').upsert({
          quote_id: r.quote_id, opportunity: r.opportunity ?? null, customer: null,
          flagged_by: 'resend_webhook', flagged_at: now,
          note: `${label} to ${recipient} ${what} — ${reason}`,
          resolved: false, resolved_by: null, resolved_at: null,
        }, { onConflict: 'quote_id' });
        if (fErr) console.error('resend-webhook: quote flag upsert failed', fErr);
      }
      await sendStatusAlert({ opportunity: r.opportunity, recipient, status, reason, sendKind: r.send_kind, sentByEmail: r.sent_by_email });
    }
    console.log(`resend-webhook: reconciled ${rows.length} quote_send(s) for email ${emailId} (${status})`);
  } catch (e) {
    console.error('resend-webhook: reconcileAndNotify threw', e);
  }
}
// ── end NUForce addition ─────────────────────────────────────────────────────

// ── NUForce Mass Emails: metrics reconcile (NEVER touches contacts) ──────────
// A mass-email blast records each recipient in `mass_email_recipients` with the
// Resend message id. If an incoming event's id matches one of those rows, we
// record its delivery status for metrics and STOP — mass-email bounces must
// never flag Bad Contacts (product requirement). Returns true when the event
// belonged to a mass email (handled here; caller must not fall through).
async function reconcileMassEmail(emailId: string, type: string, data: any): Promise<boolean> {
  if (!emailId) return false;
  try {
    const { data: rows, error } = await sb
      .from('mass_email_recipients')
      .select('id, status')
      .eq('resend_id', emailId)
      .limit(1);
    if (error) { console.error('resend-webhook: mass recipient lookup failed', error); return false; }
    if (!rows || !rows.length) return false; // not a mass-email message — fall through

    let newStatus = '';
    if (type === 'email.delivered') newStatus = 'delivered';
    else if (type === 'email.opened') newStatus = 'opened';
    else if (type === 'email.complained') newStatus = 'complained';
    else if (type === 'email.bounced') newStatus = data?.bounce?.type === 'Transient' ? '' : 'bounced';

    if (newStatus) {
      const cur = (rows[0].status || '').toString();
      // Never downgrade a meaningful terminal status back to 'delivered'.
      const keep = (cur === 'opened' || cur === 'bounced' || cur === 'complained') && newStatus === 'delivered';
      if (!keep) {
        const { error: uErr } = await sb
          .from('mass_email_recipients')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('resend_id', emailId);
        if (uErr) console.error('resend-webhook: mass recipient update failed', uErr);
      }
    }
    console.log(`resend-webhook: mass-email event ${type} for ${emailId} → ${newStatus || 'no-op'}`);
    return true; // handled — do NOT touch contacts or quote_sends
  } catch (e) {
    console.error('resend-webhook: reconcileMassEmail threw', e);
    return false;
  }
}
// ── end NUForce Mass Emails addition ─────────────────────────────────────────

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  // Read the RAW body — required for signature verification.
  // Do NOT JSON.parse before verifying; re-serialization breaks the signature.
  const rawBody = await req.text();
  const svixId        = req.headers.get('svix-id')        || '';
  const svixTimestamp = req.headers.get('svix-timestamp') || '';
  const svixSignature = req.headers.get('svix-signature') || '';
  const ok = await verifySignature(rawBody, svixId, svixTimestamp, svixSignature);
  if (!ok) {
    console.warn('resend-webhook: signature verification failed');
    return new Response('invalid signature', { status: 401 });
  }
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const type = event?.type as string | undefined;
  const data = event?.data || {};
  // `to` is a single-recipient array as of Jan 2026; tolerate a bare string too.
  const rawTo = Array.isArray(data.to) ? data.to[0] : data.to;
  const recipient = (rawTo || '').toString().trim();
  // The Resend message id — matches quote_sends.resend_id (NUForce addition).
  const emailId = (data.email_id || data.id || '').toString();
  // NUForce Mass Emails: if this id belongs to a mass-email blast, record its
  // metric and STOP before any contacts logic — mass-email bounces must never
  // flag Bad Contacts.
  if (await reconcileMassEmail(emailId, type || '', data)) return ack();
  let reason = '';
  let sendStatus: SendStatus | null = null;
  if (type === 'email.bounced') {
    const bounceType = data?.bounce?.type as string | undefined; // Permanent | Transient | Undetermined
    if (bounceType === 'Transient') {
      console.log(`resend-webhook: transient bounce for ${recipient}, skipping`);
      return ack();
    }
    const detail = data?.bounce?.subType || data?.bounce?.message || bounceType || 'unknown';
    reason = `hard_bounce: ${String(detail).slice(0, 200)}`;
    sendStatus = 'bounced';
  } else if (type === 'email.complained') {
    reason = 'spam_complaint';
    sendStatus = 'complained';
  } else if (type === 'email.delivered') {
    sendStatus = 'delivered';
  } else if (type === 'email.delivery_delayed') {
    reason = 'delivery_delayed';
    sendStatus = 'delayed';
  } else {
    // sent / opened / clicked / etc. — acknowledge and ignore.
    return ack();
  }
  if (!recipient || !recipient.includes('@')) {
    console.log(`resend-webhook: ${type} with no usable recipient, skipping`);
    return ack();
  }
  // Hard bounce / complaint: mark the contact's address invalid (existing logic;
  // delivered/delayed never touch contacts). Non-contact recipients match 0 rows.
  if (sendStatus === 'bounced' || sendStatus === 'complained') {
    const { data: updated, error } = await sb
      .from('contacts')
      .update({
        email_invalid:        true,
        email_invalid_at:     new Date().toISOString(),
        email_invalid_reason: reason,
      })
      .eq('email', recipient)
      .select('id');
    if (error) {
      console.error('resend-webhook: contacts update failed', error);
      // Return 500 so Resend retries with backoff (handles transient DB issues).
      return new Response('db error', { status: 500 });
    }
    console.log(`resend-webhook: ${type} → flagged ${updated?.length || 0} contact(s) for ${recipient} (${reason})`);
  }
  // NUForce: reconcile the quote-send audit, flag the quote on problems, and email
  // the sender (+ oversight on problems) about the delivery status.
  await reconcileAndNotify(emailId, recipient, sendStatus, reason);
  return ack();
});
function ack(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
