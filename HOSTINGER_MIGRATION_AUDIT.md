# Pawesome Hostinger Migration Audit

**Audit date:** 2026-10-05  
**Scope:** Phase 1 repository/public-documentation audit, updated with the user's non-secret Hostinger setup report; no direct production-system access.  
**Production provider/account access:** No direct access. The user supplied Hostinger website/account findings; Railway, Vercel, DNS, Brevo, production database, and production storage were not accessed.  
**Application code/configuration changes:** None. A backend-only source archive (`pawesome_backend_test.zip`) was prepared from commit `87e42940db61139cce1a111219930029036afb51` for manual staging upload; it has not been uploaded. It excludes `.env.testing`, uploads, seeders, test suites, scripts, and `vendor`; `.env.example` is included as a placeholder only. The pre-existing `frontend/src/api/attendance.js` modification is untouched.  
**Cutover decision:** **NOT APPROVED** — the temporary site is active, but no app/database is deployed and MariaDB compatibility, queue execution, and secure Laravel document-root behavior remain unvalidated.

## Executive Summary

Pawesome is a Laravel 12 / PHP 8.2+ API and React 18/Vite static frontend. The frontend is configured to build to `frontend/build`; a permanently running Node process is not required to serve that output. The codebase uses MySQL in CI and test configuration, Sanctum personal-access tokens behind custom API middleware, local private/public storage disks by default, and an encrypted/deduplicated transactional-email outbox delivered through queued Laravel jobs. The configured Brevo transport is its HTTPS API, not SMTP.

The user reports that the paid one-month **Unlimited Web Hosting** site is active at `mediumturquoise-mandrill-466666.hostingersite.com`, in the Asia (Indonesia) datacenter, with SSL and SSH enabled. One empty disposable MariaDB 10.5 test database, `u837894234_pawcompat`, has been created; it is reported as 1 MB of a 3 GB per-database maximum, with remote access disabled and no production data imported. The backend source is extracted under the reported private path `backend_extract/backend`; no `.env`, Composer dependencies, cron job, migrations, production data, or DNS changes have been applied. Other reported settings include PHP 8.3.33, LiteSpeed, `public_html` document root, 50 GB storage, 600,000 inodes, and 3 GB account RAM. These are user-supplied Hostinger findings, not independently inspected or tested.

PHP 8.3.33 satisfies the project's declared PHP `^8.2` range. Successful SSH checks report CLI PHP 8.3.33 and Composer 2.9.8; CLI modules `bcmath`, `gd`, `intl`, `pdo_mysql`, and `zip` are present, satisfying CI's required extension list. The `redis` PHP extension also appears, but no Redis service/endpoint is confirmed. MariaDB 10.5 remains a required schema/workflow compatibility gate: the test DB exists but migrations/workflows have not been run and its charset/collation were not exposed. Cron cadence/runtime and safe queue processing remain unverified.

Hostinger is a plausible staging candidate, but production migration/cutover is not approved. The following compatibility questions must be resolved before data migration:

1. **Database engine/version:** The user reports that the provisioned Hostinger site uses MariaDB 10.5; Pawesome CI is MySQL 8.0-based. Treat schema/query/transaction behavior as a formal compatibility gate and validate against an isolated MariaDB 10.5 database, not a routine dump/import.
2. **Queue execution:** Cron and Artisan CLI support are reported, but minimum interval and runtime ceiling remain unknown. Redis is not documented for shared Web/Cloud hosting; this is a risk, not automatic proof that Pawesome cannot run. Validate whether the existing database queue/outbox can be processed safely on the provisioned plan. A cron-driven worker remains a staging-only candidate, not approved or implemented here.

No credentials, live data, backup, deployment, DNS, or application behavior was tested. Historical PASS/GREEN evidence is not proof for Hostinger or the current release.

## 1. Architecture and Dependencies

### Backend

