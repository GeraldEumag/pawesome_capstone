# Phase 3.1 Acceptance Verification Baseline

## Verification update

The actual baseline remains branch `audit/pawesome-final-acceptance` at commit `afd48899e3aa92e65aa0d2364229d5010ad6d9a6`. The worktree was dirty before the Phase 3.1 checks; prior Phase 1/2/3 changes were preserved.

Before application-source changes, the Phase 3.1 plan and isolated database/API/frontend were documented and checked. Browser mutations used `pawesome_phase3_1_browser_audit`; focused backend tests used the separately created `pawesome_phase3_1_backend_audit`. Neither database was reset or dropped, and all new fixtures were intentionally retained.

Verification found the barcode validation state was applied to the input but its `errors.barcode` message was not rendered. A browser test reproduced that discrepancy before the limited UI fix. Verification also reproduced a partial-commit defect in grooming service consumption; both grooming and boarding now roll back all usage-line changes if any submitted line fails. See reports 02, 05, and 09 for exact results.

The Phase 3.1 acceptance verdict remains **PARTIALLY ACCEPTED — NOT COMPLETE**. MySQL 8 is unavailable; uncertain-failure browser retry, full POS checkout UI, veterinary service consumption, and comprehensive alert/report reconciliation remain outstanding. Source-linked return concurrency was verified in the isolated backend suite. No Phase 4 or deployment work was started.

## Purpose and gate

Phase 3.1 is a verification-only continuation of Phase 3. No application source or test source has been edited for Phase 3.1 at this baseline. This report records the current worktree, the inspected Phase 3 claims, discrepancies, and the test/isolation plan before any browser workflow or test-data mutation.

The Phase 3 reports were all read. Their verdict is PARTIALLY ACCEPTED / NOT COMPLETE; browser E2E and the E2E mutation write-probe were not run; MySQL 8 compatibility is unverified; and the interactive barcode-required behavior is unverified.

## Repository baseline

- Branch: `audit/pawesome-final-acceptance`
- HEAD: `afd48899e3aa92e65aa0d2364229d5010ad6d9a6`
- The worktree is dirty. It contains prior Phase 2 POS/receipt edits, Phase 3 implementation/tests, and earlier audit reports. No reset, clean, stash, or overwrite was performed.
- The complete status snapshot was taken before Phase 3.1 activity. Phase 3.1 will preserve the listed existing edits.
- `docs/audit/phase-3-1-inventory-acceptance/` did not exist before this verification; this new directory is reserved for the ten Phase 3.1 reports. No prior Phase 3.1 reports were overwritten.

## Phase 3 report/source comparison

The reviewed Phase 3 implementation report describes four bounded corrections. Current source inspection confirms:

1. `InventoryService::createReturn()` uses a transaction, locks the target inventory item, then validates source-linked return quantity and inserts the return.
2. `StockReturnsPage` retains create/disposition idempotency keys during uncertain failures and rotates keys at success/deterministic 4xx boundaries.
3. `AddProductModal` no longer requires an SKU and states that the backend can generate it.
4. `AddProductModal` contains a required-barcode label/helper and a `validateStep()` check for a new product with blank barcode. This interaction is still unverified: the Phase 3 report records that an earlier component interaction test failed to observe the expected error, and the final unit test checks copy rather than the click-through behavior.

Additional test-harness discrepancy: `frontend/e2e/stock-movement.spec.js` documents the development stack on port 8000 and does not call `enforceAuditStack()`. It must not be run unguarded. The Phase 12 inventory spec and cashier-inventory POS spec do call the mutation guard.

The actual route groups protect inventory operations with authenticated role middleware; stock-in/out, return create/disposition, item creation, and adjustments have idempotency middleware on the relevant POST routes. Barcode lookup is separately restricted to cashier, inventory, and admin.

Service source trace:

- Veterinary inventory usage delegates to `InventoryService` and locks the inventory item before applying usage.
- Grooming and boarding usage components exist and call their respective service endpoints.
- Grooming and boarding services delegate deductions to `InventoryService`; their browser surfaces are present in receptionist workflows.
- No veterinary inventory-usage component was found by the frontend source search. The veterinary usage API exists; UI-to-API coverage must be established before claiming a browser workflow.
- A candidate backend integrity issue needs an isolated reproduction before classification: grooming and boarding services append per-item validation errors and continue processing other lines, then commit the transaction and return `success=false` when any line failed. Their controllers translate that result to HTTP 422. If a request contains one valid and one invalid line, this may persist a partial deduction despite an overall 422 response. Veterinary usage instead throws on an invalid line and rolls back. No source change is authorized until the mixed-line behavior is reproduced against the new audit database.

## Environment observations (read-only)

