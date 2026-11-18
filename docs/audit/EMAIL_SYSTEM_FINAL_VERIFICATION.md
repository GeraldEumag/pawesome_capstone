# Email System — Final Production Verification

**Date:** 2026-11-18 · **Type:** independent verification of the previously reported implementation
**Method:** code re-inspection against claims, fresh test run, config & secret audit — not a rebuild.

---

## Phase 1 — Implementation verification

All claimed components verified present and functional:

| Claim | Verified | Evidence |
|---|---|---|
| Durable outbox + atomic claiming | ✅ | `EmailDeliveryService::send()` conditional UPDATE claim; `email_deliveries` migration |
| `SendEmailDelivery` on `emails` queue, `tries=1` | ✅ | `app/Jobs/SendEmailDelivery.php` |
| Brevo API transport | ✅ | `symfony/brevo-mailer` in composer.json; `Mail::extend('brevo')` in `AppServiceProvider` |
| Local SMTP transport | ✅ | `config/mail.php` smtp mailer; `.env` Brevo relay creds (gitignored) |
| Backoff/retry | ✅ | `BACKOFF_SECONDS [60,300,900]`; `next_attempt_at`; `max_attempts` |
| Dedup | ✅ | unique `(event_key, occurrence_key)` + `createOrFirst` |
| Suppression | ✅ | `EmailSuppression::blocks()` + descriptor-based `isSuppressed()` |
| Webhook reconciliation | ✅ | `BrevoWebhookController` → `recordProviderEvent()` |
| Admin monitoring | ✅ | `Admin\EmailDeliveryController` + `EmailDeliveries.jsx` page |
| Scheduler | ✅ | `:dispatch` every min, `:reconcile` every 10 min in `routes/console.php` |
| Auth cooldowns/enumeration safety | ✅ | token-row 60s cooldowns; generic responses |

### Defects found during verification (both fixed)

| ID | Severity | Defect | Fix |
|---|---|---|---|
| V-01 | **P1** | `GET /api/admin/email-deliveries/{id}` returned `suppression_checks` — the decrypted suppression descriptor, which for auth deliveries contains the **plaintext bearer token** (`token_row` checks). Live verify/reset tokens were disclosable to any admin. | Field removed; descriptor is never exposed (a code comment documents why). |
| V-02 | **P1** | Post-`sendNow` update unconditionally wrote `status=accepted` — a `delivered`/bounce webhook landing between provider acceptance and the local update would regress a terminal status. | Split into unconditional metadata write + conditional `status` transition guarded by `whereNotIn(status, TERMINAL_STATUSES)`; `provider_status`/`accepted_at` preserved if already set. |

### Discrepancies vs prior report

None material. The prior report did not disclose V-01/V-02 (introduced with the same change set) — now corrected.

## Phase 2 — Transport consistency

| Aspect | SMTP (`smtp` mailer) | Brevo API (`brevo` mailer) | Consistent? |
|---|---|---|---|
| Message-ID storage | Symfony-generated `Message-ID` header → `extractMessageId()` | API `messageId` response → `extractMessageId()` | ✅ same code path |
| `X-Mailin-custom` correlation header | literal MIME header over SMTP | custom header via API | ✅ transport-agnostic (`withSymfonyMessage`) |
| Failure classification | `TransportExceptionInterface` + message patterns | same classifier | ✅ |
| Retry/backoff/dedup/suppression | `EmailDeliveryService` (transport-independent) | same | ✅ |
| Webhook correlation | `X-Mailin-custom` uuid → `message-id` fallback | same | ✅ |

**Verdict:** switching `MAIL_MAILER` between `smtp` and `brevo` changes only the wire protocol — claim, retry, dedup, suppression, and reconciliation behavior are identical by construction (all live above the transport).

## Phase 3 — Webhook security audit

