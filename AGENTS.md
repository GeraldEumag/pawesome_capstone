# Pawesome Capstone — Agent Guide

## Project Overview

Pawesome is a pet care management system with role-based access for 7 roles:
customer, receptionist, cashier, inventory, veterinary, manager, admin.

Two composite "super" roles extend the base roles:
- `super_admin` — all staff modules (admin + manager + receptionist + cashier + inventory + vet). Customer portal blocked.
- `super_receptionist` — receptionist + cashier + inventory combined.

## Architecture

- **Backend:** Laravel 12 (PHP 8.2+) at `backend/`
- **Frontend:** React 18 + Vite at `frontend/`
- **Database:** MySQL
- **Auth:** Laravel Sanctum personal access tokens + custom ApiTokenAuth middleware
- **E2E Tests:** Playwright at `frontend/e2e/`

## Key Commands

### Backend
```bash
cd backend
composer install
php artisan migrate --seed          # Local/demo initialization only
php artisan serve --host=127.0.0.1 --port=8000
php artisan route:cache              # Production route caching
php artisan view:cache               # Production view caching
php artisan config:cache             # Production config caching
```

### Frontend
```bash
cd frontend
npm install
npm run dev                          # Dev server on port 3000
npm run build                        # Production build to build/
```

### E2E Tests
```bash
cd frontend
npx playwright test                  # Run all E2E tests
npx playwright test e2e/pawesome-role-smoke-audit.spec.js --reporter=list
npx playwright test e2e/cross-role-main-workflow.spec.js --reporter=list
```

### Audit Scripts
```bash
cd backend
php pawesome_cross_role_e2e_audit.php          # Gate A: Cross-role E2E
php pawesome_security_rbac_audit.php           # Gate B: Security & RBAC
php pawesome_database_readiness_audit.php      # Gate C: Database readiness
php pawesome_report_reconciliation_audit.php   # Gate D: Report reconciliation
```

## Test Credentials

| Role | Email | Password |
| --- | --- | --- |
| admin | admin@example.com | Password123! |
| super admin | super_admin@example.com | Password123! |
| manager | manager@example.com | password123 |
| cashier | cashier@example.com | password123 |
| receptionist | receptionist@example.com | Password123! |
| super receptionist | super_receptionist@example.com | Password123! |
| inventory | inventory@example.com | Password123! |
| veterinary | vet@example.com | Password123! |
| customer | customer@example.com | Password123! |

## Email & Verification

Transactional email covers: customer email verification, password reset links,
and customer notifications (`CustomerNotificationMail`).

### Flow

- `POST /api/auth/register` → creates customer (`email_verified_at = null`) →
  hashed token in `email_verification_tokens` (60-min expiry) → queued
  `EmailVerificationMail` → link `{FRONTEND_URL}/verify-email?token=…&email=…`
- `POST /api/auth/email/verify` → sets `email_verified_at`, deletes token
- `POST /api/auth/email/resend` → generic response (no account enumeration)
- `POST /api/auth/password/forgot` → hashed token in `password_reset_tokens`
  (60-min expiry) → queued `PasswordResetMail` → link
  `{FRONTEND_URL}/forgot-password?email=…&token=…`
- `POST /api/auth/password/reset` → generic "invalid or expired" errors
  (no account enumeration)
- `verified` middleware (`EnsureEmailIsVerified`) blocks unverified **customers**
  from all booking/checkout POSTs; staff roles are exempt. Login is allowed —
  React redirects unverified customers to `/verify-email`.
- Changing email via `PUT /api/auth/profile` re-triggers verification
  (customers only).
- `POST /api/admin/users` (admin-created accounts) → `AccountWelcomeMail` with
  a set-your-own-password link (reuses `password_reset_tokens`) — plaintext
  credentials are never emailed. Admin/seeded accounts are pre-verified
  (`email_verified_at` set at creation); verification applies to customers only.
- `User::profile_photo` falls back to a locally generated initials avatar
  (data-URI SVG, deterministic color per name) when no photo is uploaded —
  every dashboard/navbar shows an identity avatar automatically with no
  external service dependency. Raw value via `getRawOriginal('profile_photo')`.

### Mailer configuration

