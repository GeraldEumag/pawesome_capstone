# Pawesome Capstone — Agent Guide

## Project Overview

Pawesome is a pet care management system with role-based access for 7 roles:
customer, receptionist, cashier, inventory, veterinary, manager, admin.

Two composite "super" roles extend the base roles:
- `super_admin` — all staff modules (admin + manager + receptionist + cashier + inventory + vet). Customer portal blocked.
- `super_receptionist` — receptionist + cashier + inventory combined.

## Architecture

- **Backend:** Laravel 11 (PHP 8.2+) at `backend/`
- **Frontend:** React 18 + Vite at `frontend/`
- **Database:** MySQL
- **Auth:** Laravel Sanctum personal access tokens + custom ApiTokenAuth middleware
- **E2E Tests:** Playwright at `frontend/e2e/`

## Key Commands

### Backend
```bash
cd backend
composer install
php artisan migrate:fresh --seed    # Fresh DB with seed data
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

Mail is queued (`ShouldQueue`). `QUEUE_CONNECTION=sync` is fine for dev and
for the Render free tier — render.yaml uses `sync` because no worker service
is provisioned. If a `type: worker` running `php artisan queue:work` is added,
switch `QUEUE_CONNECTION` back to `redis`.

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

## Production Deployment

### Backend (Render)
- Config: `backend/render.yaml`
- Set `APP_ENV=production`, `APP_DEBUG=false`
- Auto-generates `APP_KEY` and `DB_PASSWORD`
- Uses Redis for cache, file for sessions, `sync` queue (no worker provisioned)
- `MAIL_USERNAME`/`MAIL_PASSWORD` are `sync: false` — set them in the Render
  dashboard from the Brevo SMTP credentials

### Frontend (Vercel)
- Config: `frontend/vercel.json`
- Set `VITE_API_BASE_URL` to production backend URL
- SPA routing handled by rewrites

### Production Checklist
- [ ] `APP_DEBUG=false`
- [ ] `APP_ENV=production`
- [ ] Strong production `DB_PASSWORD`
- [ ] Real `CORS_ALLOWED_ORIGINS` (not placeholder)
- [ ] Fresh production `APP_KEY`
- [ ] `CACHE_STORE=redis`
- [ ] `SESSION_DRIVER=file` or Redis
- [ ] `VITE_API_BASE_URL` points to production backend
- [ ] `MAIL_USERNAME`/`MAIL_PASSWORD` set in Render dashboard (Brevo SMTP key)
- [ ] `MAIL_FROM_ADDRESS` is a Brevo-verified sender
- [ ] SPF/DKIM/DMARC DNS records published (requires a real domain)

## Known Windows Development Issues

- Socket exhaustion (68K+ TIME_WAIT sockets) causes `ERR_NETWORK_CHANGED`,
  `ERR_ADDRESS_IN_USE`, and `Failed to fetch` errors in Playwright tests.
- These are Windows TCP/IP stack issues, not application defects.
- Mitigation: reboot, or run tests on Linux/Docker.

## Reports

| Gate | Report Path |
| --- | --- |
| Gate A — Cross-role E2E | `browser-evidence/cross-role-e2e-audit/PAWESOME_CROSS_ROLE_E2E_READINESS_REPORT.md` |
| Gate B — Security & RBAC | `browser-evidence/security-rbac-audit/PAWESOME_SECURITY_RBAC_READINESS_REPORT.md` |
| Gate C — Database Readiness | `browser-evidence/database-readiness-audit/PAWESOME_DATABASE_READINESS_REPORT.md` |
| Gate D — Report Reconciliation | `browser-evidence/report-reconciliation-audit/PAWESOME_REPORT_RECONCILIATION_REPORT.md` |
| Browser Regression | `browser-evidence/browser-regression/PAWESOME_BROWSER_REGRESSION_REPORT.md` |
