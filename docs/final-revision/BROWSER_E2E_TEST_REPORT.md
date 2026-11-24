# BROWSER_E2E_TEST_REPORT.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · **Stack:** isolated audit environment — API `php artisan serve` :8001 → MariaDB `pawesome_e2e_audit` @3306 (migrated to HEAD incl. revision migrations), frontend Vite :3001 with `VITE_API_BASE_URL=http://127.0.0.1:8001/api`. Guard: `E2E_API_URL` + `E2E_AUDIT_DATABASE=pawesome_e2e_audit` (audit-guard satisfied; dev ports/DBs refused by design).

## 1. Specs executed (changed-area + highest-value coverage)

| Spec | Scope | Result |
|---|---|---|
| `e2e/stock-movement.spec.js` (12 tests) | Stock in/out/returns UI → API → stock math, approval queue, dispositions, reversals, idempotent replay, role denial | **11 passed, 1 flaky→passed on retry** (first-attempt timeout on item-picker option under single-threaded `artisan serve`; passed cleanly on retry) |
| `e2e/phase12-inventory-workflow.spec.js` (3 tests) | Native inventory lifecycle (product→batch→stock-out→audit→reconciliation), unauthorized/tamper rejection, concurrent oversell guard | **3/3 PASS** on dedicated rerun (see §2) |
| `e2e/pawesome-role-smoke-audit.spec.js` | Per-role dashboard/module smoke | see §3 |

## 2. Flake analysis — `phase12-inventory-workflow` first run

First combined run (`--workers=2`): the lifecycle test failed twice on 5s locator timeouts waiting for the created product row; the failure snapshot showed the row **did** exist with correct SKU/stock — a timing issue under the single-threaded `php artisan serve` (documented Windows constraint; AGENTS.md recommends the worker pool for concurrent browser traffic). Dedicated rerun `--workers=1`: **3/3 PASS in 51s/8.7s/2.5s**. Classified FLAKE (environment), not a defect — product creation, listing, and stock math all verified working end-to-end.

## 3. Role smoke audit + live RBAC spot-checks

| Check | Result |
|---|---|
| `pawesome-role-smoke-audit.spec.js` — 9 roles (customer, receptionist, cashier, inventory, veterinary, manager, admin, super_receptionist, vet_tech) dashboard load, no console errors | **9/9 PASS** |
| Unauthenticated `GET /api/admin/users` | **401** |
| Customer token → `GET /api/admin/users`, `/api/admin/dashboard` | **403** |
| Cashier token → `GET /api/admin/users` | **403** |
| Customer token → own `/api/customer/dashboard`, `/api/customer/bookings` | **200** |
| Invalid bearer token → customer endpoints | **401** |

Role-permission matrix spot-verification CURRENTLY VERIFIED on the audit stack (prior 784-probe matrix remains HISTORICAL baseline).

## 4. Coverage vs. changes

| Revision change | E2E coverage |
|---|---|
| UOM stock in/out (FR-01) | `stock-movement.spec.js` stock-in/stock-out/return/reversal/idempotency paths exercised through the real UI→API chain |
| Auto-barcode/SKU (FR-02) | product creation via `AddProductModal` in phase12 lifecycle spec (201 + row visible) |
| Report indexes (FR-03) | read-path only; covered by report reconciliation spec historically — no UI change |
| Notification afterCommit (FR-04) | stock-movement approval/return flows generate notifications post-commit; all specs green |
| Idempotency prune removal (FR-05) | `stock-movement` idempotent-replay test PASS |
| Return oversell lock (FR-06) | phase12 concurrent stock-movement oversell guard PASS |

## 5. Environment limitations (honest scope)

- `php artisan serve` is single-threaded on Windows; worker-pool proxy recommended for heavy concurrent E2E — used workers=1/2 per plan.
- Playwright `workers=1` default in config; overrides used per plan guidance.
- Evidence artifacts: `frontend/test-results/` (traces/screenshots on failure only), spec-written evidence under `browser-evidence/system-security-audit-20261108/phase12-inventory/` (committed refresh).
- Full 99-spec suite NOT re-run — bounded spot-validation per gap-driven plan; historical full-suite E2E evidence remains HISTORICAL.