| Environment | Driver | Notes |
| --- | --- | --- |
| Local dev | `MAIL_MAILER=log` | Emails (incl. links) written to `storage/logs/laravel.log` |
| Tests | `MAIL_MAILER=array` | `phpunit.xml` / `.env.testing`; use `Mail::fake()` |
| Demo/Prod | Brevo SMTP | `smtp-relay.brevo.com:587`, `MAIL_SCHEME=smtp` (STARTTLS) |

Brevo setup: app.brevo.com → **SMTP & API → SMTP** → use the **SMTP login**
as `MAIL_USERNAME` and a generated **SMTP key** as `MAIL_PASSWORD` (not the
REST API key). `MAIL_FROM_ADDRESS` must be a Brevo-verified sender
(SMTP & API → Senders; single-sender verification works without a domain).
Never put mail credentials in frontend code or `VITE_*` vars.

Dev alternative: Mailtrap (`sandbox.smtp.mailtrap.io:2525`) — see commented
block in `backend/.env.example`.

### Queue

Mailables implement `ShouldQueue`. The capstone demo may use
`QUEUE_CONNECTION=sync` to avoid needing a worker. Business production should
use Redis with a dedicated `php artisan queue:work` service and monitored
failed jobs.

### Domain authentication (deployment requirement — not yet implemented)

Without a real sending domain, SPF/DKIM/DMARC **cannot** be configured — this
is a documented requirement, not a claim. When a domain is available:

1. Brevo → **Senders, Domains & Dedicated IPs → Domains** → add domain.
2. Publish the DNS records Brevo provides: SPF (`v=spf1 include:spf.brevo.com …`),
   DKIM (Brevo-generated `mail._domainkey` TXT), and DMARC
   (`_dmarc` TXT, e.g. `v=DMARC1; p=quarantine; rua=mailto:postmaster@domain`).
3. Set `MAIL_FROM_ADDRESS` to an address on that domain.

### Tests

