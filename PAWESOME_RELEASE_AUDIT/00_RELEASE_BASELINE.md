# 00 — Release Baseline

## Repository state (verified 2026-11-28)

| Item | Value |
| --- | --- |
| Branch | `audit/pawesome-final-acceptance` |
| HEAD | `b952fa660ac9568c46d8856b0d4945bc01262a3c` |
| Prior audit commit | `b952fa66` — **is HEAD itself** (ancestor check: yes, trivially) |
| Working tree | Clean except untracked `browser-evidence/cross-role-main-workflow/2026-11-28T09-10-00-294Z/` (generated E2E artifact, not code) |
| Tags | `defense-ready-manager-20261117` (only tag; predates this audit line) |
| Uncommitted migrations | None — all migrations committed |
| Prior deliverables | `PAWESOME_REVISION_AUDIT/00–17` committed in `b952fa66` |

**Conclusion:** the current HEAD *is* the previously verified audit commit.
All prior fixes (species enforcement, VAT alignment, test deflaking) are
present in the tree. No discrepancy — proceeding.

## Environment versions

| Component | Version |
| --- | --- |
| PHP (local CLI) | 8.2.12 ZTS (XAMPP) |
| PHP extensions present | bcmath, curl, dom, fileinfo, libxml, mbstring, mysqli, mysqlnd, openssl, PDO, pdo_mysql, pdo_sqlite, xml*, zip |
| PHP extensions **absent locally** | **gd, intl** (CI installs them; required on the production host for dompdf/intl consumers) |
| Composer | present; `laravel/framework 12.72.0`, `laravel/sanctum 4.3.1`, `dompdf/dompdf 3.1.6`, `symfony/brevo-mailer 7.4.13`, `league/flysystem-aws-s3-v3 3.35.3` (S3-capable), `laravel/sail` |
| Node | v24.14.1 / npm 11.11.0 |
| Frontend | React 18.3.1, react-router-dom 7.14, Vite (build verified previously), `package-lock.json` present (npm is canonical; no yarn.lock) |
| Database | MySQL (XAMPP local; `pawesome` dev, `pawesome_test` suite). 195 migration files |
| PHPUnit | 11.5.55 via `php artisan test` |

## Deployment assets found

- `docs/DEPLOYMENT.md` — canonical runbook: **Vercel frontend + Railway
  Laravel/MySQL**, Cloudflare DNS/TLS, Brevo email, optional Gemini
  chatbot. States explicitly it is guidance, not proof of provisioned
  infra.
- `docs/DEPLOYMENT_HOSTINGER.md`, `docs/DEPLOYMENT_READINESS_REPORT.md`,
  `docs/PHASE_10_DEPLOYMENT_*` — earlier deployment assessments.
- `backend/railway.json` — `preDeployCommand: php artisan migrate --force`,
  `startCommand: php artisan storage:link && php artisan serve`,
  healthcheck `/api/health`.
- `backend/Dockerfile`, `docker-compose.yml` (MySQL 8 fallback),
  `backend/render.yaml` + nested `backend/.github/workflows/deploy.yml`
  — **legacy, explicitly not canonical**.
- `.github/workflows/ci.yml` — CI only (backend PHPUnit on MySQL 8
  service + composer audit; frontend npm ci + `npm audit --audit-level=critical`
  + build). **No deploy job, no Playwright in CI.**

## Environment configuration posture

- `.env` is gitignored; `.env.example` is comprehensive (APP_*, DB_*,
  SESSION_*, SANCTUM/CORS, TRUSTED_PROXIES, FILESYSTEM_DISK +
  PRIVATE/PUBLIC_STORAGE_DRIVER, QUEUE, CACHE, REDIS, MAIL/Brevo,
  AWS S3 dual-bucket vars, chatbot keys) with production-safe defaults
  (`APP_DEBUG=false`, `SESSION_SECURE_COOKIE=true`, `LOG_LEVEL=error`).
- `.env.testing` is tracked but contains only inert test values
  (sqlite `:memory:`, dummy APP_KEY, array drivers) — no real secrets.
- `phpunit.xml` forces MySQL `pawesome_test`, overriding `.env.testing`.
- Seeders include demo/live-demo data (`DemoDataSeeder`,
  `PawesomeLiveDemoSeeder`) — must NOT run in production.

## Scheduler inventory (routes/console.php)

14 scheduled entries: booking reminders (hourly), email outbox
dispatch (every minute) + reconcile (every 10 min), attendance
mark-absent, 13th-month accrual ×2, annual leave reset, probation
check, inventory expiry sweep, confinement daily accrual, recall sends,
chatbot log pruning, idempotency-key pruning. **Production requires a
cron entry for `schedule:run` plus queue workers** — see report 07.

## Differences vs previous final-revision audit

None in code — HEAD == `b952fa66`. This engagement adds the
production-readiness layer (env/deploy/security/DB/backup/email/queue/
storage/perf/observability/CI-CD/runbook) on top of the verified
functional state.

## Release blockers identified at baseline

None code-level. Infrastructure-level unknowns requiring owner action:
production hosting not yet provisioned (Vercel/Railway per docs, or
alternative), no production domain/DNS verified, no production APP_KEY/
DB credentials exist yet, Brevo sender/domain auth unverified,
backup strategy not yet implemented (Phase 5 will design + test).
