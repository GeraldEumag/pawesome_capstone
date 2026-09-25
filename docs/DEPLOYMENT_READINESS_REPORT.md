# Pawesome Deployment Readiness Report

**Audit date:** 2026-09-24  
**Scope:** Read-only repository/architecture audit plus bounded deployment hardening and isolated tests.  
**Deployment performed:** No.  
**Production/staging databases accessed:** No.

## Executive Summary

Pawesome is **not ready for deployment** in either deployment mode. The repository-level deployment foundation is improved: a root-discoverable CI workflow now validates backend/frontend changes, backend Composer advisories were remediated, environment examples distinguish local-volume from S3-compatible storage, and new medical-confinement proofs and pet photos are private.

Several release-blocking areas remain. The full backend suite reports **20 failures and 233 passes**. Second, historical medical-confinement payment proofs and pet photos may remain in public local storage; no database or file inventory was performed, and those files were deliberately not moved or deleted. Boarding/confinement care-log photos also remain on the public disk pending a documented privacy/access decision. The payment-workflow Playwright spec also has 3 failing tests, so the payment proof → cashier verification path was not proven end-to-end.

The current frontend audit reports one high-severity `xlsx` advisory with no available npm fix. The source uses the dependency for workbook generation only, not workbook parsing; this reduces the apparent attack surface but does not remove the dependency advisory. The exception still requires a release owner decision and a replacement/remediation plan for business production.

**Final readiness decision — Capstone Demo: BLOCKED**  
**Final readiness decision — Business Production: BLOCKED**

## Current Architecture and Repository State

- Backend: Laravel 12, PHP 8.2+, MySQL, Sanctum personal access tokens.
- Frontend: React 18 + Vite, configured to build into `frontend/build`; Vercel SPA configuration remains in `frontend/vercel.json`.
- Browser tests: Playwright under `frontend/e2e/`.
- Email: queued Laravel mailables and Brevo SMTP configuration.
- Optional AI: Gemini configured server-side.
- Local branch: `main`; local `HEAD` and local `origin/main` ref were both `8ef3f8a6931769a1181f90b19e5311a601e0b5a4`. No live remote fetch was made.
- The original modified ignored `frontend/test-results/.last-run.json` remains modified and was not staged, reset, or overwritten. Its original diff indicated three failed test IDs; the ignored-file read protection prevented inspecting its contents.
- The original untracked `docs/PAWESOME_PRODUCTION_HOSTING_PLAN.docx` remains untouched. The DOCX could not be read by the available text reader; conclusions do not claim review of its binary contents.
- New/changed deployment work is mixed into the existing `main` worktree because the user requested preservation and no branch/reset/stash operation was authorized. No commit was created.
- A new local MySQL database `pawesome_devin_test_20260924` was used for backend tests and `pawesome_e2e_devin_20260924` for seeded E2E checks. The latter contains demo seed accounts/data. Neither database is a production database; neither was dropped.

## Existing Deployment Architecture

### What is now present

- Vercel frontend configuration with Vite build output and SPA rewrites.
- A root `.github/workflows/ci.yml` workflow for pull requests, pushes to `main`, and manual CI dispatch. It performs backend Composer validation/audit, MySQL-backed migrations/tests, frontend npm audit threshold check, and a production frontend build. It **does not deploy**.
- Railway-oriented environment examples/runbooks; no Railway manifest or actual Railway service was verified.
- A generic Laravel S3 filesystem driver plus new separate configurable public/private disks.

### Legacy configuration

- `backend/.github/workflows/deploy.yml` remains in its original nested location. GitHub only discovers workflow files under repository-root `.github/workflows/`, so this nested workflow is not active. If moved without edits, it would still run Composer/Artisan/Vercel from the repository root and has three parallel provider deployments (Vercel, Railway, Render) on `main`.
- `backend/render.yaml` remains untouched and non-canonical. It configures Render services and runs `php artisan migrate --force` at web-service startup. Confirm it is not attached to an active service before any release; it was not deleted or relabeled in this pass.
- There is no checked-in Dockerfile, Compose file, or Railway service manifest. Provider-side build/start commands, credentials, disks, and volumes were not verified.

## Target Architecture

