# Pawesome Evaluation Evidence Index

**Purpose:** defense-ready index of verified evidence. Every claim below is
backed by a recorded artifact; unverified claims are listed explicitly under
Known Limitations. Local verification success is stated separately from
production/provider acceptance — they are different claims.

**Status basis:** Phases 0–6 implementation verified (backend suite 427 tests /
2,112 assertions, MySQL); Phase 7 email pipeline local PASS; Phase 8
browser/cross-role PASS; Phase 9 capstone demo PASS (frozen); Phase 10
production-readiness audit complete — blocked on external items only.

## 1. Cross-role workflow evidence (browser + API + database)

One continuous record through all seven roles — service request **#163** /
appointment **#47**, executed in ~50s against the live dev stack with a real
queue worker consuming email intents.

**Evidence pack:** `browser-evidence/phase9-capstone-demo/`
(`phase9-results.json`, 12 legs recorded, `status: PASSED` + 9 screenshots)

| Leg | Role transition | Screenshot |
|---|---|---|
| Provision consumable | Inventory creates `P9 Demo Antiseptic` (10 units) | — |
| `customer.submit` | Customer submits vet request | `01-customer-submitted.png` |
| `receptionist.approve` | Receptionist sees pending → approves + assigns vet | `02-receptionist-approved.png` |
| `customer.payment_proof` | Customer uploads GCash proof | — |
| `cashier.verify_service_request` | Cashier verifies → receipt `SR-REC-…-163` (₱500) | `03-cashier-verified.png` |
| `veterinary.start_and_usage` | Vet starts, records 1-unit usage (stock 10→9), finalizes record | `04-vet-in-progress.png` |
| `cashier.settle_items` | Cashier settles remaining ₱85 billed item | — |
| `veterinary.complete` | Completion gates pass (paid + finalized record) | — |
| `inventory.stock_verified` | Stock deduction + inventory log confirmed | `05-inventory-after.png`, `06-inventory-log.png` |
| `customer.final_state` | Customer sees paid status + receipt | `07-customer-paid.png` |
| `manager.reports` | Manager reports reflect the workflow | `08-manager-reports.png` |
| `admin.audit` | Admin activity logs show workflow entries | `09-admin-dashboard.png` |

**Supporting cross-role specs (all PASS):**

| Spec | Proves |
|---|---|
| `e2e/phase9-capstone-demo.spec.js` | The 12-leg thread above |
| `e2e/email-cross-role-workflow.spec.js` | Customer → receptionist → cashier → receipt email chain |
| `e2e/cross-role-main-workflow.spec.js` | Customer → receptionist → veterinary → manager |
| `e2e/phase11-state-changing-workflows.spec.js` | Create → approve → update → complete mutations |
| `e2e/email-preferences-toggle.spec.js` | Email preference OFF/ON persistence through real API |

Prior gate reports (module-level evidence): `browser-evidence/`
`cross-role-e2e-audit`, `security-rbac-audit`, `database-readiness-audit`,
`report-reconciliation-audit`, `browser-regression`, `storage-hardening`,
`final-uat` — each contains its own readiness report.

## 2. Email / notification evidence

**Architecture verified:** business event → `email_deliveries` intent
(in-transaction, encrypted recipient, `occurrence_key` dedup) → `emails`
database queue → `SendEmailDelivery` → provider acceptance → rendered mail.

**Local PASS evidence (Phase 7, dev stack + real `queue:work` worker):**

- Password reset request → generic HTTP response → intent row → real `jobs`
  row → worker processed `SendEmailDelivery` → `status=accepted` +
  `provider_message_id` + rendered reset mail in `laravel.log` (correct link,
  60-min expiry, shared layout).
- Preference semantics — all three layers proven live:
  1. Opt-out **before** event → zero intent rows, zero queue jobs, no email.
  2. Opt-in → intent → queue → worker → `accepted` + rendered mail.
  3. Opt-out **between** intent and worker pickup → worker rechecked →
     `status=suppressed`, never sent.
- Phase 9 run: **6 deliveries** consumed live (`submitted`,
  `appointment.created`, `approved`, `proof_submitted`, `payment.receipt`,
  `appointment.status`), `jobs=0`, `failed_jobs=0`.
