# 06 — Email, Notification and Queue Readiness

## Email architecture (verified in code)

Durable **outbox pattern** — the strongest possible design for this
scale:

1. Producer creates an `email_deliveries` intent row **inside the
   business transaction** (verification, password reset, welcome,
   lifecycle notifications, payslip-release, payment receipts —
   `AccountWelcomeMail`, `CustomerNotificationMail`,
   `EmailVerificationMail`, `PasswordChangedMail`, `PasswordResetMail`,
   `PaymentReceiptMail`, `PayslipReleasedMail`).
2. `email-deliveries:dispatch` (scheduled **every minute**) publishes
   pending intents to the `emails` database queue.
3. `App\Jobs\SendEmailDelivery` renders + sends via configured mailer.
4. `email-deliveries:reconcile` (every 10 min) repairs stale
   `processing` rows (crash after possible provider acceptance).
5. `email-deliveries:retry` command exists for manual retry.

### Reliability properties (verified)

- **Dedup:** `occurrence_key` unique per logical send — retries cannot
  double-send.
- **Concurrency-safe:** claim/send/retry semantics in
  `EmailDeliveryService` — concurrent workers cannot double-send;
  job `$tries = 1` deliberately (retry governed by the delivery row,
  not the job).
- **Suppression:** hard-bounce/complaint/provider suppressions stored
  in `email_suppressions`; recipient checked at intent creation AND
  re-checked at send time (`Crypt`-encrypted suppression descriptors).
- **Privacy:** recipients stored encrypted; opt-out honored via
  `notification_preferences.email` checked twice (intent + send).
- **Failure isolation:** mail failure never corrupts the business
  transaction — intent row survives, reconcile/dispatch retry it.

## Mailer configuration

- `MAIL_MAILER=brevo` → `symfony/brevo-mailer` HTTPS API transport
  (no SMTP). `MAIL_MAILER` fallback = `log` (safe).
- Required env: `BREVO_API_KEY`, `MAIL_FROM_ADDRESS` (must be a
  Brevo-verified sender), `MAIL_FROM_NAME`, optional
  `MAIL_REPLY_TO_*`, `MAIL_PHYSICAL_ADDRESS`, `BREVO_DOMAIN` (only if
  Brevo assigns regional endpoint), `BREVO_WEBHOOK_SECRET` for delivery
  events.
- **Domain authentication (SPF/DKIM/DMARC):** code-side is ready
  (custom sending domain supported via `MAIL_FROM_ADDRESS` +
  `BREVO_DOMAIN`); DNS records **cannot be verified without domain
  access — NOT VERIFIED**. Owner action: add domain in Brevo → publish
  SPF/DKIM/DMARC → set `MAIL_FROM_ADDRESS`. Single-sender verification
  works without a domain for the capstone demo.
- No hardcoded dev email addresses found in mailables; templates use
  `FRONTEND_URL` for links.

## Queue readiness

| Aspect | State |
| --- | --- |
| Driver | `database` queue (default) or `sync` for demo; Redis supported |
| Job | `SendEmailDelivery` → `emails` queue, timeout 30s |
| Idempotency | `IdempotencyKey` middleware + `idempotency_keys` table (30-day prune scheduled) on payment mutations |
| Failed jobs | Laravel `failed_jobs` table + `queue:failed`/`queue:retry` standard tooling |
| Other jobs | `ProcessReceiptScan` (AI receipt OCR) — async, cashier-confirm gated |
| Worker command | `php artisan queue:work --queue=emails,receipts,default` |

**Critical deploy decision:** with `QUEUE_CONNECTION=sync` (the
documented demo setting) the outbox dispatch runs **inline** — mail is
sent during the scheduler run/web request, acceptable for demo but adds
Brevo latency to requests and offers no retry isolation. **Production
recommendation: `QUEUE_CONNECTION=database` + a supervised worker**
(`queue:work --queue=emails,receipts,default`). Without the scheduler
running, pending intents accumulate silently — scheduler is mandatory
(report 07).

## Notification matrix

`docs/NOTIFICATION_MATRIX.md` documents the full matrix; code verified:
customer lifecycle emails, booking/appointment notifications, payment
receipts, payslip releases, staff workflow notifications
(`WorkflowNotifier`), chatbot transcripts (retention-pruned). In-app
`notifications` table + scheduled reminders (`notifications:send-reminders`
hourly, deduped by `reminder_sent_at`).

## Testing note

`MAIL_MAILER=array` + `Mail::fake()` in tests; `NotificationMatrixTest`
covers the matrix (green in suite). **Live Brevo delivery NOT VERIFIED**
— requires production API key + verified sender (owner action).

**Status: PASS (architecture) / PARTIALLY VERIFIED (live delivery —
needs Brevo credentials + domain decision at deploy).**