**Shared baseline:** Cloudflare DNS/TLS (only after domain ownership is verified) → Vercel React/Vite frontend and Railway Laravel 12 API → Railway MySQL. The backend owns authorization, payment verification, inventory changes, receipts, and all secret-bearing integrations.

**Capstone demo:** Vercel + Railway app/MySQL + a persistent volume mounted at Laravel `storage/app`; local public/private disks; `QUEUE_CONNECTION=sync`; Brevo and optional server-side Gemini. No business-production service-level claim is made for low-cost demo resources.

**Business production:** separate staging and production Vercel/Railway environments; isolated MySQL per environment; Redis with a supervised queue worker and scheduler; separate private/public R2/S3-compatible buckets; verified backups/restores, monitoring, alerts, and gated releases/rollback. Sensitive payment and pet-photo objects stay private and are served through authorized routes.

## Detailed Audit by Area

- **Frontend:** React 18/Vite is confirmed; Vercel points at the Vite build directory with SPA rewrites and security headers. `VITE_API_BASE_URL` remains a build-time public URL that must be set in Vercel. Build passed in a separate temporary output directory. No frontend server credential was added.
- **Backend:** Laravel 12/PHP 8.2+ is confirmed from Composer. The stale root README, agent guide, and PWA manifest branding were updated. Composer setup no longer performs an automatic forced migration; the dev script no longer invokes the removed Pail package.
- **Database/migrations:** MySQL is the required test/release driver; SQLite fails on a MySQL-specific `ALTER TABLE ... MODIFY` migration. All migrations completed on a newly created isolated E2E MySQL database. This is not evidence about any production database's migration state or compatibility with existing rows.
- **Seeding:** `DatabaseSeeder` creates explicit demonstration accounts and sample data. They were used only in the isolated E2E database. Production initialization remains a separately controlled task; do not seed these known demo accounts in business production.
- **Authentication/RBAC/IDOR:** Sanctum token authentication uses custom `ApiTokenAuth` middleware and auth endpoints have a configured strict throttle. `P1SecurityIntegrityTest` and `CustomerDataIsolationTest` passed in the full test run. Existing security/RBAC reports are dated August 2026 and were treated as historical, not fresh proof for all roles/endpoints.
- **File uploads:** Reviewed proof/photo inputs use MIME allowlists and 5 MB caps. New confinement proofs and pet photos now use the private disk; pet-photo reads check ownership and use private cache headers. Profile photos and landing-page assets remain public by design. Boarding/confinement care-log photos still use the public disk and have no frontend consumer found; confirm the privacy requirement and add authorized retrieval before business production. Existing public payment proofs and pet photos were not inspected or migrated.
- **Email:** Verification, password reset, welcome, and customer mailables are queued `ShouldQueue` mailables. `MAIL_*` values are placeholders; Brevo delivery, sender verification, SPF/DKIM/DMARC, and inbox delivery were not tested.
- **Chatbot:** Gemini keys are configured server-side; the frontend only calls the backend. Chatbot remediation/end-to-end test suites passed, but live Gemini credentials/provider behavior and external prompt-injection checks were not exercised in this session.
- **Queue/Redis/scheduler:** Demo examples now use a synchronous queue and file cache. Business production requires Redis, a compatible PHP Redis client/extension, worker monitoring, and a scheduler process for the daily reminder schedule. None was tested against a hosted Redis service.
- **Dependencies:** Composer lock drift and reported advisories were addressed; `composer validate` and `composer audit` now pass. `npm audit` still reports the high `xlsx` advisory with no fix. `npm outdated` was reviewed but broad non-security upgrades were not applied.
- **CI/CD:** The nested legacy deploy workflow is not discovered by GitHub. A root workflow now runs backend/frontend checks and has no deployment jobs. YAML syntax was parsed locally; GitHub-hosted execution, protected environments, branch protection, and required-check settings were not verified.
- **Domains/CORS/Sanctum:** Configuration is environment-driven with placeholders. Actual Vercel/Railway/custom domains, Cloudflare DNS/TLS, cookie behavior, CORS preflight, and Sanctum browser flows were not tested against deployed origins.
- **Storage/R2:** The S3 adapter and separate configurable private/public disks are present. There are no live buckets/credentials, and R2 endpoint compatibility, permissions, direct public object policy, path-style behavior, persistence, and authorized download behavior remain unverified.
- **Backups/recovery:** No production backup policy or restore was inspected or run. The runbook defines the expected process; business production remains blocked until a restore drill passes.
- **Monitoring/health:** `/api/health` is a low-information liveness endpoint only. No application error monitor, host alerting, database monitor, queue-failure alert, or storage monitor was configured.
- **Performance:** Vite reports mixed static/dynamic import warnings and a 3.27 MB minified main chunk. No browser performance, API latency, database query, or production-load measurements were made.