- Preference UI round-trip proven in browser (OFF→reload→OFF, ON→reload→ON).

**Backend test coverage:** `EmailDeliveryOutboxTest`, `EmailAuthFlowTest`,
`EmailServiceWorkflowTest`, `EmailPreferencesAndTemplatesTest`,
`CustomerEmailResolverTest`, `PaymentReceiptOutboxTest`,
`PaymentSettlementTest`, `NotificationMatrixTest` (11 tests).

## 3. Financial / settlement evidence

- `payment_settlements` + `payment_settlement_items` — immutable, itemized,
  idempotent settlement ledger; two settlement rows produced during Phase 9
  (`service_request#163` ₱500 GCash booking; `veterinary#47` ₱85 GCash
  item-level).
- Receipt itemization comes from persisted settlement data; client-submitted
  monetary values are ignored in favor of server-authoritative amounts.
- Payment success, receipt persistence, and email delivery state are
  independent — a mail outage cannot un-pay a committed payment.
- Anonymous POS customers create no receipt intents (no trusted recipient).

## 4. RBAC / security evidence

- Canonical matrix: `docs/RBAC_PERMISSION_MATRIX.md` — receptionist approves
  operational requests; cashier verifies payments; inventory manages stock;
  veterinary executes services; manager monitors reports; admin monitors
  audit/system records.
- `tests/Feature/AuthorizationMatrixTest.php` — every unauthorized role gets
  `403` + no state change, plus composite-role semantics.
- Generic non-enumerating auth responses; hashed reset/verification tokens
  (60-min expiry); no plaintext credentials emailed; `admin` blocked from
  customer portal.

## 5. Known limitations and future enhancements

| Item | Classification | Detail |
|---|---|---|
| Appointment `partial` payment verification | Future enhancement (recorded, not a defect) | `PaymentVerificationService::verify` accepts `pending`/`unpaid` but not `partial`; once partially settled, the remainder is settled via `billing/items/mark-paid` (settlement, no receipt email). Receipt-email coverage for partial-balance settlement is a design gap for a future slice. |
| `xlsx` npm advisory (high) | Owner decision required | Generation-only usage reduces apparent surface; no fix available upstream; documented exception pending remediation plan. |
| Demo seed accounts | Deployment control | Must not be seeded into business production. |
| Legacy `backend/render.yaml` + nested `deploy.yml` | Pre-release check | Not canonical; confirm not attached to live services. |

## 6. External blockers — deployment prerequisites (NOT verified, NOT defects)

These require credentials, infrastructure, or decisions outside the codebase.
They are honestly open; no fake key/webhook/workaround was introduced.

| Blocker | Needed |
|---|---|
| `BREVO_API_KEY` unset — Brevo HTTPS API never exercised (local used Brevo SMTP relay) | REST API key via authorized env config |
| Sender is `@gmail.com` — SPF/DKIM/DMARC impossible | Owned domain + Brevo-verified sender |
| Brevo webhook endpoint not implemented | Approved event→`provider_status` mapping contract |
| No controlled recipient | Named real inbox for canary send |
| No supervised `queue:work` service / scheduler daemon | Production deployment |
| No failed-job monitoring/alerting | Ops decision |
| `APP_ENV=local`/`APP_DEBUG=true`; CORS/Sanctum localhost-only; `SESSION_SECURE_COOKIE` unset; storage = dev-local roots | Production env configuration per `docs/DEPLOYMENT.md` |
| No backup/restore drill | Verified backup + at least one test restore |
| `DEPLOYMENT_READINESS_REPORT.md` verdicts | Capstone Demo BLOCKED / Business Production BLOCKED until above closes |

## 7. Reproduction commands

```bash
# Backend suite (MySQL parity with CI)
mysql -u root -e "CREATE DATABASE IF NOT EXISTS pawesome_test;"
cd backend && php artisan test

# Capstone demo workflow (requires dev stack: backend :8000, frontend :3000)
cd frontend && npx playwright test e2e/phase9-capstone-demo.spec.js --reporter=list

# Email chain + preferences
npx playwright test e2e/email-cross-role-workflow.spec.js --reporter=list
npx playwright test e2e/email-preferences-toggle.spec.js --reporter=list
```
