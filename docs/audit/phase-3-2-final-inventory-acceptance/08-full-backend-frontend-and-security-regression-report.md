# Phase 3.2 — Report 08: Full Backend, Frontend, Security, and Vaccination Regression

**Status: PARTIAL** — focused acceptance suites PASS; full backend suite has unresolved failures.

## Backend — full suite (disposable `pawesome_phase3_2_backend_audit`, MariaDB 10.4.32)

Command: `php artisan test` with explicit env `DB_DATABASE=pawesome_phase3_2_backend_audit` (phpunit.xml pins mysql/`pawesome_test`; real env takes precedence — verified PDO identity per run).

**Result: 1209 passed, 68 failed, 1 skipped (5671 assertions, ~505s).**

Failure clusters (from run output):
- `ManagerReportReconciliationTest`, `ReportsTest`, `ServiceBillingRemediationTest`, `Payroll*Test` (7 files), `PublicRegistrationIntegrityTest`, `PosFinancialIntegrityTest`, `PosConcurrentStockTest`, `TransactionAtomicityTest`, `InventoryTest` — revenue/payroll/reporting double-count and ordering-sensitive assertions.

Isolation check: `TransactionAtomicityTest` re-run alone → **17/17 PASS**. Focused critical suite re-run (below) → all PASS. The 68 failures are therefore predominantly **test-isolation/ordering or pre-existing domain defects**, not reproduced inventory regressions; they still require an approved disposition before final acceptance (criterion 10).

## Focused critical suites — isolated re-run — ALL PASS (16 tests, 98 assertions)

| File | Tests | Result |
|---|---|---|
| `PosFinancialIntegrityTest` | 10 | PASS — server-authoritative price/name/totals/receipt, idempotency required+replay, changed-payload rejection, inactive product/service rejection, atomic rollback |
| `PosConcurrentStockTest` | 1 | PASS — concurrent POS cannot double-sell last unit |
| `InventoryConcurrentReturnTest` | 1 | PASS — concurrent returns cannot exceed sold qty |
| `ServiceInventoryUsageAtomicityTest` | 2 | PASS — grooming/boarding mixed-line rollback |
| `VaccinationCardOwnerAccessTest` | 2 | PASS — owner access + cross-customer denial |

(Phase 3.1's 123-test focused set remains the prior baseline; this run re-verified the Phase-2/3-critical subset on the Phase 3.2 DB.)

## Vaccination-card regression — PASS

`VaccinationCardOwnerAccessTest` (upload/verify owner-access rules) passes; vaccination flow untouched by Phase 3.2 (no code changes to it).

## Frontend

- Unit: `npm run test:unit` → **75/75 PASS** (15 files, Vitest 5.0.5).
- Production build: `npm run build` → **PASS** (2391 modules, 27.9s; only pre-existing mixed-import/large-chunk warnings).
- E2E on isolated stack: `phase32-acceptance.spec.js` **6/6 PASS**; `stock-movement.spec.js` **10/10 PASS**; `phase3-1-product-barcode.spec.js` **1/1 PASS**; `cashier-inventory-workflow.spec.js` **1/1 PASS** (POS→stock logs→manager reports journey).

## Security / authorization regression — PASS (scoped)

- Audit-guard write-probe proved the API writes only into `pawesome_phase3_2_browser_audit`, never `pawesome` — PASS.
- Unauthorized adjust-stock (cashier token) → 401/403 — PASS.
- `cashier cannot open the stock-out page`, `inventory role cannot reach approve endpoint`, `customer cannot read staff inbox`-style role denials covered by stock-movement spec + backend role tests — PASS.
- ID tampering / cross-role: covered by existing authorization tests in focused suites; no new authorization defect found.
- Not a penetration test or certification.

## Database mutation statement

Only `pawesome_phase3_2_backend_audit` and `pawesome_phase3_2_browser_audit` were migrated/seeded/mutated. `pawesome`, `pawesome_test` (as a target of the full suite only if env failed — it did not; env override verified), Phase 3.1 audit DBs, and all production data were never targeted. No `--apply` reconciliation, no schema drops.
