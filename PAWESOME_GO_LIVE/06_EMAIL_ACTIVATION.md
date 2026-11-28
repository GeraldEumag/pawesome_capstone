# 06 — Email / Brevo Activation

**Status: PENDING USER ACTION** — requires Brevo account, API key,
verified sender. No emails can be sent until configured.

## Activation checklist

| # | Item | Status | Action |
| --- | --- | --- | --- |
| E-1 | Brevo account + REST API key | ⏳ | app.brevo.com → SMTP & API → API Keys (REST key, not SMTP key) |
| E-2 | Verified sender | ⏳ | Senders page → add `MAIL_FROM_ADDRESS` (single-sender verify works without domain) |
| E-3 | Backend env vars | ⏳ | `MAIL_MAILER=brevo`, `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `BREVO_WEBHOOK_SECRET` (optional) |
| E-4 | Custom domain auth | ⏳ optional | Brevo → Domains → publish exact SPF/DKIM/DMARC records it generates — do NOT invent values |
| E-5 | Delivery webhook | ⏳ optional | If enabled: point Brevo webhook at backend endpoint; `BREVO_WEBHOOK_SECRET` already enforced in `BrevoWebhookController` |

## Verified code-side readiness (no action needed)

- Durable outbox: `email_deliveries` intents created inside business
  transactions; `email-deliveries:dispatch` every minute publishes to
  `emails` queue; `SendEmailDelivery` job sends via Brevo mailer.
- `email-deliveries:reconcile` every 10 min repairs stale rows;
  `email-deliveries:retry` for manual retry.
- Dedup via `occurrence_key`; encrypted recipients; send-time
  suppression re-check (`email_suppressions` table).
- Mailables: verification, reset, welcome, lifecycle, payslip-release,
  payment-receipt — all flow through outbox.
- `MAIL_MAILER` fallback `log` — safe if Brevo unset (emails logged,
  not sent; outbox rows stay pending→visible for retry).

## Controlled test plan (post-config, designated test recipient only)

| Test | Steps | Expected evidence |
| --- | --- | --- |
| T-1 Verification email | Register test customer → check inbox + `email_deliveries` row `sent` | Email received; link verifies account |
| T-2 Password reset | Forgot-password on test account | Reset email received; reset completes |
| T-3 Booking notification | Test booking → customer + staff notification | Emails dispatched via outbox |
| T-4 Receipt/payment email | Test POS sale with customer | `PaymentReceiptMail` sent |
| T-5 Failure handling | Temporarily invalid key → observe `failed` state + reconcile recovery | Delivery row shows failure; retry works after fix |
| T-6 Webhook (if enabled) | Brevo delivery events → `BrevoWebhookController` | Secret-authenticated; statuses recorded |

**Never send to real customers during testing.**

## Queue dependency

With `QUEUE_CONNECTION=database` (recommended), emails send via worker
(report 07). With `sync`, they send inline — works but couples mail
latency to requests.

**Status: BLOCKED on Brevo credentials — code fully ready.**
