# Pawesome Capstone

Pawesome is a pet-care management system with role-based customer and staff workflows.

## Technology

- Backend: Laravel 12, PHP 8.2+, MySQL, Sanctum token authentication
- Frontend: React 18, Vite, Vercel SPA configuration
- End-to-end tests: Playwright
- Transactional email: durable `email_deliveries` outbox → database queue → Brevo transport (HTTPS API in production, SMTP relay supported)
- Optional chatbot integration: server-side Gemini configuration

## Local development

### Prerequisites

- PHP 8.2+ with the Laravel-required extensions
- Composer 2
- MySQL 8 (XAMPP is supported)
- Node.js 22 and npm

### Backend

1. From `backend/`, install PHP dependencies with `composer install`.
2. Copy `.env.example` to `.env`; set `APP_ENV=local`, `APP_DEBUG=true`, local `APP_URL`/`FRONTEND_URL`, a local MySQL database, and `MAIL_MAILER=log`.
3. Run `php artisan key:generate`.
4. Run `php artisan migrate --seed` only for a local/demo database. Seed data includes demonstration accounts; do not seed a business production database.
5. Start the API with `php artisan serve --host=127.0.0.1 --port=8000`.

### Frontend

1. From `frontend/`, run `npm ci`.
2. Create `frontend/.env` with `VITE_API_BASE_URL=/api` for local Vite proxying.
3. Run `npm run dev -- --port 3000`.

The Vite proxy forwards `/api` and `/storage` requests to `http://127.0.0.1:8000`.

## Verification

Backend tests require a dedicated MySQL database because the migration set uses MySQL-specific SQL. Create `pawesome_test` locally with `mysql -u root -e "CREATE DATABASE IF NOT EXISTS pawesome_test;"`, then run `php artisan test` from `backend/`; `phpunit.xml` targets that test database by default. Never point the test configuration at a production or business database.

For the frontend, run `npm run build` from `frontend/`. Playwright defaults to `http://127.0.0.1:3000` (override with `E2E_BASE_URL`); use the test setup and commands in `frontend/e2e/README.md` and `docs/DEPLOYMENT.md`. Some recorded Windows E2E failures have been caused by port mismatch and TCP socket exhaustion, so inspect current test output rather than assuming the saved last-run artifact identifies a current code defect.

## Deployment

Deployment is not automatic from this repository. The root GitHub Actions workflow runs CI only; deployments remain gated and provider-specific setup is documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). The readiness findings and release gates are recorded in [`docs/DEPLOYMENT_READINESS_REPORT.md`](docs/DEPLOYMENT_READINESS_REPORT.md). Verified workflow/email/test evidence is indexed in [`docs/EVALUATION_EVIDENCE.md`](docs/EVALUATION_EVIDENCE.md).

Supported planning modes:

- Capstone demo: Vercel frontend, Railway Laravel API and MySQL, persistent Railway volume for local uploads, synchronous queue.
- Business production: separate staging and production, Railway MySQL/Redis, queue worker and scheduler, separate private/public S3-compatible storage buckets, backups and monitoring.

Do not deploy until the readiness report's blocking items and the selected mode's release gates are closed.