| Control | State |
|---|---|
| Signature/HMAC | Not available — **Brevo transactional webhooks have no HMAC** (verified against Brevo docs) |
| Shared secret | `BREVO_WEBHOOK_SECRET` via `X-Pawesome-Webhook-Secret` header or `?secret=` — Brevo webhook config supports custom headers (`headers` in create-webhook API) ✅ |
| Timing-safe compare | `hash_equals` ✅ |
| Fail-closed | empty env → 503 (never accepts unauthenticated events) ✅ |
| Payload validation | non-array/missing-`event` items skipped; `processed` count returned ✅ |
| Duplicate/replay | state-machine transitions — replays are no-ops; terminal never regresses ✅ |
| Correlation spoofing surface | attacker would need the secret AND a valid uuid/message-id — acceptable |
| Rate limiting | `throttle:60,1` — see O-1 below |
| Logging | delivery id + event name only; no recipient/payload logged ✅ |
| Unauthorized rejection | missing/wrong secret → 401 ✅ (tested) |

## Phase 4 — Suppression & reconciliation audit

| Requirement | State |
|---|---|
| Hard bounce → suppress | ✅ `hard_bounce`/`invalid_email`/`blocked` → suppression row |
| Complaint handling | ✅ `spam` → complaint status + `spam` suppression (non-auth scope) |
| Auth-email policy | ✅ reason-scoped: `hard_bounce`/`invalid`/`blocked`/`manual` block **all** sends incl. auth; `spam` blocks non-`auth.*` only (`auth.account_welcome`, `auth.password_reset`, `auth.email_verification` carry the `auth.` prefix — verified) |
| Duplicate suppression prevention | ✅ fingerprint unique + `firstOrNew`-style upsert; re-suppress after release restores the row |
| Terminal protection | ✅ both webhook (`isTerminal` gate) and send-path (V-02 guard) cannot regress terminal rows |
| Correlation | ✅ `X-Mailin-custom` uuid primary; `message-id` (bracket-normalized) fallback |
| Repeated-send prevention | ✅ `EmailSuppression::blocks()` runs before transport on every send |

## Phase 5 — Configuration readiness

| Var | State |
|---|---|
| `MAIL_MAILER` | `smtp` local (real sends); `brevo` documented for prod |
| `MAIL_FROM_ADDRESS` | Gmail (E-01 — pending domain) |
| `MAIL_REPLY_TO_*` | unset → listener correctly no-ops until a monitored mailbox exists |
| `MAIL_PHYSICAL_ADDRESS` | set via config default (clinic address) |
| `BREVO_API_KEY` | not needed for local SMTP; required for prod `brevo` transport — **manual** |
| `BREVO_WEBHOOK_SECRET` | set in local `.env`; must be mirrored in Brevo webhook config |
| `QUEUE_CONNECTION` | `sync` local; `database` + worker required in prod — **manual** |
| Scheduler | `schedule:run` required for dispatch/reconcile — **manual in prod** |
| Secrets | `.env` gitignored (verified); grep of tracked files → **no secret values committed**; docs use placeholders |

## Phase 6 — Automated regression (fresh run, `pawesome_test` MySQL)

| Suite | Tests | Result |
|---|---|---|
| BrevoWebhookTest | 13 | **PASS** |
| EmailSuppressionTest | 7 | **PASS** |
| EmailDeliveryOutboxTest | 14 | **PASS** |
| EmailAuthFlowTest | — | **PASS** |
| EmailServiceWorkflowTest | 11 | **PASS** |
| EmailPreferencesAndTemplatesTest | 5 | **PASS** |
| EmailStructuredContentTest | 12 | **PASS** |
| CustomerEmailResolverTest | — | **PASS** |
| Frontend `npm run build` | — | **PASS** (EmailDeliveries chunk emitted) |

**104 tests, 452 assertions, 0 failures** — re-executed after V-01/V-02 fixes.

## Phase 7 — External configuration checklist (nothing claimed complete)

