# 09 — Brevo Email Activation (Live Verified)

Date: 2026-11-28 · Provider: Brevo HTTPS API (`MAIL_MAILER=brevo`)

## Live delivery evidence (executed against production)

| # | Test | Trigger | Outbox record | Provider result |
|---|---|---|---|---|
| 1 | Customer email verification | `POST /api/auth/register` (smoke user id 52) | `email_deliveries` id 442, `auth.email_verification`, occurrence_key dedup `auth.verify:52:…` | **accepted** — `provider_message_id <202611281055.92576608513@smtp-relay.mailin.fr>` |
| 2 | Password reset | `POST /api/auth/password/forgot` | id 445, `auth.password_reset` | **accepted** — `<202611281058.33000650113@smtp-relay.mailin.fr>` |
| 3 | Booking notification | `POST /api/customer/appointments` ×2 (ids 30, 31) | ids 443, 444, `appointment.created` | **accepted** ×2 |

Pipeline proven end-to-end: business action → outbox intent (encrypted recipient + fingerprint, dedup key) → `email-deliveries:dispatch` (scheduler, every minute) → `emails` database queue → `SendEmailDelivery` job → Brevo API → `provider_status=accepted`.

## Queue/worker evidence

- Backlog of 12 jobs drained via `queue:work database --queue=emails,receipts,default` — all `DONE`, `jobs=0`, `failed_jobs=0`.
- Recurring drain now scheduled every minute (`queue:work --stop-when-empty --max-time=55`, commit `20fe0c53`) — verified executing in deploy logs.
- Historical deliveries show prior `accepted` statuses (Nov 19) — provider integration was already functional; this engagement re-verified it live.

## Test recipient

`kiezerherristpascua+smoke<ts>@gmail.com` — Gmail plus-alias of the configured sender mailbox (designated internal test mailbox). **Inbox placement is the one thing I cannot verify — please confirm the three emails arrived (incl. spam folder).**

## Not verified / pending

| Item | Status |
|---|---|
| Brevo webhook (`BREVO_WEBHOOK_SECRET`) | ❌ **not set** — webhook endpoint exists (`POST /api/webhooks/brevo`, secret-authenticated); delivery-event reconciliation via webhook cannot be exercised until the owner sets the secret in Railway env + Brevo dashboard |
| SPF/DKIM/DMARC | ⚠️ sender is a Gmail address verified as a Brevo sender — Brevo signs with its own DKIM; inbox placement test will reveal any domain-auth gaps. A real sending domain is still recommended (documented requirement) |
| Provider failure/retry | ✅ architecture verified (outbox statuses, `failure_class`/`failure_code`, `failed_jobs`, reconcile command); no live failure induced — non-destructive choice |

## Honest assessment

**Provider acceptance is verified for all three email classes.** Inbox delivery is probable but unconfirmed — the distinction between "Brevo accepted" and "delivered to inbox" is preserved per the engagement rules.