- Laravel `^12.0`, PHP `^8.2`, Sanctum `^4.3`; dependency declarations are in `backend/composer.json` and resolved packages in `backend/composer.lock`.
- CI config uses PHP 8.2 with `bcmath`, `gd`, `intl`, `pdo_mysql`, and `zip` (`.github/workflows/ci.yml`). These are a starting runtime checklist, not a complete PHP extension audit; verify all runtime needs against Composer platform requirements and the actual Hostinger PHP build.
- The backend is designed to use MySQL (`backend/.env.example`, `backend/phpunit.xml`, root CI). CI provisions MySQL 8.0; PHPUnit forces `DB_CONNECTION=mysql` and the dedicated `pawesome_test` database. The project guide says SQLite is not equivalent because migrations include MySQL-specific alterations.
- API health route `/api/health` returns a basic `{"status":"ok"}` liveness response; it does not prove database, queue, storage, mail, or scheduler health.
- `backend/railway.json` is provider-specific: it runs `php artisan migrate --force` as a pre-deploy command, starts `php artisan serve`, creates a storage link, and uses `/api/health`. It is not a Hostinger deployment recipe and must not be copied blindly.
- `backend/render.yaml` and `backend/.github/workflows/deploy.yml` are identified as legacy/noncanonical in `docs/DEPLOYMENT.md`; the root CI workflow tests/builds and does not deploy.

### Frontend

- React 18 + Vite 6; `frontend/package.json` provides `npm run build` and `frontend/vite.config.js` explicitly sets `build.outDir` to `build/`.
- Root CI tests with Node 22. There is no `engines` declaration in the frontend manifest. Use Node 22 for reproducible builds unless a later compatibility test justifies another version.
- `frontend/src/api/client.js` reads public build-time `VITE_API_BASE_URL`, falls back to the legacy public `REACT_APP_API_URL`, then `/api`. It sends bearer authorization when present and also uses `credentials: include`.
- The public chatbot helper in `frontend/src/services/chatbotService.js` has a hard-coded `http://127.0.0.1:8000/api` fallback when `VITE_API_BASE_URL` is unset. Production builds must provide the correct public API base or verify a deliberate same-origin path; do not assume this fallback is safe.
- `frontend/vercel.json` supplies Vercel-specific SPA fallback and headers. Hostinger needs an equivalent verified rewrite/document-root configuration. Preserve `build/`; do not substitute Vite's commonly used `dist/` default.
- Static hosting of `build/` does not require a persistent Node process. Hostinger's Node.js application feature is not required for the current frontend architecture.

## 2. Current Production Architecture and Configuration Evidence

The user-provided target context is Vercel frontend + Railway Laravel/MySQL + Brevo. The repository contains matching deployment guidance, Railway configuration, and Vercel configuration, but no provider account or live service was inspected; service URLs, actual environment values, and current health are unverified.

`backend/.env.example` is a placeholder/example, not proof of production configuration. It contains Railway/Vercel example origins, local CORS/Sanctum entries, `SESSION_SECURE_COOKIE=false`, local storage drivers, `QUEUE_CONNECTION=sync`, and `MAIL_MAILER=brevo`. Do not use the example's origins or session values as final production settings. No real `.env` was read.

The production hostname/domain and whether frontend/API will share a domain or use separate origins are not confirmed. Consequently, final `APP_URL`, `FRONTEND_URL`, `VITE_API_BASE_URL`, CORS origins, Sanctum stateful hosts, cookie attributes, DNS, and TLS values cannot be prescribed here.

## 3. Database Compatibility Gate — REQUIRED

### Evidence from the repository