## Deployment Gaps and Issues

### P0 — Production blocker / security or data exposure

#### PAW-P0-01 — New confinement proof uploads were public (fixed for future uploads)
- **Severity:** P0
- **Category:** File upload security / privacy
- **File:** `backend/app/Http/Controllers/MedicalConfinementController.php:174`
- **Problem:** The upload method stored `payment-proofs/confinements` on the `public` disk. `storage:link` can make local public-disk files reachable without the authenticated file endpoint.
- **Impact:** A customer's payment document could be directly fetched by URL.
- **Evidence:** Initial source used the `public` disk; service-request, customer-order, and boarding proof uploads use `private`. The secure-file controller has legacy support for public payment-proof paths.
- **Recommended fix:** Store new confinement payment proofs on the `private` disk and assert no copy exists on `public`.
- **Risk:** Existing database records/files may still point to public files. No live or production data was inspected.
- **Verification:** Added `PrivateConfinementPaymentProofTest`; it first failed on the public/private assertion, then passed with 4 assertions after the disk change on isolated MySQL.
- **Status:** Fixed for new uploads; legacy data exposure is separately open as `PAW-P0-02`.

#### PAW-P0-02 — Legacy public payment proofs not inventoried or migrated
- **Severity:** P0
- **Category:** File upload security / privacy / data migration
- **File:** `backend/app/Http/Controllers/Api/SecureFileController.php:99-117`; storage roots in `backend/config/filesystems.php`
- **Problem:** The secure-file controller deliberately supports legacy payment-proof paths on the public disk. If older confinement proofs were stored under `storage/app/public/payment-proofs/confinements`, a public storage URL could bypass controller authorization.
- **Impact:** Unknown existing payment documents may remain directly accessible.
- **Evidence:** Previous controller code stored confinement proofs under the `public` disk; the current file-serving controller detects legacy `payment-proofs/` paths on public storage. Current database/file inventory was intentionally not performed.
- **Recommended fix:** Before staging/production approval, take a backup, inventory only the selected environment's affected database paths and object/filesystem contents, migrate matching files to the private volume/bucket, update stored paths, validate authenticated owner/staff access, and only then retire the legacy public fallback. Do not bulk-move or delete files without an approved, reversible procedure.
- **Risk:** Existing records could be broken or data lost if moved without a verified mapping/backup.
- **Verification:** Not performed; needs a controlled database/storage migration plan.
- **Status:** Open; blocks both release modes until the target data state is proven safe.

### P1 — Major deployment, workflow, or security problem

#### PAW-P1-07 — Pet photos were stored publicly despite owner-checked reads
- **Severity:** P1
- **Category:** File upload security / privacy / IDOR
- **Files:** `backend/app/Http/Controllers/PetController.php:113-116,162-167`, `backend/app/Http/Controllers/Customer/PortalController.php:285-287`, `backend/app/Http/Controllers/Api/SecureFileController.php:321-375`
- **Problem:** New pet photos were written to the public disk even though their intended file-view endpoint enforces customer ownership and staff authorization. The public cache header also allowed shared caching.
- **Impact:** A direct public storage URL could bypass the endpoint's owner check.
- **Evidence:** Source inspection traced both customer upload paths, the owner-checking view endpoint, and the `Pet::image_url` API route.
- **Recommended fix:** Store future pet photos on the private disk; have the secure endpoint read private files first, retain a compatibility fallback for legacy public files, and send a private cache header.
- **Risk:** Existing public pet photos remain directly accessible until inventoried and migrated through a backed-up procedure.
- **Verification:** Added `PrivatePetPhotoTest`; creation/update storage, authorized owner read, denied other-customer read, and replaced-file cleanup passed (11 assertions) on isolated MySQL.
- **Status:** Fixed for new uploads and replacement behavior; legacy files remain open.

