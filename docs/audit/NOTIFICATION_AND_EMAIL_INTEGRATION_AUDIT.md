# Notification & Email Integration Audit

**Date:** 2026-11-17

## In-app notifications

`notifications` table drives per-role feeds; events covered by tests/e2e: request submit/approve/reject, schedule changes, payment submit/verify/reject, order updates, appointment completion, low-stock, payroll release.

## Email pipeline (durable outbox — verified architecture)

`email_deliveries` intent (created inside the business transaction) → `email-deliveries:dispatch` → `emails` queue → `SendEmailDelivery` job renders mailable → mailer. Occurrence-key dedup; encrypted token payloads; opt-out re-checked at send time.

| Check | Evidence | Result |
| --- | --- | --- |
| Flows: verify, reset, welcome (set-password), lifecycle notices, payslip-release, payment receipts | `EmailAuthFlowTest`, `Phase4InventoryPayslipTest` | PASS |
| No plaintext credentials ever mailed | welcome uses reset-token link | PASS |
| `queued ≠ sent` semantics | outbox states distinct; reconcile command | PASS |
| Recipient correctness + preferences | `CustomerNotificationMail` honors `notification_preferences.email` at intent AND send | PASS |
| ₱ formatting in emails | `₱` + `number_format(x,2)` verified | PASS |
| Failed jobs observable | `failed_jobs` + `email-deliveries:reconcile` | PASS |
| No secrets in code | Brevo key via `BREVO_API_KEY` env only | PASS |
| Mailbox delivery | **NOT VERIFIED** — array/log mailer used; no real-provider delivery claim | BLOCKED (env) |

## Production note

`QUEUE_CONNECTION=sync` + `MAIL_MAILER=log/smtp` locally. Business production needs supervised `queue:work`, scheduler, real provider — deployment item, not demo blocker.