- [ ] Domain purchased (e.g., `pawsomeretreat.com` — verify availability)
- [ ] Brevo → Senders, domains, IPs → domain verified
- [ ] SPF — merge `include:spf.brevo.com` into existing TXT (never a 2nd record)
- [ ] DKIM — Brevo-generated `mail._domainkey` TXT published
- [ ] DMARC — `_dmarc` `p=none` → `quarantine` → `reject` rollout
- [ ] `MAIL_FROM_ADDRESS` → `notifications@<domain>`; `MAIL_REPLY_TO_ADDRESS` → monitored mailbox
- [ ] Public webhook URL live (tunnel or Railway) + Brevo webhook configured with `X-Pawesome-Webhook-Secret`
- [ ] `BREVO_API_KEY` (REST `xkeysib-` key) in backend secrets; `MAIL_MAILER=brevo`
- [ ] `queue:work --queue=emails,receipts,default` supervised; `schedule:run` every minute
- [ ] Live checks: Mail-Tester, MXToolbox, Gmail/Outlook/Yahoo inboxes → SPF/DKIM/DMARC PASS in headers
- [ ] Rotate local SMTP key if ever exposed

## Phase 7b — Live-send evidence (2026-11-18, ~11:06 UTC)

Seven `demo:*` intents were fired through the real pipeline (outbox → `SendEmailDelivery` → Brevo SMTP) to a live Gmail recipient (`kiezerherristpascua@gmail.com`), covering every mailable type: `auth.email_verification`, `auth.password_reset`, `auth.password_changed`, `auth.account_welcome`, `lifecycle.appointment_approved`, `payment.receipt.service`, `payroll.payslip_released`.

**Result — delivery ✅, placement ❌:**

- 7/7 accepted by Brevo (provider message IDs stored); 0 lost, 0 duplicates.
- **1/7 landed Inbox** (password-changed notice); **6/7 landed Spam** (verify, reset, welcome, lifecycle, receipt, payslip).
- Local rows remain `accepted` — webhook `delivered` reconcile cannot fire on `localhost` (no public URL). Expected and documented.
- Auth-link emails (verify/reset) were generated with real token rows — links are functional, not stubs.

**Conclusion:** end-to-end transport is proven live; spam placement is direct, observable confirmation of finding E-01 (unaligned `gmail.com` sender through Brevo). This does not change the verdict — it *is* the predicted outcome — but it converts "unverified" into "verified-and-failing as designed, pending domain auth."

## Phase 8 — Final verdict

| Area | Status |
|---|---|
| Application implementation | ✅ **Ready** — all claimed features verified; V-01/V-02 fixed |
| SMTP/API transport reliability | ✅ **Ready** — identical behavior across transports; failures classified correctly |
| Webhook security | ✅ **Ready** — secret auth, timing-safe, replay-safe, fail-closed; pending only live endpoint config |
| Suppression reliability | ✅ **Ready** — reason-scoped, idempotent, pre-transport enforcement |
| Automated regression | ✅ **Passing** — 104 tests / 452 assertions, 0 failures |
| DNS authentication | ⬜ **Not started** — requires domain purchase; SPF/DKIM/DMARC unverifiable until then |
| Real inbox deliverability | 🔴 **Confirmed failing placement** — live Gmail test: 7/7 delivered, 6/7 to Spam (E-01); Inbox placement **cannot be claimed** until domain auth |
| Production deployment readiness | 🟡 **Conditional** — app-ready pending domain, DNS, prod env vars, worker/scheduler, and live webhook |

### Observations (non-blocking)

- **O-1** Webhook `throttle:60,1` could 429 under a >60 events/min burst (Brevo retries; irrelevant at current volume — revisit before high-traffic production).
- **O-2** `deferred` rows remain open until a follow-up provider event; truthful, but an admin may see indefinite `deferred` — informational only.
- **O-3** `payroll.payslip_released` is non-`auth.*` → a staff member's spam complaint suppresses payslip mail. Consistent with policy; flagged for product review.
- **O-4** `unsubscribed` events are acknowledged but not mapped to suppression (Brevo unsubscribe lists don't apply to transactional mail) — review if marketing mail is ever added.

**Bottom line:** the application-side email system is genuinely production-ready. Domain authentication and live deliverability verification remain the only gate — and until they are executed, guaranteed inbox placement cannot be claimed.