#### PAW-P1-08 — Care-log photos remain on public storage
- **Severity:** P1
- **Category:** File upload security / privacy
- **Files:** `backend/app/Http/Controllers/BoardingController.php:1344`, `backend/app/Http/Controllers/MedicalConfinementController.php:224`
- **Problem:** Boarding and medical-confinement care-log photos are stored on the public disk. No frontend consumer for `photo_path` was found, and no dedicated authorized photo retrieval route exists.
- **Impact:** Anyone with a public storage URL may fetch an image associated with a pet's care/medical record.
- **Evidence:** Static upload search found both public-disk writes; frontend search found no `photo_path`/care-log image consumer.
- **Recommended fix:** Confirm intended customer/staff access, then move new care-log images to private storage and add an owner/role-authorized view endpoint before exposing the feature. Migrate existing paths only with an approved backup/mapping plan.
- **Risk:** Switching storage without a retrieval endpoint could silently break any non-searchable external/UI consumer; current privacy expectation is not documented.
- **Verification:** Not implemented or tested in this pass.
- **Status:** Open; close before business production and determine demo privacy requirements.

#### PAW-P1-01 — No successful full backend test gate
- **Severity:** P1
- **Category:** QA / release gate
- **Files:** `backend/tests/Feature/*`, `backend/tests/Unit/InventoryItemValidationTest.php`
- **Problem:** The complete backend suite produced 233 passes and 20 failures (1,058 assertions).
- **Impact:** Current release confidence is insufficient; the new CI backend job will correctly remain red until failures are triaged.
- **Evidence:** Full suite ran against isolated `pawesome_devin_test_20260924` MySQL. Failures span `CentralizedDataFlowTest`, `DatabaseIntegrityTest`, `EndToEndBusinessFlowTest`, `FullSystemIntegrationTest`, `InventoryItemValidationTest`, `InventoryTest`, `PayrollEndToEndTest`, `ReportsTest`, and `VeterinaryWorkflowTest`. Observed failure families include missing required barcode values, `discontinued` status rejected/truncated by the MySQL enum, stale expected response/status fields, payroll assertions, tax calculations, low-stock counts, and a veterinary completion 422. Passing suites included `P1SecurityIntegrityTest`, `CustomerDataIsolationTest`, `EmailAuthFlowTest`, `POSTest`, chatbot suites, and the new private-proof/photo tests.
- **Recommended fix:** Triage each failure against current product requirements; correct genuinely broken code, update demonstrably obsolete tests to current API contracts, and rerun the full suite. Do not weaken the CI gate to hide failures.
- **Risk:** Some failures may reveal actual business workflow defects; others appear to be stale test assumptions. Each requires owner review.
- **Verification:** Full suite rerun required after remediation.
- **Status:** Open; the new CI job runs the full suite and is expected to fail currently.

#### PAW-P1-02 — Payment-workflow E2E suite still has stale selectors and incomplete proof coverage
- **Severity:** P1
- **Category:** E2E / critical workflow
- **File:** `frontend/e2e/phase4-payment-workflow.spec.js`
- **Problem:** The phase-4 workflow test had stale login selectors and did not dismiss the success modal. Those were updated to match the current login form; the latest rerun still had 3 failures and 3 passes.
- **Impact:** Payment-proof upload, cashier verification, and the complete customer status loop were not verified in a browser.
- **Evidence:** Latest rerun passed chatbot FAQ, landing z-index, and registration validation checks. The first payment test stopped at a stale logout selector; the vaccination-card and receptionist tests stopped at stale `.hotel-form` / `.approvals-table` selectors. The seeded E2E database had no unpaid/rejected payment (`Found 0 unpaid/rejected payments`), so the proof upload branch was skipped.
- **Recommended fix:** Update E2E selectors/routes to actual current components and seed an isolated, explicit approved/unpaid record or build a deterministic API fixture to exercise upload → cashier verification → customer status. Keep screenshot/artifact output isolated.
- **Risk:** Do not run these state-changing tests against a shared or production database.
- **Verification:** Latest run 3/6 passed; rerun required after test fixture/selector correction.
- **Status:** Open.