- `backend/phpunit.xml` pins tests to MySQL. Root CI starts MySQL 8.0. The project guide documents MySQL-only test behavior.
- There are **158 tracked PHP migration files** under `backend/database/migrations`.
- Static source review found direct engine-sensitive SQL and behaviors, including:
  - Raw `ALTER TABLE ... MODIFY COLUMN ... ENUM(...)` migrations, e.g. `2026_09_29_150000_expand_service_request_status_enum.php`, `2026_09_29_120000_add_auto_to_attendance_source_enum.php`, and `2026_09_28_100004_extend_leave_requests_table.php`.
  - JSON predicate usage such as `whereJsonContains` in `backend/app/Models/BoardingRoom.php`.
  - `lockForUpdate()` in payment verification, inventory, POS, authentication, attendance, appointment, and booking flows.
  - MySQL/MariaDB-sensitive status/enum and ordered `FIELD(...)` query usage.
- Existing CI does not establish MariaDB compatibility. No MariaDB instance or production database was queried.

### Required before migration

1. Confirm the actual Hostinger engine and exact server version in hPanel (MySQL or MariaDB; do not infer from marketing wording or generic limits tables).
2. Compare the confirmed target with MySQL 8.0 behavior used in CI.
3. Review all migrations and raw SQL for syntax/semantics, JSON support, enum/set behavior, indexes/unique constraints, foreign keys, generated/default values, collation/charset, date/time handling, transactions, row locks/isolation, and any views/triggers/procedures.
4. Provision a disposable isolated database on the confirmed engine/version; apply the complete migrations and test representative writes/reads/locking and business workflows there.
5. Compare schema, constraints, and representative values after migration rehearsal. Do not rely on a successful SQL import alone.
6. Document incompatibilities before proposing any code/schema changes. Do not edit migrations merely to make a rehearsal pass.

Production DB version, size, table/row counts, migration state, backup, restore quality, and import path/limits remain unknown.

## 4. Hostinger Capabilities and Account-Specific Verification

### Public documentation findings (not account verification)

Hostinger documentation currently describes an `Unlimited` Web plan with published example limits including 2 CPU cores, 3 GB RAM, 50 GB disk, 600,000 inodes, 60 PHP workers, 150 databases, a 3 GB database-size limit, 200 MB database import limit, up to 75 DB connections per user, PHP execution time up to 360 seconds, and PHP memory up to 2 GB. The same page notes that former Web Business accounts can retain different/older limits; use the user's hPanel plan details as authoritative.

Hostinger's documentation states:

- SSH is available on eligible Web plans, but may need to be enabled; availability depends on the exact plan.
- Composer 2 is documented for eligible Web/Cloud plans; confirm command availability/version for the account.
- Cron jobs are supported and may invoke custom commands; the public setup instructions do not establish the exact minimum cadence, process/runtime limits, or account reliability needed by this workload.
- MySQL is supported in the Hostinger product family; separate published material/user findings indicate Web/Cloud may use MariaDB. Exact engine/version must be checked in hPanel.
- Redis is not supported on Web/Cloud shared plans according to Hostinger's database support documentation; VPS is a different product and is not the target.
- Current public materials list Node.js application hosting for some Web/Cloud plans. That service is unnecessary for this static Vite build and must not be conflated with the ability to run arbitrary persistent queue workers.

References:

