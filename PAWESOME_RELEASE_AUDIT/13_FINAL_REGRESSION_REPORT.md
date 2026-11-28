# 13 — Final Regression and Smoke Test Report

All testing on the audited commit `b952fa66` (+ this engagement's E2E
spec/fixture fixes, which touch tests only — no application code).

## Automated results (fresh evidence this engagement)

| Suite | Command | Result |
| --- | --- | --- |
| Backend — critical-path focused | `php artisan test --filter="PetSpeciesEnforcementTest\|POS\|Vat\|Tax\|Auth\|EmailAuthFlow\|DatabaseIntegrity"` | **228 passed / 0 failed** (1198 assertions, 118s) — covers species enforcement, POS atomicity (`TransactionAtomicityTest`: commit/rollback/insufficient-stock/double-void), VAT breakdown, auth flows, RBAC, receipt scanner, stock movements |
| Backend — full suite | `php artisan test` (run earlier on identical HEAD) | **1298 passed / 1 skipped / 0 failed** (6442 assertions) |
| Frontend unit | `npm run test:unit` (vitest) | **75/75 pass** (fresh run, 30.8s) |
| Frontend build | `npm run build` | **Pass** (2392 modules; chunk-size warning only) |
| E2E — affected specs re-run | `npx playwright test batch5-inventory-system + pawesome-role-smoke-audit` | **32/32 pass** (fresh run, 2.3m) |
| E2E — full prior run (same commit) | cashier workflow + cross-role + smoke | **29 pass / 4 fail → residuals now resolved** (below) |

## E2E residuals — reassessed and RESOLVED

The previous audit's 4 E2E failures were confirmed as spec/fixture
drift, and both root causes were fixed **without changing application
behavior**:

1. **Legacy inventory redirects (×3):** confirmed intentional in
   `frontend/src/routes/InventoryRoutes.jsx` (`simplified`→`/inventory/stock`,
   `management`→`/inventory/products`, `legacy-products`→`/inventory/products`).
   Updated `e2e/batch5-inventory-system.spec.js` to assert the redirect
   targets — the spec now documents correct behavior. **3/3 pass.**
2. **`vet_tech` fixture gap:** `vet_tech` is a real backend role
   (middleware groups at `routes/api.php:830,907,914,918`) but had no
   dev-seed account. Created `vettech@example.com` (role `vet_tech`,
   active, verified) in the dev DB per `test-utils.js` credentials.
   **vet_tech dashboard smoke test now passes** (zero console errors).

**Net E2E status: all previously-failing specs now green; no known E2E
failures remain.**

## Critical user journeys — coverage map

| # | Journey | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Customer registration + login | `EmailAuthFlowTest`, AuthController tests, E2E smoke | PASS |
| 2 | Email verification | `EmailAuthFlowTest` (hashed token, expiry, resend) | PASS |
| 3 | Pet registration | `PetSpeciesEnforcementTest`, PetController tests | PASS |
| 4 | Appointment booking | `VeterinaryWorkflowTest`, `WalkInBookingTest`, E2E cross-role | PASS |
| 5 | Species rejection | `PetSpeciesEnforcementTest` (11 tests, all channels) | PASS |
| 6 | Receptionist appointment mgmt | `ReceptionistRoleAuthorizationTest`, overlap tests | PASS |
| 7 | Veterinary workflow | `VeterinaryWorkflowTest`, `VisitIntakeTest`, `VisitBillingPhaseCTest` | PASS |
| 8 | Boarding booking | `WalkInBookingTest`, boarding reservation species checks | PASS |
| 9–12 | Inventory CRUD/stock/history | `StockMovementTest`, batch5 E2E (15 routes), reconcile cmd | PASS |
| 13 | POS item + image | `TransactionAtomicityTest`, cashier E2E spec | PASS |
| 14 | VAT-inclusive calc | `ReceiptBreakdownTest`, POS VAT tests | PASS |
| 15–16 | Checkout + receipt | POS atomicity tests, cashier E2E, `ReceiptBreakdownTest` | PASS |
| 17 | AI receipt scan + cashier confirm | `ReceiptScannerSettingsTest`, `ProcessReceiptScan` job tests | PASS |
| 18 | PDF generation | `PayslipPdfService` (Dompdf, data-URI logo); payslip tests | PASS |
| 19 | Role restrictions | `ReceptionistRoleAuthorizationTest`, `AdminDeepAuditTest`, RBAC matrix | PASS |
| 20 | Management reports | `ReportsTest`, report controllers + indexes | PASS |
| 21 | Email/notification delivery | `NotificationMatrixTest`, outbox architecture (live send NOT VERIFIED — needs Brevo creds) | PASS (code) / NOT VERIFIED (live) |
| 22 | File upload/download | `StorageLifecycleTest`, `SecureFileController` authz, upload validation | PASS |

## Test-infrastructure notes

- Suite requires MySQL (`phpunit.xml` → `pawesome_test`); sqlite
  `:memory:` unsupported (MySQL-specific migrations).
- Local PHP lacks `gd`/`intl` — tests use `UploadedFile::fake()->create()`;
  production host must have them (report 01/14).
- E2E requires the 8-worker pool (`:8000`→`:8001-8008`) + Vite `:3000`;
  both were running for the verified runs.

## Changes made during this phase (tests/fixtures only)

- `frontend/e2e/batch5-inventory-system.spec.js` — legacy-alias tests
  now assert intentional redirects.
- Dev DB: added `vet_tech` fixture user (id 106) — matches
  `test-utils.js` credentials; no production impact.

**No application code was modified in this engagement.**
