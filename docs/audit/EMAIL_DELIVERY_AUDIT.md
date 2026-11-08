# Email Delivery Audit — 2026-10-25

## Verified architecture (source + tests)
- Outbox: every customer-facing mail writes an `email_deliveries` intent inside the business txn → `email-deliveries:dispatch` → `emails` DB queue → `App\Jobs\SendEmailDelivery` renders+sends → `:reconcile` handles stale states.
- Dedup via `occurrence_key`; encrypted recipients; opt-out re-checked at send time; `queued ≠ sent ≠ delivered` semantics.
- Flows traced: register→verify (60-min hashed token), resend (generic, no enumeration), forgot/reset (60-min, generic errors), admin create→welcome set-password link (never plaintext), payment receipts, lifecycle notices.
- `EmailAuthFlowTest` + 808-suite green.

## Sync-queue behavior (Hostinger mode)
`QUEUE_CONNECTION=sync` runs `SendEmailDelivery` inside the request → slower responses; provider failure surfaces as request error but intent stays queued/retryable via scheduler. Exactly-once NOT guaranteed (provider-accept + lost response could retry → provider-side dedup is the mitigation; Brevo generally dedupes identical payloads poorly — at-least-once is the honest guarantee).

## Hostinger requirements
- Cron `* * * * * php /home/<user>/pawesome/backend/artisan schedule:run` — verify via `php artisan schedule:list` and a test run.
- Outbound HTTPS to api.brevo.com:443 must be permitted — verify with `curl -sI https://api.brevo.com` over SSH.

## Mailbox-delivery status: UNPROVEN
Provider accepted dispatch in prior tests, but test domains were non-routable. Requires: new Brevo key, **verified sender**, and ideally a real domain (hostingersite.com cannot get DKIM/SPF → expect spam folder during demo). Test matrix in DEPLOYMENT_HOSTINGER.md §7.