- [Hosting plan parameters and limits](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/)
- [PHP extensions and configuration options](https://www.hostinger.com/support/which-php-extensions-and-configuration-options-are-supported-at-hostinger/)
- [SSH access](https://www.hostinger.com/support/1583245-how-to-connect-to-a-hosting-plan-via-ssh-in-hostinger/)
- [Composer at Hostinger](https://www.hostinger.com/support/5792078-how-to-use-composer-at-hostinger/)
- [Cron job setup](https://www.hostinger.com/support/1583465-how-to-set-up-a-cron-job-at-hostinger/)
- [Database and Redis support](https://www.hostinger.com/support/which-databases-and-data-tools-are-supported-at-hostinger/)
- [Node.js web app hosting](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)

### User-reported subscription snapshot (2026-10-05)

These facts were supplied by the user after checking the Hostinger account. They are recorded as reported, not independently verified by direct hPanel access. No secrets were provided.

**Provisioning update:** The site is active at `mediumturquoise-mandrill-466666.hostingersite.com` in the Asia (Indonesia) datacenter. SSL is active and SSH is enabled. The site is plain PHP on LiteSpeed. The backend ZIP was uploaded to `pawesome_backend_test` and extracted outside `public_html`; the File Manager confirms a `backend` directory under `backend_extract` (relative backend path: `backend_extract/backend`). Hostinger confirms that the account parent and child are not HTTP-served while the vHost remains unchanged; leave `DO_NOT_UPLOAD_HERE` untouched and do not add aliases, symlinks, or rewrites exposing the private folder. One disposable test database, `u837894234_pawcompat`, was created and verified (MariaDB 10.5, 1 MB current size, 3 GB maximum, remote access disabled). No imports, migrations, cron jobs, DNS changes, or production data were used.

| Area | User-reported site/account fact | Still unresolved |
|---|---|---|
| Plan/status | Unlimited Web Hosting, one-month term, paid through 2026-11-05; empty site active; Asia (Indonesia); SSL active; LiteSpeed; SSH enabled. | Actual domain topology for production and full backup/restore procedure. |
| Database | `u837894234_pawcompat`; MariaDB 10.5; 1 MB current size of 3 GB maximum; usage 1 of 150 allowed databases; test DB user created; remote access disabled. | Charset/collation (not exposed), connection/query limits, backup/restore behavior, and successful app schema/workflow compatibility. The 150 value is a database-count limit, not a per-database size limit. No password was displayed or shared. |
| Import | phpMyAdmin import limit reported as 256 MB; larger imports said to be possible through SSH MySQL/MariaDB CLI. | Test actual CLI import permissions/runtime and confirm DB quota. No import was performed. |
| PHP | Selected PHP 8.3.33; available versions 8.2, 8.3, 8.4, 8.5. | Complete extension/Composer platform check; clarify whether `zip` is enabled, not just available. |
| PHP extensions | SSH CLI output confirms CI's required `bcmath`, `gd`, `intl`, `pdo_mysql`, and `zip`; it also lists `mbstring`, `fileinfo`, `openssl`, and the `redis` PHP extension. | Composer platform check is still pending; the PHP `redis` extension does not confirm a Redis service/endpoint. |
| PHP limits | `memory_limit=512M` (configurable to 2048M); `max_execution_time=300` (max 360); `max_input_time=240` (max 360); upload/post sizes 256M each (configurable to 2048M). | Confirm current effective values for the selected website/PHP handler and CLI separately. |
| Cron/Artisan | Cron supported; no cron jobs exist. SSH is enabled for Composer/Artisan work. | Minimum interval, run-time ceiling, CLI environment/PATH, overlap behavior, logs, and bounded queue-worker feasibility. No cron command has been installed. |
| SSH/Composer | SSH login and working directory `backend_extract/backend` verified; CLI PHP 8.3.33, Composer 2.9.8, and CI-required CLI extensions `bcmath`, `gd`, `intl`, `pdo_mysql`, `zip` confirmed by user output. | Composer dependency install and platform check remain; no migrations or full tests have run. |
| Web root/rewrite | Current document root is `public_html`; `.htaccess` and `mod_rewrite` are reported supported. User's SSH listing confirms `backend_extract` and `public_html` are siblings, with `backend_extract/backend` present. | Hostinger reports the private sibling is not HTTP-served while vHost is unchanged; this HTTP boundary is not independently tested. Keep `DO_NOT_UPLOAD_HERE` untouched; do not add symlinks, aliases, or rewrites exposing the private folder. Storage symlink support remains unknown. |
| Resources/storage | 50 GB disk, 600,000 inodes, 3 GB account RAM, 2 CPU cores, 120 active-process limit, 60 entry-process limit, 150 database limit, 100 subdomains. | Actual use, plan enforcement under load, PHP worker quotas, private storage persistence/permissions, and database per-DB cap. |
| Network/domain | Temporary subdomain SSL active; no production domain/DNS change. | Outbound HTTPS/DNS to Brevo API and final domain/subdomain layout. |

The account-specific 256 MB phpMyAdmin import figure differs from the generic public plan table's import figure; use the reported account UI value for planning but verify it and actual CLI behavior after setup. Account RAM is not PHP `memory_limit`. All values above are user-reported and were not independently inspected or load-tested.

### Remaining non-secret checks

- CLI output confirms the CI-required extensions `bcmath`, `gd`, `intl`, `pdo_mysql`, and `zip`. Next, install Composer dependencies in the private backend copy and run `composer2 check-platform-reqs`; do not infer Redis server availability from the `redis` PHP extension.
- Verify the actual effective PHP settings and CLI PHP version/ini independently.
- The disposable MariaDB test DB `u837894234_pawcompat` is created, with remote access disabled and no production data. Charset/collation are not exposed in the account record; inspect via hPanel/SSH without sharing credentials. Hostinger reports PHP/SSH connection host `localhost:3306`; keep remote DB access disabled.
- Obtain cron minimum interval, timeout/runtime limits, custom command/PATH behavior, overlap handling, and failure-output location. Then validate scheduler and bounded database-queue worker behavior in staging; do not create cron entries yet.
- Hostinger confirms `backend_extract` at the account root is outside the current `public_html` vHost and not HTTP-served while the vHost remains unchanged. Keep `DO_NOT_UPLOAD_HERE` and `public_html` untouched; do not add a symlink, alias, or rewrite that exposes the private folder. This remains provider-reported and has not been independently tested.
- Verify local file persistence, permissions, SSL/proxy behavior, and outbound HTTPS/DNS to Brevo API.

Do not provide passwords, API keys, SMTP credentials, private keys, APP_KEY, database credentials, or account login details.

## 5. Queue, Email Outbox, and Scheduler

### Existing code path

The repository's newer notification design is a transactional outbox, not just direct mail delivery:

`business/auth/payment event → email_deliveries intent in DB transaction → commit → job publication → jobs row on emails queue → SendEmailDelivery → Laravel Mail sendNow → configured provider`

- `EmailDeliveryService` records encrypted recipient/payload data, deduplicates by event/occurrence keys, checks suppression at send time, retries only failures classified as safely retryable, and marks uncertain post-provider outcomes `unknown` rather than blindly resending.
- `SendEmailDelivery` is queued on the `emails` queue, with one queue attempt and a 30-second job timeout; the service manages delivery retry policy separately.
- `config/queue.php` supports `sync`, `database`, and `redis`; the database connection uses the `jobs` table and `failed_jobs` uses database UUID storage. `backend/.env.example` and demo guidance set `QUEUE_CONNECTION=sync`; business-production guidance describes Redis plus supervised queue workers. The actual Railway production value was not read.
- Since jobs are sent to `emails`, any worker consuming a database queue must explicitly consume that queue (and any desired default queue); running Laravel's default queue alone may not pick these jobs up.
- `routes/console.php` schedules email outbox dispatch every minute and reconciliation every ten minutes, along with reminders, attendance, payroll accrual, annual leave reset, and probation checks. Scheduler commands do not themselves prove queued jobs are being processed.

### Required compatibility test (later, isolated/staging only)

Do not treat no Redis as automatic application failure. First test whether the existing DB queue/outbox can be processed safely on the exact plan. Verify cron cadence, bounded worker invocation, duration/timeouts, concurrency/overlap locks, queue backlog/drain rate, email latency, retry and failed job behavior, outbox state transitions, duplicate prevention, unknown outcome handling, scheduler interaction, resource usage, monitoring, and a simulated Brevo/API interruption. A `queue:work` persistent process remains unverified and must not be assumed. If a periodically invoked bounded worker cannot meet these requirements, stop and present the smallest external worker/service option for approval.

### Email / Brevo

- `backend/config/mail.php` and `AppServiceProvider` configure the Symfony Brevo HTTPS API transport. `.env.example` calls for `MAIL_MAILER=brevo` and a backend-only Brevo REST API key; SMTP is documented only as an alternative.
- User confirmed Brevo HTTPS API is the migration baseline. Do not switch to SMTP during this infrastructure migration. Consider SMTP only if a documented Hostinger/API transport failure remains after root-cause investigation and the user explicitly approves the alternative.
- Existing flows include verification, password reset, admin-created welcome/set-password links, customer lifecycle notifications, payment receipts, and staff payslip mail. `docs/NOTIFICATION_MATRIX.md` maps much of the event flow; relevant tests include `EmailAuthFlowTest`, `EmailDeliveryOutboxTest`, `EmailServiceWorkflowTest`, `EmailPreferencesAndTemplatesTest`, and `PaymentReceiptOutboxTest`.
- Verification/reset/welcome mailables derive links from `FRONTEND_URL` with localhost fallbacks. Production values must be explicit and later tested for HTTPS and the actual frontend URL.
- An outbox row/queue job, successful Laravel response, or Brevo API acceptance is not proof of inbox delivery. Production validation must trace action → DB state/outbox → worker → Brevo acceptance → recipient inbox and verify the link and final persisted workflow state.
- Brevo credentials, verified sender, SPF/DKIM/DMARC, live HTTPS reachability, actual recipients, and inbox delivery were not tested.

## 6. Storage and File Migration

- `config/filesystems.php` defines local `private` and `public` roots under Laravel storage, plus configurable S3-compatible disks. `.env.example` uses local drivers. Public assets rely on the configured `public/storage` symlink to `storage/app/public`.
- `FileStorageService::storeAndPersist()` writes the file, commits the DB reference transactionally, removes a new file on DB failure, and removes replacements only after success. Current secure upload paths include private payment proofs and protected pet-photo reads; public assets/profile/inventory use cases also exist.
- Railway demo guidance requires a persistent volume mounted at `storage/app`. Hostinger local disk persistence, storage location, symlink support, quotas, and document-root confinement are not verified.
- Existing deployment documentation raises unresolved legacy risks: historic confinement payment proofs/pet photos may exist in public storage, and boarding/medical-confinement care-log photos remain public pending an access-policy decision. No live records or files were inventoried. Do not bulk-copy/move/delete them without an approved mapping, backup, rollback, and authorization test.
- Before migration, later phases must separately inventory DB paths and stored files, classify public/private policy, transfer files independently from DB import, validate size/hash/path/permissions and authorized view/download, and verify no private paths are directly web-accessible.

## 7. Authentication, Authorization, and Security

- `ApiTokenAuth` resolves Sanctum personal access tokens (bearer token, with a query-token fallback) and rejects missing users/inactive accounts; `auth.api` is the API middleware alias. `AuthController` also has a cookie/bearer path for current-user lookup. This is not evidence of a pure Sanctum SPA-cookie architecture; preserve the existing token flow and map any cookie-dependent endpoint before deployment.
- Frontend requests attach `Authorization: Bearer` and `credentials: include`. Sanctum has stateful-domain config, but exact production behavior depends on chosen origins, session settings, and HTTPS. Do not change auth architecture without evidence.
- Role checks are enforced server-side with route middleware. Project roles include customer, receptionist, cashier, inventory, veterinary, manager, admin, and composite `super_receptionist`; stale `super_admin` normalizes to admin. Admin reaches staff modules but not customer portal per `AGENTS.md`.
- Customer verification middleware protects customer booking/checkout mutations; inactive-user and ownership protections are present in source/tests. Deployed-origin auth, role, ownership/IDOR, and inactive-user behavior remain untested.
- `config/cors.php` has credentials enabled and environment-driven explicit origins, but fallback/sample values are local/Vercel-oriented. Set exact origins only after domain confirmation; do not use wildcard CORS with credentials.
- `TRUSTED_PROXIES=*` is documented for the current deployment edge. Hostinger proxy/TLS behavior is unknown; verify generated URLs, secure cookie behavior, HTTPS redirects, and trusted forwarded headers rather than reusing this assumption blindly.
- `SecurityHeaders` contains a CSP permitting Vercel domains and third-party hosts; `frontend/vercel.json` supplies a different set of static headers. Review the deployed document's actual headers and replace stale host assumptions only after the Hostinger architecture is known.
- `.env.example` shows `SESSION_SECURE_COOKIE=false`; if sessions/cookies are used in production, cookie security must be configured for HTTPS. No security policy, code, or access controls were modified in this audit.
- Query-token acceptance in the custom API middleware should be mapped to its actual route consumers and kept out of general browser-link flows unless explicitly required; query tokens can leak into logs/history/referrers. This audit did not establish an exploitable endpoint.
- Secrets were not inspected. No full penetration test or endpoint-by-endpoint RBAC audit was performed.

## 8. Existing Test and Audit Evidence

Existing reports provide useful test targets but are historical and mixed in scope:

- `docs/DEPLOYMENT_READINESS_REPORT.md` (2026-09-24) documented a full backend run with 20 failures / 233 passes and unresolved privacy/payment E2E gates at that time.
- `AGENTS.md` records a later storage-hardening run with 8 unrelated full-suite failures and describes Playwright residual Windows load failures; it also records specific passing regression specs and fixed bugs.
- `docs/E2E_RELIABILITY_AUDIT.md` describes 105 passed / 13 failed / 3 flaky / 3 skipped at four workers and identifies Windows/dev-server starvation; this is not a Hostinger test.
- `browser-evidence/cross-role-e2e-audit/PAWESOME_CROSS_ROLE_E2E_READINESS_REPORT.md` records API workflow 29/29 but only 5/7 browser dashboards and Windows socket-exhaustion caveats (2026-08-20).

These results conflict in date, environment, and exact failure counts. Do not label current CI/E2E or migrated production GREEN from these reports. Reconcile against current source and rerun appropriate tests in a clean isolated MySQL/MariaDB staging environment later. Never run state-changing E2E against production.

## 9. Initial Risk Register and Status

| Area | Current status | Evidence / next gate |
|---|---|---|
| Hostinger account/runtime | **Site active; some settings reported** | User reports temporary site active on LiteSpeed with SSL and SSH. Plan resource limits are supplied; account values were not independently inspected. |
| PHP/Laravel compatibility | **CLI baseline matches; Composer check pending** | CLI PHP 8.3.33 is within `^8.2`; Composer 2.9.8 is present, and all CI-required extensions (`bcmath`, `gd`, `intl`, `pdo_mysql`, `zip`) appear in CLI output. Install dependencies privately and run Composer's platform check; Redis PHP extension does not prove a Redis service. |
| Database engine/schema | **High-risk gate; MariaDB 10.5 identified** | CI uses MySQL 8.0. Empty test DB `u837894234_pawcompat` is created; current size 1 MB of 3 GB maximum, remote access disabled. Charset/collation not exposed; no migrations/query workflows have been tested on MariaDB. |
| Queue/cron | **High-risk gate; cron limits unknown** | Cron/Artisan are reported supported, but no jobs exist and minimum interval/runtime/overlap limits are unknown. DB queue exists; Redis is not documented for shared Web/Cloud. Demonstrate safe processing and monitoring before relying on it. |
| Brevo HTTPS API | **Architecture preserved; delivery unverified** | Outbound HTTPS and actual inbox delivery are untested. Verify backend-only key configuration, outbox/worker state, real messages, links, and recipient inbox in staging. |
| Static frontend | **Likely suitable; not deployed** | Build `frontend/build`; verify SPA rewrites, API origin, direct routes and HTTPS on Hostinger. |
| Storage/privacy | **Limits partly known; secure layout unverified** | 50 GB disk/600,000 inodes reported; document root is currently `public_html`. Confirm Laravel internals/private storage remain outside public access and verify persistence/permissions before uploading data. |
| Production database/files/backups | **Unknown** | No production reads/backups/imports were made; source DB size/counts and backup/restore state are unknown. |
| Domains/DNS/TLS | **Temporary SSL active; production DNS unchanged** | Temporary-site SSL is reported active; final domain/API layout and production DNS remain unconfirmed. |
| Application/E2E readiness | **Not certified** | Historical test reports are stale/mixed; no tests were run in this audit. |

**Current decision:** **CONDITIONAL — staging compatibility work only; production migration/cutover NOT APPROVED.** CLI PHP 8.3.33, Composer 2.9.8, and the CI-required `bcmath`, `gd`, `intl`, `pdo_mysql`, and `zip` extensions are reported present; Composer platform verification and MariaDB 10.5 migration/workflow tests remain pending. Cron limits are unknown, and the secure Laravel document-root isolation is provider-reported but not independently tested. This is not a finding that Hostinger is incompatible. Do not migrate production data or change DNS until all database, PHP, queue, storage, and workflow gates pass. A hard stop applies if actual DB/resource/storage constraints are incompatible, or if queue/cron cannot safely process the workload and no approved external worker is available.

## 10. Recommended Order After Phase 1

1. The user's SSH output confirms CLI PHP 8.3.33, Composer 2.9.8, and CI-required extensions. Run `composer2 install --no-interaction --prefer-dist` only in the private test copy to populate `vendor`, then `composer2 check-platform-reqs`; do not run migrations during this step. If Composer creates `.env` from the placeholder template, keep it private and replace it with staging-only settings before any app execution.
2. Use the Hostinger-confirmed private sibling location for the backend, leave `public_html` and `DO_NOT_UPLOAD_HERE` untouched, and verify no symlink/alias exposes the app. The Hostinger agent's path claim is not independently tested.
3. Confirm charset/collation and database connection/size limits for the created MariaDB 10.5 test DB `u837894234_pawcompat`; it is empty, remote access is disabled, and no production data was imported. Keep its password private.
4. After the application copy is safely placed outside public access and PHP/CLI extensions are verified, apply migrations and run targeted tests against this isolated MariaDB database. Document engine differences and test representative enum, JSON, foreign-key, lock/transaction and payment/inventory workflows; make no speculative migrations changes.
5. Confirm cron cadence/runtime/overlap behavior. In isolated staging, prove scheduler plus bounded database-queue worker behavior and real Brevo test delivery before creating production cron entries.
6. Build the static frontend to the repository's `build/` output and verify the temporary-site SPA/API routing.
7. Only after separate explicit approval: produce and verify a production DB backup/restore plan, then rehearse database and file migration separately with comparison checks and rollback.
8. Deploy Hostinger staging and run full auth/RBAC, file authorization, booking/payment/receipt, email inbox, scheduler/queue, and cross-role browser workflows.
9. Require all cutover gates to pass, rehearse rollback, and obtain explicit approval before any DNS change. Keep Vercel/Railway until after a user-approved stabilization period.

## Phase 2 Handoff

The user reports the temporary site is active with SSL and SSH, website/CLI PHP 8.3.33, Composer 2.9.8, and CLI modules `bcmath`, `gd`, `intl`, `pdo_mysql`, and `zip` present. The `redis` PHP extension also appears but no Redis service is confirmed. The isolated database `u837894234_pawcompat` exists at 1 MB of a 3 GB maximum, with remote access disabled and no production data; its password was not shared. The archive is extracted at `backend_extract/backend`, outside `public_html`, and the user confirmed that directory with `pwd` from SSH. Hostinger reports the backend parent is outside the HTTP-served tree while the vHost is unchanged; leave `DO_NOT_UPLOAD_HERE` untouched and do not expose the folder with symlinks, aliases, or rewrites. Composer platform checks, DB charset/collation, and actual MariaDB migrations remain unverified. No dependency install, Artisan command, cron job, or migration has been run. Cron limits and queue behavior remain unverified.