#### PAW-P1-03 — High npm advisory in `xlsx` has no available fix
- **Severity:** P1
- **Category:** Dependency security
- **File:** `frontend/package.json:30`, `frontend/src/utils/reportExport.js`, `frontend/src/utils/advancedReportExport.js`, `frontend/src/components/inventory/MonthlyInventoryAudit.jsx`
- **Problem:** `npm audit` reports one high-severity package (`xlsx`) with prototype-pollution and ReDoS advisories and no available fix.
- **Impact:** A high advisory remains in a production dependency.
- **Evidence:** Current source usages call workbook-generation APIs (`aoa_to_sheet`, `json_to_sheet`, `book_new`, `book_append_sheet`, `writeFile`); no workbook parsing API was found in `frontend/src`.
- **Recommended fix:** Keep an explicit release exception with owner/expiry and restrict use to export-only paths; evaluate a maintained replacement or remove the dependency when product-compatible. Do not use `npm audit fix --force`.
- **Risk:** The export-only finding is a limited exploitability assessment, not proof that all attack paths are impossible.
- **Verification:** `npm audit` still reports the high advisory; `npm audit --audit-level=critical` succeeds while preserving the warning.
- **Status:** Open; staging/business release requires explicit risk acceptance or dependency replacement.

#### PAW-P1-04 — Provider setup, domains, backups, and recovery are unverified
- **Severity:** P1
- **Category:** Infrastructure / recovery
- **Files:** Provider settings not present in repository; runbook in `docs/DEPLOYMENT.md`
- **Problem:** No Railway/Vercel credentials, target domains/DNS, object buckets, persistent volume, backup service, monitor, or restore exercise was verified.
- **Impact:** Code changes cannot prove that deployed services are persistent, recoverable, monitored, or correctly isolated.
- **Evidence:** Repository-only audit; no provider APIs or deployment were called.
- **Recommended fix:** Provision staging and demo resources first, validate storage and backup/restore, then arrange production resources and credentials outside source control.
- **Risk:** Without provider-level checks, local configuration may not match actual runtime capabilities.
- **Verification:** Not performed.
- **Status:** Open; blocks deployment.

#### PAW-P1-05 — Legacy Render start command performs migration at startup
- **Severity:** P1
- **Category:** Deployment safety
- **File:** `backend/render.yaml:7-9`
- **Problem:** Render start command runs `php artisan migrate --force` on each service startup, and the file competes with the Railway target architecture.
- **Impact:** If accidentally connected to an active service, application boot controls schema changes and complicates recovery.
- **Evidence:** Manifest inspection; no Render service state was checked.
- **Recommended fix:** Keep the manifest out of canonical releases; verify no active Render service relies on it. If Render is explicitly retained, move migrations to an approved release step and test a rollback procedure before activation.
- **Risk:** Do not delete the historical config or change a provider service before its actual usage is known.
- **Verification:** No Render integration was exercised.
- **Status:** Classified legacy/non-canonical; active use remains unverified.

#### PAW-P1-06 — Historical test results are not a substitute for current E2E evidence
- **Severity:** P1
- **Category:** QA / release evidence
- **File:** `frontend/test-results/.last-run.json` (user-owned ignored artifact; unchanged)
- **Problem:** It showed three failed test IDs before this pass and could not be read under ignore-file restrictions. The phase-4 E2E test also remains partially failing.
- **Impact:** The prior failure state is unmapped and should not be included in a release commit.
- **Evidence:** Initial `git diff` showed its status changed from passed/no failed tests to failed/three IDs; new tests used a separate temporary output directory.
- **Recommended fix:** Preserve the original artifact and use current isolated Playwright output. Map or ignore historical IDs only through a user-approved way to inspect the ignored file.
- **Risk:** Overwriting/staging the artifact would obscure pre-existing user test state.
- **Verification:** Role smoke suite passed; phase-4 suite still has 3 failures.
- **Status:** Original artifact preserved; current payment workflow evidence remains open.

### P2 — Important but non-blocking improvement

#### PAW-P2-01 — Health endpoint is liveness-only
- **Severity:** P2
- **Category:** Health/observability
- **File:** `backend/routes/api.php:70-73`
- **Problem:** `/api/health` returns a fixed `{"status":"ok"}` and does not test database, cache, or storage. Laravel also exposes `/up`.
- **Impact:** A live PHP process can report healthy while a dependency is unavailable.
- **Recommended fix:** Keep the public endpoint as low-information liveness; use provider checks or a separate safe readiness probe for database/cache/storage. Avoid an unauthenticated endpoint that leaks service internals.
- **Risk:** Not a blocker for simple demo liveness checks; business production needs external readiness/monitoring.
- **Verification:** Route discovery succeeded; HTTP runtime check was not made after shutdown.
- **Status:** Open improvement.

