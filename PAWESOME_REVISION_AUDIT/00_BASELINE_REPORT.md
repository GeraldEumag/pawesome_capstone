# 00 — Baseline Report

**Engagement:** Pawesome CAP-B Final System Revision Audit (audit-and-fix)
**Branch:** `audit/pawesome-final-acceptance`
**Date:** 2026-11-28
**Auditor:** Devin (autonomous audit agent)

## Environment

| Component | Version / State |
| --- | --- |
| PHP | 8.2.12 (ZTS, XAMPP) — no GD extension |
| Laravel | 12.72.0 |
| Frontend | React 18.3 + Vite 6 |
| Tests | PHPUnit (backend), Vitest 5, Playwright 1.59 |
| Database | MySQL via XAMPP; dev DB `pawesome`, test DB `pawesome_test` (phpunit.xml pins MySQL) |
| Queue/Mail (local) | `MAIL_MAILER=log`; tests `array` |

## Prior audit baseline

- `docs/final-revision/` contains 14 deliverables from a prior audit-and-fix
  engagement, verdict **PARTIALLY VERIFIED**. Per engagement scope, all
  load-bearing claims are being re-verified against current code; evidence is
  only reused where re-confirmed.
- HEAD at audit start: `4e12e742 docs(final-revision): 14 deliverables +
  acceptance verdict`.

## Test-suite baseline (pre-fix, HEAD)

- Full backend suite on `pawesome_test`: **1282 passed, 5 failed, 1 skipped**
  (~588s).
- The 5 failures were reproduced deterministically on a clean tree (changes
  stashed) and are therefore **pre-existing, not regressions**:
  - `DatabaseIntegrityTest` › receptionist appointment creates database record
  - `DatabaseIntegrityTest` › complete customer journey data persistence
  - `FullSystemIntegrationTest` › complete business day simulation
  - `NotificationMatrixTest` › service request submitted notifies receptionist roles
  - `VeterinaryWorkflowTest` › veterinary can create start complete and edit assigned appointment
- Root cause (verified in Stage 7): tests hardcoded `now()->addDays(1..3)`
  booking dates. On 2026-11-28, `+2 days` = **2026-11-30 (Bonifacio Day)**, a
  `holidays`-table-blocked date, so `BookingAvailabilityService` rejected the
  slot. `AppointmentController::store` then masked the real reason behind a
  generic "Time slot overlaps an existing booking." message.
- Secondary latent defect found during the fix: `PetFactory` randomized
  `species`, which — once server-side species enforcement was added — made
  booking tests probabilistically fail (~5% per random service+pet pair).

## Environment quirks (documented, not defects)

- `php artisan serve` is single-threaded on Windows; E2E must use
  `C:/xampp/pawesome-maintenance/php-worker-pool.js` (:8000 → worker pool).
- XAMPP Apache must not serve the repo (root `.htaccess` denies HTTP on
  purpose). Audit scripts live outside the repo in `C:/xampp/pawesome-maintenance/`.
- No `mysql` CLI; DB inspection via `php artisan tinker` / PDO.
- Local PHP CLI lacks GD → image-upload tests must use
  `UploadedFile::fake()->create()` / `createWithContent()`.

## Scope guardrails

- Dev DB `pawesome` is read-only for audit; all schema verification is
  read-only. Any schema change ships as a new migration tested on
  `pawesome_test` first.
- No destructive operations; no secrets in repo; no `yarn install`
  (lockfile absent — npm/npx only).
