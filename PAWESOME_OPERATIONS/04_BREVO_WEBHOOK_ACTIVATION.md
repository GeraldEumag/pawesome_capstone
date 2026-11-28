# 04 — Brevo Webhook Activation

**Status:** PASS (application side) / BLOCKED on provider-side registration (user action required)
**Date:** 2026-11-28 · Env: `BREVO_WEBHOOK_SECRET` set on Railway (deploy `80b23c34`)

## Implementation audit (pre-existing, verified — no code changes needed)

`POST /api/webhooks/brevo` → `App\Http\Controllers\Webhooks\BrevoWebhookController`
(`routes/api.php`, `throttle:60,1`).

| Concern | Implementation | Assessment |
|---|---|---|
| Authentication | Shared secret via `X-Pawesome-Webhook-Secret` header or `?secret=`; `hash_equals` compare; `BREVO_WEBHOOK_SECRET` env → `config('services.brevo.webhook_secret')` | ✅ Matches Brevo's supported mechanism — Brevo transactional webhooks support **custom headers**; no HMAC exists, so shared-secret header is the correct choice (not invented) |
| Unconfigured state | Returns 503 + error log | ✅ was live before secret was set (verified: 503 → now 401/200) |
| Payload handling | Single object or JSON array (batched); non-array items skipped | ✅ |
| Event validation | Requires non-empty string `event`; unknown events logged, still 200 | ✅ |
| Correlation | `X-Mailin-custom` header (delivery uuid stamped at send) → fallback `message-id` → `provider_message_id` lookup | ✅ |
| Status updates | `EmailDeliveryService::recordProviderEvent` — terminal statuses **never regress**; `delivered`/`hard_bounce`/`invalid_email`/`spam`/`blocked`/`error`/`soft_bounce`/`deferred` mapped | ✅ idempotent — replays are no-ops |
| Duplicate events | Terminal-state guard makes every replay a no-op; always 200 after auth so Brevo doesn't retry-storm | ✅ |
| Suppression | `hard_bounce`/`invalid_email`/`blocked`/`spam` → `EmailSuppression::suppress` even when delivery can't be correlated | ✅ |
| Failure handling | Unknown delivery → warning log, still 200; malformed JSON → `processed:0` | ✅ |
| Sensitive logging | Logs delivery id + event + status only — no recipient address | ✅ |

## Live verification (production, 2026-11-28)

Secret generated (`secrets.token_urlsafe(32)`), stored in
`PAWESOME_OPERATIONS/.brevo_secret.tmp` (**gitignored**), set via
`railway variables --set BREVO_WEBHOOK_SECRET=…`.

| Test | Request | Result |
|---|---|---|
| No/invalid auth | POST `{}` wrong secret | **401** `Unauthorized` |
| Valid auth, empty event | header secret, `{}` | 200 `{"processed":0}` |
| Valid auth, unknown uuid `delivered` | synthetic event, nonexistent uuid | 200 `{"processed":1}` — logged "did not match a delivery", **no state corruption** |
| Malformed body | `not-json{{{` + valid secret | 200 `{"processed":0}` — graceful |
| Duplicate event | same unknown-uuid event twice | 200 both times — idempotent |

Before the env var was set, the same endpoint returned **503
"Webhook not configured"** — confirming the config path is live now.

## Remaining step — USER ACTION REQUIRED (Brevo dashboard)

The application side is fully verified. To receive real provider events,
register the webhook in Brevo (I cannot access your Brevo account):

1. Brevo dashboard → **SMTP & API → Webhooks** (or Transactional → Webhooks)
   → add webhook for **transactional email** events.
2. URL: `https://pawesome-production-c73a.up.railway.app/api/webhooks/brevo`
3. Events: enable at minimum `delivered`, `hard_bounce`, `soft_bounce`,
   `blocked`, `spam`, `invalid_email`, `error`, `deferred` (the controller
   handles all of these; unlisted events are ignored safely).
4. **Custom header:** `X-Pawesome-Webhook-Secret: <value stored in
   PAWESOME_OPERATIONS/.brevo_secret.tmp>`
   (Brevo webhook settings support custom headers; alternatively append
   `?secret=<same value>` to the URL — header is preferred, keeps the
   secret out of URLs/logs).
5. Save, then send a real email (e.g. password-reset to your own mailbox)
   and watch `email_deliveries.provider_status` move from `accepted` →
   `delivered`.

## Post-registration verification checklist

- [ ] `delivered` event flips an outbox row `accepted → delivered`
- [ ] `hard_bounce` to a bad address creates an `email_suppressions` row
      and blocks future sends to that fingerprint
- [ ] Replayed event does not regress terminal status
- [ ] Brevo dashboard shows successful (2xx) deliveries, no retry storm

## Notes

- Secret rotation: update Railway var + Brevo header together; old secret
  fails closed (401).
- The `?secret=` fallback exists for providers that can't set headers —
  prefer the header to avoid secrets in access logs.
