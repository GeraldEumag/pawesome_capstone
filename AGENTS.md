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

## Production Deployment

### Backend (Render)
- Config: `backend/render.yaml`
- Set `APP_ENV=production`, `APP_DEBUG=false`
- Auto-generates `APP_KEY` and `DB_PASSWORD`
- Uses Redis for cache/queue, file for sessions

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