`backend/tests/Feature/EmailAuthFlowTest.php` covers the full flow.
Note: the suite requires MySQL (migrations use MySQL-specific syntax);
sqlite `:memory:` fails. Run against a dedicated test DB:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS pawesome_test;"
DB_CONNECTION=mysql DB_DATABASE=pawesome_test php artisan test --filter=EmailAuthFlowTest
```

## Deployment

The supported target is Vercel for the React/Vite frontend and Railway for the
Laravel API/MySQL service. The legacy `backend/render.yaml` and nested
`backend/.github/workflows/deploy.yml` are not active canonical deployment
configuration; review `docs/DEPLOYMENT.md` before using any provider settings.

### Capstone demo
- Vercel frontend, Railway Laravel API and MySQL.
- Use a Railway persistent volume mounted at Laravel `storage/app` before using
  local public/private upload disks.
- `QUEUE_CONNECTION=sync` and file cache are acceptable for a controlled demo.

### Business production
- Separate staging and production Railway services/databases.
- Use Redis with a dedicated queue worker and scheduler.
- Use separate private and public S3-compatible buckets; private payment proofs
  must never be publicly readable.
- Configure backups, restore drills, monitoring, and gated releases.

### Release checklist
- [ ] `APP_DEBUG=false`, production `APP_KEY`, and production database credentials
- [ ] Exact production CORS/Sanctum/frontend/API domains
- [ ] Persistent demo volume or verified private/public object storage
- [ ] Queue worker/scheduler enabled where required
- [ ] No demo seed accounts in business production
- [ ] Dependency audit reviewed and exceptions documented
- [ ] Backup and rollback procedures tested
- [ ] CI, health check, and post-deploy smoke checks pass

## Known Windows Development Issues

- Socket exhaustion (68K+ TIME_WAIT sockets) causes `ERR_NETWORK_CHANGED`,
  `ERR_ADDRESS_IN_USE`, and `Failed to fetch` errors in Playwright tests.
- These are Windows TCP/IP stack issues, not application defects.
- Mitigation: reboot, or run tests on Linux/Docker.

## Issue Tracking

- **Profile Photo Fallback: FIXED** — 12/12 browser/API/database checks passed.
  `User::profile_photo` returns a deterministic-color initials `data:` URI when
  no photo is uploaded; `frontend/src/utils/avatar.js` (`resolveAvatarUrl`)
  passes `data:`/`blob:`/`http` through (stripping corrupted `?v=` suffixes)
  and resolves `/api/...` paths against the `VITE_API_BASE_URL` origin.
  Verified in Chromium: topbar, ProfileSettings, receptionist customer list,
  and manager staff list all render the avatar; uploaded photos load via
  `/api/files/profile-photos/{id}/view`.
- **Veterinary Profile Navigation: FIXED** — `DashboardProfile.ROLE_PROFILE_PATHS`
  now maps `veterinary → /veterinary/profile`, matching the `/veterinary/*`
  route mount. Browser-verified in `e2e/role-deep-links.spec.js` alongside the
  vet `/vet/*` → `/veterinary/*` notification deep-link fixes.
- **Storage Hardening: FIXED** — all uploads go through
  `App\Services\FileStorageService::storeAndPersist()` (store → DB write in a
  transaction → delete new file on failure → delete replaced file only after
  success). Controllers keep their own validation/business rules. Payment proofs
  pass `deleteOld: false`: replaced/rejected proofs are retained as evidence.
  Inventory photos/batch proofs are image-validated and stored on the `public`
  disk (`HandlesInventoryUploads` trait) — never written under `public/`.
  `private`/`public` disks use `throw => true`; S3/R2 roots come from
  `PRIVATE_STORAGE_ROOT`/`PUBLIC_STORAGE_ROOT` (never local paths); storage
  failures render as a 503 JSON (`bootstrap/app.php`). Local dev needs
  `php artisan storage:link` once for public-disk URLs.
  Tests: `php artisan test --filter="StorageLifecycleTest|PrivatePetPhotoTest|PrivateConfinementPaymentProofTest"`;
  browser: `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/storage-hardening.spec.js --project=chromium`
  (evidence in `browser-evidence/storage-hardening/`).
- **Known unrelated test failures: OPEN — requires separate investigation** —
  8 full-suite failures observed during storage hardening (DatabaseIntegrityTest ×2,
  EndToEndBusinessFlowTest, FullSystemIntegrationTest, PayrollEndToEndTest ×2,
  ReportsTest inventory count, VeterinaryWorkflowTest). None exercise upload code,
  but they have NOT been confirmed against a clean-checkout baseline yet.
- **E2E hygiene & reliability: FIXED** — suite defaults to live mode
  (`E2E_LIVE=true`; opt out with `0`/`false`), port drift `:3002`→`:3000` and
  the `localhost`/`127.0.0.1` origin split are resolved, login throttling is
  avoided via the shared token cache in `e2e/test-utils.js` (`apiLogin`
  supports `{ refresh: true }` for post-logout re-issue), and data-dependent
  tests provision fixtures via API. Two app-level bugs were found and fixed:
  `CustomerRequestStatus` emptied the whole table if any one of its three
  fetches failed, and `NotificationDropdown` defaulted unresolved roles to
  `"manager"`. Full-suite result: 105 passed / 13 failed at 4 workers; the
  residuals are Windows/dev-server load starvation — all pass at
  `--workers=2` or in isolation. Details and rerun guidance:
  `docs/E2E_RELIABILITY_AUDIT.md`.
- **Cashier notification deep link: FIXED** — `/cashier/payment-verification`
  (used by `NotificationDropdown` and the chatbot) previously hit the `*` catch-all
  and opened POS on the Products tab. It is now a real route rendering
  `CashierPOS initialTab="payment-approvals"`; the tab is re-selected on each
  navigation without remounting (cart preserved). `CashierPaymentVerification.jsx`
  is unrouted legacy — the live approvals UI is `PaymentApprovals` inside POS.
  Browser: `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/cashier-payment-deep-link.spec.js --project=chromium`.

## Reports

| Gate | Report Path |
| --- | --- |
| Gate A — Cross-role E2E | `browser-evidence/cross-role-e2e-audit/PAWESOME_CROSS_ROLE_E2E_READINESS_REPORT.md` |
| Gate B — Security & RBAC | `browser-evidence/security-rbac-audit/PAWESOME_SECURITY_RBAC_READINESS_REPORT.md` |
| Gate C — Database Readiness | `browser-evidence/database-readiness-audit/PAWESOME_DATABASE_READINESS_REPORT.md` |
| Gate D — Report Reconciliation | `browser-evidence/report-reconciliation-audit/PAWESOME_REPORT_RECONCILIATION_REPORT.md` |
| Browser Regression | `browser-evidence/browser-regression/PAWESOME_BROWSER_REGRESSION_REPORT.md` |