- Local database listener is on `127.0.0.1:3306`; the selected Laravel connection reported `Pascua`, MariaDB `10.4.32-MariaDB`.
- The retained database `pawesome_phase3_inventory_audit` is configured with 191 migrations and contains prior test fixtures (the prior Phase 3 report records one inventory item and one POS sale). It will not be reset or used for new browser mutations.
- A read-only schema check through that retained audit connection found no schema named `pawesome_phase3_1_browser_audit`. This is the proposed new E2E database; it must be rechecked immediately before creation.
- Docker is unavailable (`docker: command not found`). MySQL 8 cannot be started locally through the repository Docker Compose fallback in the current environment. The only active SQL server evidence is MariaDB 10.4.32. MySQL 8 must remain UNVERIFIED unless an approved external CI/MySQL 8 target is available.
- No backend/frontend test server ports 8000, 8001, 8011, 3000, 3001, or 3011 were listening when checked; only the database listener was observed. A separate local API/frontend stack can therefore use ports 8001 and 3001.
- Current frontend `.env` points `VITE_API_BASE_URL` at `http://localhost:8000/api`; current process E2E variables were unset. Browser tests MUST override both the frontend API base and `E2E_API_URL`; they must never inherit the frontend `.env` development target.
- With the explicit test environment, Laravel resolved `APP_ENV=testing`, MySQL connection, host `127.0.0.1`, port `3306`, and the retained Phase 3 audit DB. Default `APP_URL`/`FRONTEND_URL` point at localhost ports; the E2E process will override them to loopback test ports.
- CORS configuration includes a loopback-only origin pattern for arbitrary localhost/127.0.0.1 ports. The browser origin/API origins will both use `127.0.0.1`.
- The default public/private disks point to shared `backend/storage/app/public` and `backend/storage/app/private`. No file-upload scenario is planned in this browser run. If evidence/photo uploads become necessary, stop and provision a separate storage root before testing them.
- Historical Playwright screenshot/output locations inspected for the planned inventory specs were absent at baseline; evidence will use a new Phase 3.1-specific directory and a unique Playwright output directory.
- The seeded E2E accounts are created by `PawesomeLiveDemoSeeder`; only that named seeder, not the broad `DatabaseSeeder`, is planned on the verified empty browser-E2E database. Credentials must be verified by successful API login before UI tests.
- Local timezone is China Standard Time; API workers will use `APP_TIMEZONE=Asia/Shanghai`.

## Verification plan (no browser requests executed yet)

1. Recheck that `pawesome_phase3_1_browser_audit` is absent. Create only that new database, migrate only it, and verify it contains only migration tables before seeding.
2. Run migrations on that new schema. Seed only the demo accounts/service catalog required for E2E login; verify inventory, cashier, manager, veterinary, and receptionist login against the isolated API.
3. Use `APP_ENV=testing`, DB host `127.0.0.1`, port `3306`, database `pawesome_phase3_1_browser_audit`, array cache/session/mail, sync queue, stderr logging, and Asia/Shanghai timezone. Do not use `phpunit.xml`'s `pawesome_test` target for mutation/browser tests.
4. Start the isolated API on 127.0.0.1:8001 and Vite on 127.0.0.1:3001 with `VITE_API_BASE_URL=http://127.0.0.1:8001/api`, `E2E_API_URL=http://127.0.0.1:8001/api`, `E2E_AUDIT_DATABASE=pawesome_phase3_1_browser_audit`, and `E2E_DEV_DATABASE=pawesome`.
5. Run the Playwright mutation-guard regression and live API database write-probe first. Stop all subsequent browser mutations if the guard does not prove the write landed only in the new audit schema.
6. Use only new, uniquely named fixture products/orders/returns. Keep browser evidence and Playwright output in a new Phase 3.1-specific directory; do not overwrite historical evidence.
7. Exercise barcode validation, blank-SKU generation, stock-in/out/adjustment, returns, POS, supported grooming/boarding consumption surfaces, authorization, movement history, dashboard/report persistence, and source-return concurrency where the existing UI/API supports them.
8. Explicitly test mixed valid/invalid grooming and boarding usage lines and reconcile response status to persisted usage/stock. Only fix partial-commit behavior if reproduced on this isolated database.
9. Check post-run database rows and movement/batch/stock relationships on the new audit schema. Do not reconcile or mutate live `pawesome`.
10. Do not test uploads; default upload storage is shared. Do not call external payment or mail providers.
11. MySQL 8 remains blocked locally unless a separate approved MySQL 8 service becomes available. Do not label MariaDB results as MySQL 8 results.
12. Only after this baseline is written may Phase 3.1 add or adjust narrowly scoped test harness code. Runtime application changes require a reproduced defect and will be documented separately.

## Acceptance blockers known before execution

- Interactive blank-barcode validation is not yet proven.
- The older stock-movement Playwright spec lacks a per-test mutation guard and must be run only after a successful live guard proof or receive a narrow guard addition.
- The retained Phase 3 audit database contains fixtures and is not a clean target.
- MySQL 8 is unavailable locally because Docker is not installed.
- Veterinary consumption has a backend API but no matching frontend component was found in the initial search.
- No browser test, browser write-probe, or Phase 3.1 test data has been created at this checkpoint.

## Baseline status

**BASELINE RECORDED — SAFE TEST SCHEMA NOT YET CREATED — BROWSER TESTS NOT YET RUN.**
