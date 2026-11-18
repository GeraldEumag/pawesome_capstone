# Reports Module — Deep Audit & Production Readiness

**Date:** 2026-11-18
**Scope:** Full-stack audit of every report surface (frontend → API → controller → MySQL), independent DB reconciliation, API-driven E2E workflows on isolated DB `pawesome_reports_audit`, targeted Playwright checks.
**Method:** Independent ground-truth SQL vs API response vs UI display for every headline metric. Prior evidence (Gate D 2026-08-20, MANAGER_ADMIN_REPORTING_AUDIT 2026-11-17) used as baseline and re-verified.

## Executive Summary

| Area | Result |
| --- | --- |
| Route inventory | 88 report routes, all `auth.api` + `role:` gated server-side |
| RBAC matrix | PASS — every role blocked from foreign report surfaces; admin bypass by design |
| RevenueService (canonical revenue) | PASS — reconciles to the peso (₱62,225 dev DB) |
| Independent reconciliation | FAILURES found — see P1 register |
| Report filters | FAILURES found — admin live reports have no filter UI |
| Validation | PARTIAL — invalid dates/statuses silently ignored, `limit` uncapped |
| Exports | CSV formula sanitization present; export≠visible-data on engine reports |

## Verified-good architecture (baseline)

- `RevenueService` is the single source of truth for revenue: POS `sales` (excl. `refund`/`multi_payment`/`appointment` types and `voided`/`cancelled` statuses) + paid legs on `customer_orders`, `service_requests` (deduped vs linked `boardings`/`groomings`/`appointments`), `boardings`, `medical_confinements`, `appointments`, `groomings` + partial `payment_settlements` (deduped vs fully-paid parents).
- Ground truth (dev DB): 23,090 (POS) + 0 (orders) + 1,500 (SR deduped) + 17,000 (boarding) + 0 (confinement) + 4,935 (appointments) + 15,700 (grooming) + 0 (settlements) = **62,225 = API `unifiedRevenue`** ✓
- All ~88 report routes sit inside `role:` middleware groups; admin bypass is the documented all-access design; customers get 403 on every staff report surface; customers can only reach `customer/reports/*` (admin gets 403 there by design).
- `customerOrdersBase`/`customersBase`/`customerUsersBase` dedupe users↔customers correctly.
- `serviceRequests()` dedups requests fulfilled via linked `boardings`/`groomings`/`appointments` (mirrors RevenueService).
- `exportToCSV` sanitizes formula injection via `sanitizeCsvCell`.
- `forecastSeries` is a real least-squares + weekday-seasonality model (not fabricated).
- Date filtering uses `whereDate >= from / <= to` (inclusive, no end-of-day exclusion bug).

## Defect Register

### P1 — High (incorrect figures / missing data / dead controls)

| # | Where | Defect | Evidence |
|---|---|---|---|
| R-01 | `Admin\ReportsController::sales()` | `total_revenue` sums ALL `sales.amount` incl. cancelled/voided/refund/multi_payment; summary computed on `limit(500)` subset | API `total_revenue` 36,890 vs completed-only 23,090 (+₱13,800 cancelled) |
| R-02 | `Admin\ReportsController::overview()` trend | 7-day trend = raw `Sale::sum('amount')` per day — charts cancelled sales and misses all non-POS revenue legs; contradicts `total_revenue` KPI in same payload | Nov-17 point = ₱900/1 order — that sale is `cancelled` |
| R-03 | `Admin\ReportsController::serviceRequests()` | `groomings` excluded via dedup but never listed as a source — all grooming services invisible | API `total_requests`=142; true volume = 20 SR + 69 appt + 51 boarding + 2 confinement + **163 groomings** = 305 |
| R-04 | `Cashier\DashboardController::transactions()` + `CashierReports.jsx` | (a) `amount ?? 500` hardcoded fallback invents amounts; (b) frontend sends `from`/`to`/`status`/`salesperson_id` — backend ignores them (only `date_filter`/`method`/`search`/`page`/`per_page`) → date/status filters silently dead; (c) frontend sums page ≤50 rows client-side as "total sales" | code read + API check |
| R-05 | `Admin\CustomerReportController::paymentsFor()` | `payments` table has no `customer_id`/`order_id` → helper always returns empty → `paid_amount` always ₱0, `outstanding_balance` always = full order amount | `DESCRIBE payments` (only `sale_id` FK) |
| R-06 | `AdminLiveReport.jsx` (all 8 admin report pages) | No date-picker, no status filter, no search UI — `startDate`/`endDate` locked to current-month preset; `statusOptions`/`searchPlaceholder` props dead | code read; all 8 pages affected |
| R-07 | `overviewMetrics()` | `total_services` = SR + appts + boardings + confinements with NO linked-record dedup → double counts | API 401 vs deduped ~305 |

