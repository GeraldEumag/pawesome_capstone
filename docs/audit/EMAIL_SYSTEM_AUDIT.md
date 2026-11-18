# Email System Audit — Pawesome

**Date:** 2026-11-18 · **Scope:** full-stack email deliverability, reliability, and security audit + hardening pass
**Final classification:** *Production-ready pending external configuration* (sending domain + DNS)

---

## A. Executive Summary

Pawesome's email infrastructure is architecturally strong: every customer-facing email flows through a durable `email_deliveries` outbox recorded inside the business transaction, dispatched to a dedicated `emails` queue, sent synchronously per row with atomic claiming, backoff retries, occurrence-level dedup, encrypted recipients/payloads, and send-time suppression descriptors. Auth email flows are enumeration-safe with per-account cooldowns and token-supersession.

The audit found the deliverability problems live in **external configuration and two missing integration surfaces**, not the core design:

1. The sender is a personal Gmail address — SPF/DKIM/DMARC alignment is impossible for `gmail.com`, so inbox placement can never be guaranteed regardless of code quality (E-01; requires a real domain).
2. No provider webhook existed, so `delivered`/`bounced`/`complaint` outcomes could never be recorded — fixed in this pass (E-02).
3. No recipient suppression list — dead or complaining addresses would be re-mailed forever — fixed (E-03).
4. Missing Reply-To, missing admin observability, missing footer address, and misleading "sent" UI copy — all fixed (E-04…E-07).

## B. Existing email architecture (verified)

```
business event → EmailDeliveryService::intent() (in-transaction)
  → COMMIT → SendEmailDelivery job on `emails` queue (afterCommit)
  → queue:work → EmailDeliveryService::send() (atomic claim)
  → Laravel Mail (sendNow) → transport → provider
  → POST /api/webhooks/brevo ← provider events reconcile the row
```

- **Transports:** `brevo` HTTPS API (production; bridged via `symfony/brevo-mailer` in `AppServiceProvider`), `smtp` (local Brevo SMTP relay), `log` (dev), `array` (tests).
- **Scheduler:** `email-deliveries:dispatch` every minute, `email-deliveries:reconcile` every 10 min (`routes/console.php`).
- **Outbox invariants:** queued ≠ sent ≠ accepted ≠ delivered; `unknown` outcomes are never auto-resent; terminal statuses are final.

## C. Email workflows (all verified to exist)

| Workflow | Mailable | Trigger |
|---|---|---|
| Email verification | `EmailVerificationMail` | register, resend, email change |
| Password reset | `PasswordResetMail` | forgot-password |
| Password changed | `PasswordChangedMail` | reset consumed |
| Account welcome (set-password link) | `AccountWelcomeMail` | admin-created user |
| Lifecycle notifications (booking/appointment/boarding/order updates) | `CustomerNotificationMail` | `EmailDeliveryService::lifecycle()` producers |
| Payment receipt | `PaymentReceiptMail` | settlement confirmation |
| Payslip release | `PayslipReleasedMail` | `PayrollController::markAsPaid` |

No direct `Mail::` calls bypass the outbox (verified by grep). All 7 mailables render `emails/*` HTML + `emails/text/*` plain-text alternatives via the shared `emails.layout` (table layout, inline styles, no remote images).

## D. Mail configuration

| Item | State |
|---|---|
| `MAIL_MAILER` | `smtp` local / `brevo` production (per `.env.example`) |
| `MAIL_FROM_ADDRESS` | **personal Gmail locally** — verified single sender, but unaligned (E-01) |
| `MAIL_FROM_NAME` | `${APP_NAME}` |
| `MAIL_REPLY_TO_*` | **new** — applied globally by `ApplyMailReplyTo` listener |
| `BREVO_API_KEY` | required for production HTTPS transport (not set locally — SMTP is used) |
| `BREVO_WEBHOOK_SECRET` | **new** — authenticates `POST /api/webhooks/brevo` |
| `MAIL_PHYSICAL_ADDRESS` | **new** — footer address |
| `QUEUE_CONNECTION` | `sync` local; dedicated worker required in production |
| Secrets in repo | none — `.env` is gitignored (verified) |

## E. Findings

