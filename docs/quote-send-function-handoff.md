# NUForce V2 — `quote-send` Edge Function Handoff

**From:** Jordan / NUForce V2 rebuild
**To:** (backend / edge-functions dev)
**Purpose:** the one server-side piece NUForce V2 needs to send quote emails and follow-up emails. Everything else (composing, previewing, attachment selection, marking the quote sent, the follow-up clock, the audit of *which files* went out) is already built on the client. This function's job is narrow: **send the email via Resend and write the compliance audit row.**

This builds directly on the pattern you described in your handoff (`send-client-email` / `survey-send`), in the same shared Supabase project. Nothing new to provision.

---

## TL;DR

One function, `quote-send`. Two send kinds (`quote`, `follow_up`) that behave identically except for logging metadata. The client sends the **final** subject/body (already placeholder-filled) plus attachments as base64. The function verifies the caller, sends through Resend from `mail.nulabs.com` with reply-to the real employee, writes a `sent_emails` audit row, and returns the Resend id + status.

**No server-side preview action** — preview is live on the client (the body is an editable textarea the user sees before sending), so a server preview would be redundant. If you'd rather mirror `survey-send` exactly, an ignored `action:'preview'` that just echoes the filled body is fine, but not required.

---

## Invocation

V2 does **not** use `supabase-js` for the shared session (the shared `.nulabs.com` cookie wedges the SDK, per your SSO notes), so the client calls the function with a **raw `fetch`** carrying the standard headers:

```
POST https://swuuxzmgmldvvomsgmjf.supabase.co/functions/v1/quote-send
Headers:
  apikey: <anon publishable key>
  Authorization: Bearer <user access_token from the shared session>
  Content-Type: application/json
```

This is the same shape `functions.invoke()` produces, so `verify_jwt` on the function works normally. Please **verify the JWT** and resolve the caller from it (see Permissions).

---

## Request body

```jsonc
{
  "kind": "quote" | "follow_up",     // logging/metadata only; both just send
  "quoteId": "…",                     // the quotes.id this send belongs to
  "opportunity": "26-456C",           // for the audit row / subject fallback
  "to":  ["contact@customer.com"],    // array, one send → many recipients
  "cc":  ["someone@nulabs.com"],      // array, may be empty
  "subject": "…",                     // FINAL text, already filled
  "body": "…",                        // FINAL text, already filled (plain text; see note)
  "fromName": "Jane Tester",          // sender's display name
  "attachments": [                    // 0..n; Quote PDF is always present for kind:'quote'
    { "filename": "26-456C Quote.pdf", "contentBase64": "…", "mime": "application/pdf" }
  ]
}
```

Notes:
- **`body` is plain text** as composed. If Resend needs HTML, wrap/convert server-side (e.g. newline→`<br>`), or tell me and I'll send both `text` and `html`. Your call which is cleaner.
- The client does **not** send `fromEmail`/`replyToEmail` — derive them server-side from the verified caller so they can't be spoofed (see below). If you'd rather the client pass them, say so and I'll add them.

---

## From / reply-to convention (from your handoff)

