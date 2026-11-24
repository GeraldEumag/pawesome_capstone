# AUTOMATED_TEST_REPORT.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · **Authoritative engine:** MySQL 8.0.44 @127.0.0.1:3307 (`backend/phpunit.mysql8.xml`, DB `pawesome_test`).

## 1. Test-count reconciliation (mandatory fields)

| Metric | Value |
|---|---|
| Previous recorded result | 1,128 tests / 5,594 assertions / 1 skipped / 0 failed — 2026-11-18, MySQL 8.0.44 (`docs/audit/SYSTEM_AUDIT_TRACKER.md`) |
| Current execution result | **1,288 tests / ~5,9xx assertions / 1 skipped (GD) / 0 failed** — see §2 for final tally |
| Delta | +160 tests (new coverage added by commits after the recorded run, incl. HEAD `3ec1845b` POS/concurrency hardening, payroll 2026, stock-movement system, plus this revision's `InventoryUnitOfMeasureTest` +9) |
| Regression explanation | First current-HEAD run exposed **67 failures/errors** — root-caused to (a) test-isolation pollution from two concurrency specs committing fixtures, (b) two real concurrency defects (notification FK-lock deadlock; idempotency-key gap-lock deadlock), (c) a stale-snapshot oversell in return validation, (d) one stale registration test payload. All fixed this revision (FR-04…FR-08). |
| Evidence location | This file + `FINAL_SYSTEM_REVISION_TRACKER.md` + git commits on `audit/pawesome-final-acceptance` |

## 2. Backend suite — MySQL 8 (authoritative)

**FINAL: 1,288 tests / 6,420 assertions / 1 skipped / 0 failed — GREEN.**

Command: `cd backend && ./vendor/bin/phpunit -c phpunit.mysql8.xml`

| Run | Result | Notes |
|---|---|---|
| Baseline-equivalent (default `phpunit.xml` → MariaDB 10.4 @3306) | NOT AUTHORITATIVE | Abandoned — wrong engine; produced `employee_no`-missing errors against a stale MariaDB `pawesome_test`. MySQL 8 @3307 is the required target per plan + prior audit. |
| First MySQL 8 run (pre-fix) | 1,288 tests — 7 errors, 60 failures | Pollution + real defects documented above |
| Targeted re-runs | concurrency pair 2/2, POS financial 10/10, payroll ordering 9/9 | Fixes verified in isolation |
| **Final full run** | **1,288 tests / 6,420 assertions / 1 skipped (GD) / 0 failed / 0 errors — PASS** in 7m27s | `./vendor/bin/phpunit -c phpunit.mysql8.xml`, MySQL 8.0.44 @3307 |

> Final tally recorded in `FINAL_IMPLEMENTATION_SUMMARY.md` §verification.

## 3. Frontend automated tests

| Check | Command | Result |
|---|---|---|
| Unit/component | `npx vitest run` | **75/75 PASS** (15 files) |
| Production build | `npm run build` | PASS — `index-*.js` 3,711 kB / gzip 1,087 kB; chunk-size warning only |
| Lint | `npm run lint` | **BLOCKED (environment)** — `@eslint/js` absent from `node_modules`; pre-existing dependency-state issue; no lockfile changes made per AGENTS.md |
| Dependency audit | `npm audit` / `composer audit` | npm: `xlsx@0.18.5` advisories only (risk-accepted, C-03); composer: clean |

## 4. New/updated tests this revision

| Test | Coverage | Result |
|---|---|---|
| `tests/Feature/InventoryUnitOfMeasureTest.php` (new, 9 tests) | pack/box UOM conversion, invalid units, stock in/out base-unit math, payload exposure | PASS |
| `tests/Feature/BarcodeLookupTest.php` (updated) | auto-EAN13 generation, check digit, uniqueness, lookup | PASS |
| `tests/Feature/PublicRegistrationIntegrityTest.php` (fixed payload) | privileged-field injection still ignored | PASS |
| `tests/Feature/PosConcurrentStockTest.php` + `InventoryConcurrentReturnTest.php` (tearDown cleanup) | committed-row isolation | PASS |
| `frontend/.../AddProductModal.test.jsx` (updated) | UOM fields render/submit | PASS (2/2) |

## 5. Environment notes

- MySQL 8 instance (`C:\xampp\mysql8`, port 3307) was started manually for this revision (`mysqld --datadir=C:/xampp/mysql8/data --port=3307`); it is a throwaway local instance.
- XAMPP MariaDB 10.4 @3306 hosts dev DB `pawesome` and audit DBs (`pawesome_e2e_audit`) — not authoritative for suite verification.
- `php artisan test -c phpunit.mysql8.xml` does **not** work (`artisan test` ignores `-c`); use `./vendor/bin/phpunit -c phpunit.mysql8.xml`.
