# quote-send — deploy notes

Sends NUForce quote + follow-up emails via Resend and writes a `quote_sends`
audit row. Contract: `docs/quote-send-function-handoff.md`.

## Prerequisites (one-time)

1. **Resend secret** — already set project-wide as `RESEND_API_KEY`. Confirm:
   ```
   supabase secrets list
   ```
   If missing:
   ```
   supabase secrets set RESEND_API_KEY=***your-resend-key***
   ```
   Do NOT put the key in the code — the function reads it from the environment.

2. **Audit table** — run `db/quote_sends.sql` in the SQL editor (once).

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — no need to set them.

## Deploy

From the project root (with the Supabase CLI logged in and linked):
```
supabase functions deploy quote-send --no-verify-jwt
```

**IMPORTANT — Verify JWT must be OFF for this function.** It's called from the
browser, and the CORS *preflight* (OPTIONS) carries no Authorization header, so
the platform-level "Verify JWT" gate rejects it before our code runs — the
browser then reports `Failed to fetch`. The function verifies the caller's JWT
itself (it calls `/auth/v1/user` and 401s an invalid token), so security is
unchanged. Deploy with `--no-verify-jwt`, or in the dashboard: Edge Functions →
quote-send → Details → turn **Verify JWT** off. (Same setting the resend-webhook
uses, and for the same CORS reason.)

## Verify

The app calls it automatically, but you can smoke-test with curl (uses a real
user access token as the bearer):
```
curl -i -X POST "https://<PROJECT-REF>.supabase.co/functions/v1/quote-send" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <A_USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"quote","quoteId":"<a-real-quote-id>","opportunity":"TEST","to":["you@nulabs.com"],"cc":[],"subject":"quote-send smoke test","body":"hello","fromName":"Tester","attachments":[]}'
```
Expect `{"ok":true,"resendId":"...","status":"sent","sentAt":"..."}` and a row in
`quote_sends`. The email arrives from `<you>@mail.nulabs.com` with reply-to your
real address.

## Rollout / permissions

`ENFORCE_SEND_CAPABILITY` is `false` at the top of `index.ts` — send is open to
all authenticated NUForce users for now (Jordan's decision). Flip it to `true`
to require the `nuforce_send_quotes` capability once roles are assigned; the
check is already wired.

## Notes

- The client sends the final subject/body (placeholders already filled) plus
  base64 attachments; the function sends verbatim. `body` is plain text — Resend
  gets it as `text`. Switch to `html` here if you'd rather send HTML.
- The **Budget PDF is never attached** — that's enforced on the client (it's
  never offered), so nothing to do here.
- `from` = `<sender-localpart>@mail.nulabs.com`, `reply_to` = the sender's real
  `@nulabs.com` address, resolved from the `employees` row.