### P2 — Medium (inconsistent definitions / partial-truth metrics)

| # | Where | Defect | Evidence |
|---|---|---|---|
| R-08 | `executiveOverview()` | `low_stock_items`/`critical_stock_items` don't exclude `archived_at` or stock=0 — different definition vs `lowStockCount()` elsewhere | exec=725/663 vs canonical 269 |
| R-09 | `payments()` summary | `total_amount` includes unpaid/rejected rows (labeled as payment total); per-source `limit(500)` subsets drive counts | code read |
| R-10 | `salesAnalysis()` | `categoryData`/`hourlyData` raw sales sums incl. cancelled; hourly loop samples even hours only (odd-hour sales dropped); source breakdown omits `veterinary`+`grooming` legs | code read |
| R-11 | `comparativeReporting()` | `categoryBreakdown` label map omits `veterinary`/`grooming`/`partial_settlements` legs | code read |
| R-12 | `staffPerformance()` | staff `revenue` = raw `Sale::sum('amount')` incl. cancelled | code read |
| R-13 | `serviceRequests()` confinements | `firstAvailableColumn(['total_amount','amount','price'])` → always 0; real cols are `final_amount`/`estimated_cost` | code read |
| R-14 | `veterinary()` | `total_revenue`/`monthly_revenue` = completed-status `sum('price')` only — misses `total_amount` col + uses completed≠paid definition | API 1,585 vs paid-appointment revenue 4,935 |
| R-15 | `orders()` trend | trend sums `total_amount` of ALL rows incl. cancelled POS + unpaid orders | code read |
| R-16 | `UnifiedReportEngine` exports | `exportToCSV/Excel/PDF` use unfiltered `data` — exports ignore search/status client filters | code read |
| R-17 | `payrollReports()` | method ignores request params entirely (always latest 300); also unreachable — no route binds it | dead code |
| R-18 | `customerSegmentation()` | `total_spent`/`orders` include unpaid orders → VIP/loyal computed on uncollected amounts | code read |
| R-19 | `cashier()`/`payments()` row caps | `pending_payment_proofs`/`verified_payments`/`rejected_payments`/`receipt_count` computed on `limit(250)`/`limit(500)` subsets → understated beyond cap | code read |
| R-20 | Validation | malformed dates silently skipped; `from>to` accepted; invalid `status` filtered-as-exact-match (empty 200, not 422); `limit`/`per_page` uncapped (`limit=99999` honored) | API probes |

### P3 — Low (cosmetic / dead code / latent)

| # | Where | Defect |
|---|---|---|
| R-21 | `useReportData.js` `useInventoryOptData` | calls nonexistent `/admin/reports/inventory-opt` (real: `inventory-optimization`); hook unused — dead code |
| R-22 | `CustomerReports.jsx` `isAdminReport` branch | dead code — component only mounted under `/customer/*`; admin uses `CustomerReport.jsx` |
| R-23 | `customer/reports/*` endpoints | mounted under customer role as "reports" but are operational lists; fine but naming is misleading |
| R-24 | `useReportData` 5-min cache | "live" report pages can serve up to 5-min-stale data without indicating staleness |

## Status legend
Each defect is tracked to a fix commit and a regression test in the sections below (updated as fixes land).

## Fix Status Register (finalization pass — 2026-11-18)

All fixes verified in the working tree; `php -l` clean; backend reports tests **92/92, 349 assertions** (1 env skip: no GD); `vite build` green; live API verification on `:8001`/`pawesome_reports_audit` (admin token): malformed date → **422**, reversed range → **422**, `total_revenue` = **4,160** = eligible-sales ground truth (5 completed rows), `service-requests` now lists `"source":"grooming"` (R-03), `total_services=7` deduped (R-07).