| ID | Severity | File/service | Root cause | Impact | Resolution |
|---|---|---|---|---|---|
| E-01 | Critical | `.env` `MAIL_FROM_ADDRESS` | gmail.com sender through Brevo | SPF/DKIM/DMARC can never align → spam/junk, "via" sender display | **Manual** — buy domain, verify in Brevo, publish DNS (runbook §H) |
| E-02 | High | routes/api.php | No provider webhook | `delivered`/`bounced`/`complaint` statuses unreachable; no outcome truth | **Fixed** — `BrevoWebhookController` + `recordProviderEvent()` |
| E-03 | High | — | No suppression list | Hard-bounced/complaining addresses re-mailed → reputation + quota burn | **Fixed** — `email_suppressions` + `EmailSuppression::blocks()` |
| E-04 | Medium | `app/Mail/*` | No Reply-To | Replies go nowhere; weaker legitimacy signal | **Fixed** — `MAIL_REPLY_TO_*` + `MessageSending` listener |
| E-05 | Medium | — | No admin observability | Ops cannot see delivery state without DB access | **Fixed** — admin API + `EmailDeliveries` page |
| E-06 | Medium | `emails/layout` | No physical address | Missing anti-spam legitimacy signal | **Fixed** — `MAIL_PHYSICAL_ADDRESS` footer line |
| E-07 | Low | `VerifyEmail.jsx`, `ForgotPassword.jsx` | "Email sent" copy + silent cooldown | Misleading (only queued); users spam the resend button | **Fixed** — "queued for sending" copy + 60s countdown |
| E-08 | Low | `.env` | Local SMTP vs prod `brevo` transport | Config drift between environments | **Accepted** — documented; intentional for local real-send testing |

## F. Implementation

### Files created

| File | Purpose |
|---|---|
| `database/migrations/2026_11_18_100000_create_email_suppressions_table.php` | Suppression list (fingerprint-unique, `released_at` soft-release) |
| `app/Models/EmailSuppression.php` | Reason-scoped suppression rules (`SUPPRESS_ALL_REASONS` vs `spam`) |
| `app/Http/Controllers/Webhooks/BrevoWebhookController.php` | Authenticated, idempotent provider-event consumer |
| `app/Http/Controllers/Admin/EmailDeliveryController.php` | Read-only delivery + suppression API |
| `app/Listeners/ApplyMailReplyTo.php` | Global Reply-To on `MessageSending` |
| `backend/tests/Feature/BrevoWebhookTest.php` | 13 tests — auth, events, idempotency, correlation |
| `backend/tests/Feature/EmailSuppressionTest.php` | 7 tests — scope rules, admin API/RBAC |
| `frontend/src/components/admin/EmailDeliveries.jsx` + `.css` | Admin monitoring page (30s auto-refresh, detail modal, suppressions panel) |

### Files modified

`EmailDeliveryService` (suppression check, `X-Mailin-custom` correlation header, `recordProviderEvent`) · `AppServiceProvider` (reply-to listener) · `config/mail.php` (`reply_to`, `physical_address`) · `config/services.php` (`brevo.webhook_secret`) · `routes/api.php` (webhook + admin routes) · `.env.example` (new vars + comments) · `emails/layout.blade.php` (footer address) · `AdminRoutes.jsx`, `AdminSidebar.jsx` (route + nav) · `VerifyEmail.jsx`, `ForgotPassword.jsx` (queued wording + resend countdown) · `docs/NOTIFICATION_MATRIX.md`, `docs/DEPLOYMENT.md`.

### New environment variables

`BREVO_WEBHOOK_SECRET` · `MAIL_REPLY_TO_ADDRESS` · `MAIL_REPLY_TO_NAME` · `MAIL_PHYSICAL_ADDRESS`

### Design decisions worth noting

- **Correlation:** `X-Mailin-custom` header carries the delivery `uuid` (echoed by Brevo in webhook payloads); `message-id` ↔ `provider_message_id` is the fallback.
- **Suppression scope (review-hardened):** `hard_bounce`/`invalid_email`/`blocked`/`manual` suppress **all** sends including auth (a dead mailbox cannot receive a reset link); `spam` suppresses non-`auth.*` sends only.
- **Integrity:** terminal statuses never regress; `delivered` is set only by a `delivered` event (never by `request`/`sent`); suppression insert is `createOrFirst`-style on the unique fingerprint; the webhook always returns 200 after auth+shape validation.
- **Auth:** Brevo webhooks have no HMAC — a shared secret via the `X-Pawesome-Webhook-Secret` custom header (or `?secret=`) is the control; empty env fails closed.