#### PAW-P2-02 — Frontend build has large chunks and import warnings
- **Severity:** P2
- **Category:** Performance
- **File:** `frontend` bundle
- **Problem:** Build passes, but Vite warns about mixed static/dynamic imports and a main JS chunk of about 3,274.70 kB minified (954.49 kB gzip), above its 500 kB warning threshold.
- **Impact:** Initial page load may be slower on constrained networks/devices.
- **Recommended fix:** Measure real page-load impact and consider route-level code-splitting; do not change chunking without bundle/UX tests.
- **Risk:** No production performance measurements are available.
- **Verification:** Vite build completed: 2,147 modules transformed; warning recorded.
- **Status:** Open, non-blocking.

#### PAW-P2-03 — Multiple package updates are available
- **Severity:** P2
- **Category:** Dependency maintenance
- **Files:** `frontend/package.json`, `frontend/package-lock.json`
- **Problem:** `npm outdated` lists several available in-range updates and newer major versions. No blanket update was applied.
- **Impact:** Some non-security bug fixes/features may be missing.
- **Recommended fix:** Schedule dependency upgrades separately with lockfile review and tests; avoid major React/Vite upgrades as part of this deployment-only pass.
- **Risk:** Broad updates could introduce unrelated regressions.
- **Verification:** `npm outdated` completed and was reviewed.
- **Status:** Open maintenance work.

## Implemented Changes

- Added `.github/workflows/ci.yml` at the correct repository root. It runs on PR/main/manual dispatch, installs backend/frontend dependencies, audits PHP dependencies, migrates an isolated MySQL CI service, runs the full backend suite, builds the frontend, and has no deployment jobs or provider secrets.
- Kept `backend/.github/workflows/deploy.yml` and `backend/render.yaml` intact; documented them as legacy/non-canonical rather than deleting them.
- Changed new medical-confinement proof uploads to the `private` disk and added `PrivateConfinementPaymentProofTest`.
- Changed new pet-photo uploads from both customer paths to the `private` disk, made the authorized photo endpoint private-first with a legacy public fallback/private cache header, and added `PrivatePetPhotoTest`.
- Added configurable public/private S3-compatible disks with separate bucket/URL settings, and installed `league/flysystem-aws-s3-v3` for the documented business-production storage mode.
- Updated backend example defaults for simple demo operation (`QUEUE_CONNECTION=sync`, file cache, local disks) and added Redis/R2 environment keys; no live secrets were added.
- Updated PHPUnit defaults to a dedicated MySQL database because SQLite in-memory migrations fail on MySQL-specific SQL.
- Removed automatic forced migration from the Composer setup script and removed a stale `pail` invocation from the dev script after `laravel/pail` was absent from `composer.json`.
- Updated Composer lock dependencies within existing framework constraints. Composer audit went from 37 advisories across 11 packages to no advisories; installed Laravel is now 12.69.2. The S3 SDK lock version was selected from a release older than seven days at audit time.
- Rewrote the root README for Laravel/Vite and updated `AGENTS.md`, frontend API example, and PWA manifest branding.
- Added `docs/DEPLOYMENT.md` with separate demo/business modes, environment matrices, migration, storage, queue, scheduler, backup, rollback, and smoke guidance.
- Updated the phase-4 payment E2E test's login controls to match the current login page and dismiss its success dialog; downstream selectors remain stale and are recorded above.

## Mode A — Capstone Demo Readiness

**Decision: BLOCKED**

Proposed target is Vercel + Railway Laravel + Railway MySQL + a Railway persistent volume for `storage/app`, Brevo, optional Gemini, and `QUEUE_CONNECTION=sync`. The report/runbook includes the environment matrix and manual sequence. Blocking items are: unknown legacy public proof/pet-photo state, public care-log photos with no documented access policy, 20 failing backend tests, 3 failing phase-4 browser tests, and unverified provider/domain/volume setup. Do not seed demo credentials into a business environment.

## Mode B — Business Production Readiness

**Decision: BLOCKED**