Derive from the caller's employee record:
- `fromEmail = <localpart-of-employee-email>@mail.nulabs.com` (the verified send-only Resend subdomain)
- `replyToEmail = <employee's real @nulabs.com address>` so replies land in a real inbox
- `fromName` comes from the request (sender's display name); reconcile with the employee record if you prefer.

`RESEND_API_KEY` is already a project secret — please confirm this function can read it without re-adding.

---

## Permissions

Resolve the caller's `employees` row from the **verified JWT email** (`employees.email` / `personal_email`, case-insensitive — email is the join key, no `auth_user_id`).

**Rollout decision from Jordan:** quote sending is **open to all authenticated NUForce users for now** — do *not* hard-block on `nuforce_send_quotes` yet. Please still **build** the capability check (resolve role → `permission_roles.capabilities.nuforce_send_quotes`, with the legacy `permission_level` fallback map) and put it behind a flag/const so we can flip enforcement on before wide deploy. At minimum require a valid session + a resolvable employee record. The client mirrors this: send is visible to everyone now, capability-gated later.

This is the server-side half you flagged — the client gate alone isn't enough, since anyone with a session could call the function directly. Worth confirming whether `send-client-email`/`survey-send` already resolve+check server-side or rest on client trust; if not, that's the gap to close across the board.

---

## Audit logging (CMMC / NIST 800-171)

Write the send to the existing **`sent_emails`** table (one auditable comms table for the whole workspace), written **by the function** right after the Resend call — success *or* failure — so the audit is atomic with the send and can't be skipped by a client that dies mid-flow. (Your existing functions log client-side; for quote sends we'd prefer server-side for exactly the atomicity/enforcement reason. If you want to keep the client-side pattern for consistency, tell me and I'll write it from the client instead — but then the function must return everything the row needs.)

Suggested column mapping (reuse your schema; `project_id`/`client_id` point at the quote):
- `project_id` ← `quoteId`
- `to_email` ← `to.join(',')` (or first), `cc_emails` ← `cc`
- `subject`, `body` ← as sent
- `sent_by` / `sent_by_name` / `sent_by_email` ← resolved caller
- `template_id` ← null (templates are client-side editable in NUForce; see below)
- `resend_id` ← Resend response id
- `status` ← `sent` | `failed`
- add a `send_kind` = `kind` if you want quote-vs-followup filtering (or overload `warning_tier`; your call)

**Two things the function does NOT need to do** (the client handles them on a successful response, so please don't double-write):
1. Insert the `follow_ups` row that marks the quote sent + seeds the 30-day follow-up timeline.
2. Insert the `sent_documents` rows that record *which files* went out for re-download.

---

## Response

```jsonc
// success
{ "ok": true,  "resendId": "…", "status": "sent",   "sentAt": "2026-08-19T15:04:05Z" }
// failure (still logged as status:'failed' in sent_emails)
{ "ok": false, "status": "failed", "error": "human-readable reason" }
```

Return a non-2xx **only** for auth/validation failures (bad JWT, missing fields, permission denied); for a Resend delivery failure prefer `200` with `ok:false` + `error` so the client can show the reason without treating it as a transport error. Either way is workable — just let me know which so I match it.

---

## Templates

Templates are **user-editable in NUForce** (managers/senders can tweak wording), stored client-side, and the client fills placeholders (`{First Name of contact}`, `{Quote #}`, `{Test Item}`, sender name) before calling you. So the function receives final text and does **not** need a templates table or placeholder engine. If you'd prefer templates to live server-side like `survey-send`, we can move them — but the current plan keeps them in NUForce for in-app editing.

---

## Follow-up cadence (context, no action needed)

Follow-ups are **user-initiated from a list in NUForce**, not scheduled. A quote appears in the follow-up list 30 days after it's sent, and each "Send follow-up email" reschedules it +90 days (ported verbatim from Classic). So **no `pg_cron` is needed for v1** — the list is the queue and a human triggers each send (which calls this same function with `kind:'follow_up'`). If we later want unattended auto-nudges, that's a future cron that invokes this function; the function itself doesn't change.

---

## Open items for you to confirm

1. Function reads `RESEND_API_KEY` project secret without re-adding? (assumed yes)
2. `body` as plain text OK, or do you want `html` (and/or both)?
3. Derive `fromEmail`/`replyToEmail` server-side from the caller (preferred), or have the client pass them?
4. Audit row written **by the function** (preferred), or keep the client-side `sent_emails` write like the existing functions?
5. Resend failure → `200 {ok:false}` vs non-2xx — which do you want the client to expect?
6. Do `send-client-email`/`survey-send` already enforce the capability server-side, or is that trust currently on the client?

Ping me on any of these and I'll adjust the client to match exactly — the whole client side (composer, preview, attachments, mark-sent, follow-up reschedule, sent-files log) is already wired against this contract behind the app's master write switch.