## G. Testing results (all executed, `pawesome_test` MySQL)

| Test | Expected | Result |
|---|---|---|
| BrevoWebhookTest (13) | secret auth, event→status map, uuid/message-id correlation, terminal non-regression, idempotent replay, batch payloads, suppression writes | **PASS** |
| EmailSuppressionTest (7) | reason-scoped blocking (incl. auth for hard bounce), release, admin list/detail/release API, RBAC 401/403 | **PASS** |
| EmailDeliveryOutboxTest (14) | existing outbox behavior unchanged | **PASS** |
| EmailAuthFlowTest | register/verify/resend/reset flows | **PASS** |
| EmailServiceWorkflowTest (11) | lifecycle producers | **PASS** |
| EmailPreferencesAndTemplatesTest (5) | opt-out gating, shared layout | **PASS** |
| EmailStructuredContentTest (12) | escaping, structured content | **PASS** |
| CustomerEmailResolverTest | recipient resolution | **PASS** |
| `npm run build` | EmailDeliveries chunk compiles | **PASS** (`EmailDeliveries-*.js` emitted) |

**Total: 104 tests, 452 assertions — all passing.** External deliverability tests (Mail-Tester, MXToolbox, real inboxes) are **not claimed** — they require a domain + live deployment; see §H.

## H. Remaining manual tasks

### 1. Sending domain (blocks E-01 — the top priority)

1. Buy a domain (e.g., `pawsomeretreat.com` — verify availability).
2. Brevo → **Senders, domains, IPs** → add domain → follow its verification flow.

### 2. DNS records (publish exactly what Brevo shows — do not invent)

- **SPF:** if a `TXT v=spf1` record already exists, **merge** `include:spf.brevo.com` into it — never create a second SPF record. Otherwise create: `v=spf1 include:spf.brevo.com ~all`
- **DKIM:** publish the `mail._domainkey` TXT record(s) exactly as generated in Brevo → domain → DKIM.
- **DMARC rollout:** `_dmarc` TXT → start `v=DMARC1; p=none; rua=mailto:postmaster@<domain>` → review reports → `p=quarantine` → `p=reject` only when legitimate sources pass.
- Update `MAIL_FROM_ADDRESS` to `notifications@<domain>` and set `MAIL_REPLY_TO_ADDRESS` to a monitored mailbox.

### 3. Brevo webhook (needs a public URL — tunnel or deployed backend)

- Brevo → **Transactional → Webhooks** → URL `https://<api-host>/api/webhooks/brevo` → events: delivered, hardBounce, softBounce, deferred, blocked, spam, invalid, error → custom header `X-Pawesome-Webhook-Secret: <same value as BREVO_WEBHOOK_SECRET>` → set `BREVO_WEBHOOK_SECRET` in env.

### 4. Production env & runtime (Railway)

`MAIL_MAILER=brevo` + `BREVO_API_KEY` (REST key, `xkeysib-` — **not** the SMTP `xsmtpsib-` key) · `QUEUE_CONNECTION=database` + supervised `queue:work --queue=emails,receipts,default` · scheduler for `schedule:run` every minute · rotate the local SMTP key if it was ever exposed.

### 5. Deliverability verification (after domain + DNS)

Mail-Tester score · MXToolbox SPF/DKIM/DMARC checks · Gmail/Outlook/Yahoo test inboxes — inspect headers for `SPF=PASS`, `DKIM=PASS`, `DMARC=PASS` · Brevo Deliverability Center.

### 6. Brevo security posture

Keep Authorized-IP restriction **deactivated** for XAMPP dev and Railway (no static egress IP); protect keys as secrets instead. Generate a `BREVO_API_KEY` before production deploy.

## I. Final assessment

**Production-ready pending external configuration.** The application-side email pipeline — outbox, queue, retry, suppression, webhook reconciliation, observability, security — is implemented and tested. What cannot be completed in code: the sending domain, its DNS authentication, and live provider verification. Until those land, legitimate transactional mail will send and often arrive, but inbox placement cannot be guaranteed — and must not be claimed.