Proposed target is separate staging/production Vercel/Railway services, MySQL, Redis worker and scheduler, distinct private/public R2/S3 buckets, tested backups/restores, monitoring, and gated releases. In addition to the common P0/P1 items above, care-log photo access, object-storage connectivity/bucket policy, Redis runtime support, worker/scheduler behavior, production backup/restore, and the unresolved `xlsx` high advisory require closure/acceptance. No production domain or provider resource was verified.

## Environment Variable Matrix

The complete mode-specific matrix is in `docs/DEPLOYMENT.md`. Key common variables include `APP_ENV`, `APP_DEBUG`, `APP_KEY`, `APP_URL`, `FRONTEND_URL`, `DB_*`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS`, `VITE_API_BASE_URL`, and `MAIL_*`. Business mode additionally requires isolated Redis values, worker/scheduler services, `PRIVATE_STORAGE_DRIVER=s3`, `PUBLIC_STORAGE_DRIVER=s3`, separate `AWS_PRIVATE_BUCKET`/`AWS_PUBLIC_BUCKET`, endpoint, access keys, and public URL. All credentials remain host-side secrets.

## Verification Results

| Check | Result |
| --- | --- |
| Local branch/HEAD vs local `origin/main` | Match at `8ef3f8a`; no live fetch |
| Composer validate | PASS |
| Composer audit after updates | PASS — no advisories |
| npm audit | FAIL for 1 high `xlsx` advisory; no fix available |
| npm audit critical threshold | PASS, warning remains visible |
| npm ci | PASS — lockfile install added 197 packages; reported the same 1 high advisory |
| npm outdated | Completed; multiple available updates, no broad upgrades applied |
| PHP syntax for changed controller/test/filesystem config | PASS |
| New private-confinement storage regression | PASS — 1 test, 4 assertions on isolated MySQL |
| New private-pet-photo/owner-access regression | PASS — 1 test, 11 assertions on isolated MySQL |
| Full backend suite | FAIL — 20 failed, 233 passed |
| Isolated E2E database migrations/seeding | PASS — migrations completed, demo data seeded only into new isolated local E2E DB |
| Root CI workflow YAML parse | PASS via Symfony YAML parser |
| Health route discovery | PASS — route exists |
| Frontend production build after `npm ci` | PASS — 2,147 modules; built to a fresh temporary directory to preserve pre-existing `frontend/build` assets; bundle warnings noted |
| Playwright role dashboard smoke | PASS — 7/7 roles |
| Playwright phase-4 payment workflow | FAIL — 3 failed, 3 passed; payment upload branch not reached because seed had no unpaid/rejected proof |
| Actual GitHub Actions run | NOT RUN — no push/PR was made |
| Provider deployment, DNS, R2, Redis, backup/restore | NOT RUN |

## Required Changes Before Release

1. Inventory and safely privatize legacy public medical-confinement proofs and pet photos in the actual target environment; record backup and path-reconciliation evidence.
2. Confirm care-log image privacy expectations; add a private authorized retrieval path or explicitly document a public-sharing requirement before business production.
3. Resolve the 20 backend test failures. Keep `php artisan test` as a required CI gate.
4. Repair/rebuild the payment E2E fixture and selectors so the full customer-upload → cashier-verify → customer-status flow passes with an unpaid test record.
5. Resolve or formally accept the `xlsx` high advisory and assign an owner/replacement decision, especially before business production.
6. Create and verify provider resources, exact domains/CORS/Sanctum values, Railway persistence or R2 buckets, queue worker/scheduler, monitoring, backup retention, restore drill, and rollback rehearsal.
7. Confirm no active Render service or hidden deployment integration still depends on the legacy configuration.

## Deployment and Rollback Runbooks

Use `docs/DEPLOYMENT.md`. In summary: CI → staging → backup → reviewed `migrate --pretend` → controlled `migrate --force` → deploy → health/smoke verification. Roll application code back to a known-good release only when schema compatibility allows; do not run automatic destructive migration rollbacks. Database restore is a separately approved recovery operation because it can discard writes.

## Final Recommendation

Do not deploy yet. Use the new root CI workflow as a guardrail, but it will currently fail on the known backend test failures. Keep the worktree uncommitted and preserve the original `.last-run.json` and hosting DOCX. The next work should focus on the P0 historical-proof inventory and P1 backend/E2E failures, then obtain provider-level staging evidence before reconsidering either readiness decision.