| # | Status | Fix |
| --- | --- | --- |
| R-01 | FIXED | `sales()` filters revenue-eligible rows (`voided`/`cancelled`/`refund`/`multi_payment`/`appointment` excluded) before summing |
| R-02 | FIXED | overview trend → `RevenueService::daily()` (all paid sources, consistent with KPI) |
| R-03 | FIXED | `serviceRequests()` appends deduped `groomings` as `source:"grooming"` — live-verified |
| R-04 | FIXED | fabricated `amount ?? 500` removed; `from`/`to`/`status`/`salesperson_id` filters honored; CashierReports.jsx prefers server `summary` (client sum = fallback excluding cancelled) |
| R-05 | FIXED | `paymentsFor()` joins `payments→sales.customer_id` + merges order-level payments; `balance_amount` clamped `max(0,…)` |
| R-06 | FIXED | `AdminLiveReport.jsx` gained DatePickerInput pair + status select + search; params sent to backend + client-side second layer |
| R-07 | FIXED | `total_services` = deduped SR + appts + boardings + confinements + groomings — live-verified 7 |
| R-08 | FIXED | all `low_stock_items`/`critical` use canonical `lowStockCount()` (archived excluded) |
| R-09 | FIXED | `total_amount` = collected only (paid/completed/verified); `listed_amount` covers all rows |
| R-10 | FIXED | category/hourly exclude voided/cancelled; hourly bucketed into 2-hour bands (odd hours counted), sqlite+MySQL parity |
| R-11 | FIXED | `categoryBreakdown` label map includes `veterinary`/`grooming`/`partial_settlements` |
| R-12 | FIXED | staffPerformance revenue = `whereNotIn(voided,cancelled)` |
| R-13 | FIXED | confinements column list → `final_amount`/`estimated_cost`/`total_amount` |
| R-14 | FIXED | veterinary revenue uses `payment_status` paid/verified/completed + `COALESCE(total_amount, price)` |
| R-15 | FIXED | orders trend excludes cancelled/unpaid |
| R-16 | FIXED | `UnifiedReportEngine` export handlers use `filteredData` (CSV/PDF/Excel match visible set) |
| R-17 | FIXED | dead unreachable `payrollReports()` method removed (superseded by `managerPayroll`) |
| R-18 | FIXED | `total_spent`/`orders` computed on `payment_status='paid'` only |
| R-19 | FIXED | `paymentStatusCounts()` — full-set counts; capped limits apply to row lists only |
| R-20 | FIXED | `validateReportParams` on all report endpoints (malformed→422, reversed→422, live-verified); `limit` clamped ≤2000; cashier `per_page`/`page` clamped ≤200/≥1 |
| R-21 | FIXED | `useInventoryOptData` path corrected; whole `useReportData.js` dead-hook file removed (zero importers) |
| R-22 | FIXED | dead `isAdminReport` branch removed from `CustomerReports.jsx` (+ orphaned `useLocation`) |
| R-23 | ACCEPTED | naming observation only — no action |
| R-24 | RESOLVED | dead hook deleted; live report pages already surface `lastUpdated` via `StandardReportLayout` |

### Files changed (finalization)
- `frontend/src/components/shared/UnifiedReportEngine.jsx` — exports use filtered dataset
- `frontend/src/components/customers/CustomerReports.jsx` — dead admin branch removed
- `frontend/src/hooks/useReportData.js` — deleted (dead code, all exports unused)
- `backend/app/Http/Controllers/Admin/ReportsController.php` — dead `payrollReports()` removed (rest of fixes pre-staged)
- `backend/app/Http/Controllers/Cashier/DashboardController.php` — `per_page`/`page` clamped

**Note:** `CustomerReports.jsx` touched the closed Customer Module — the change removes dead code registered as R-22 by this audit (reopen criterion #1: reports-audit finding); no working customer behavior changed (branch was unreachable).

### Residual accepted behavior
Invalid `status` values still filter-as-exact-match → empty 200 (standard filter semantics; not data corruption). `per_page` params in non-reports controllers (ActivityLog/Inventory/LoginLog) remain uncapped — outside this audit's scope.
