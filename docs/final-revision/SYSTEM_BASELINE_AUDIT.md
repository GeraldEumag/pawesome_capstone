# SYSTEM_BASELINE_AUDIT.md — Pawesome Capstone B Final Revision

**Date:** 2026-11-24 · **Branch:** `audit/pawesome-final-acceptance` · **HEAD:** `3ec1845b50f40cbce1f34fec4d40e9427f2d1400` · **Working tree:** clean at start of revision.

This document records the *current, re-verified* state of the system. Prior audit
documents under `docs/audit/` were treated as leads; every figure below was
re-measured on 2026-11-24 unless marked otherwise.

---

## 1. Environment (measured)

| Component | Version / State | Evidence |
|---|---|---|
| PHP CLI | 8.2.12 (ZTS, XAMPP) | `php -v` |
| Laravel | 12.72.0 | `php artisan --version` |
| Node.js | v24.13.1 | `node -v` |
| npm | 11.8.0 | `npm -v` |
| React | ^18.3.1 (Vite 6.4.5 frontend build) | `frontend/package.json`, build log |
| Local DB engine | **MariaDB 10.4.32** @127.0.0.1:3306 (`pawesome`) | `SELECT VERSION()` |
| MySQL 8 instance | **NOT PRESENT** — `C:\xampp\mysql8` gone; port 3307 refuses connections; Docker unavailable | connection attempt 2026-11-24 |
| Dev DB | `pawesome` — 98 tables, 191 migrations all `Ran`, 0 pending | `information_schema`, `migrate:status` |
| Test DB | `pawesome_test` present on MariaDB | `SHOW DATABASES` |
| Audit DBs | `pawesome_e2e_audit`, `pawesome_reports_audit`, `pawesome_customer_audit`, etc. present | `SHOW DATABASES` |
| Backend deps | `composer audit` → **no advisories** | composer audit 2026-11-24 |
| Frontend deps | `npm audit` → 1 high: `xlsx@0.18.5` GHSA-4r6h-8v6p-xvw6 + GHSA-5pgg-2g8v-p4x9, no registry fix | npm audit 2026-11-24 |
| `.env` posture | `APP_ENV=local`, `APP_DEBUG=true` (dev only — production checklist item), `QUEUE_CONNECTION=sync`, `MAIL_MAILER=smtp`, file cache/session | `.env` non-secret keys |

**MySQL 8 note:** the throwaway MySQL 8.0.44 instance used on 2026-11-18
(`C:\xampp\mysql8`, port 3307) no longer exists and Docker is unavailable, so the
full suite **cannot be executed on a real MySQL 8 engine locally**. The
`backend/phpunit.mysql8.xml` config is retained; the authoritative MySQL 8 gate
is GitHub Actions CI (`mysql:8.0` service) which was green on `main` as of
2026-11-18. Local suite runs below are on MariaDB 10.4.32 — recorded as
**PARTIALLY VERIFIED** for MySQL 8 parity, consistent with prior verdicts.

## 2. Current health checks (executed this revision)

| Check | Command | Result |
|---|---|---|
| Route inventory | `php artisan route:list` | **748 routes** (prior record: 722 on 2026-11-08 → grew with stock-movement/returns/enum work) |
| Backend smoke | `php artisan test --filter=EmailAuthFlowTest` | **33 passed / 159 assertions** (58.5s) — CURRENTLY VERIFIED |
| Backend suite size | `php artisan test --list-tests` | **1,278 test cases registered** across 140 test files (prior record: 1,128 on 2026-11-18 → +150 cases) |
| Frontend unit | `npm run test:unit` (vitest) | **75 passed / 15 files** (65.6s) — CURRENTLY VERIFIED (prior records: 29 then 44 → suite grew) |
| Frontend build | `npm run build` | **PASS** 27.8s; main chunk `index-*.js` 3,707.78 kB / 1,086.09 kB gzip; chunk-size warnings only — CURRENTLY VERIFIED |
| Migrations | `php artisan migrate:status` (dev DB) | 191 Ran / 0 Pending |

Full backend suite re-run is scheduled in Phase 3; the smoke result above is not
a substitute for it.

## 3. Module inventory (verified in tree)

- **Backend:** Laravel 12, Sanctum token auth + `ApiTokenAuth` middleware,
  ~748 routes in `routes/api.php` (1,333 lines), 193 migration files,
  role set: customer, receptionist, cashier, inventory, veterinary, manager,
  admin, super_receptionist (composite), vet_tech (limited), payroll flows.
- **Services layer:** `InventoryService`, `PetServiceCompatibilityService`,
  `ServiceCatalog`, `BookingAvailabilityService`, `PaymentVerificationService`,
  `ServiceBillingService`, `BoardingRoomService`, domain inventory services
  (Boarding/Grooming/Veterinary/BoardingAddOn), receipt-scanner chain
  (`Services/Receipts/*`), email outbox (`EmailDeliveryService` +
  `SendEmailDelivery` job), `WorkflowNotifier`, `FileStorageService`.
- **Frontend:** React 18 + Vite, role dashboards under `src/components/<role>/`,
  shared primitives (`Modal`, `StatusBadge`, `StandardTable`, `DatePickerInput`,
  `ReportFilters`…), `utils/alert.jsx` dialogs, `api/` client modules.
- **Inventory module (frontend):** `StockInPage`, `StockOutPage`,
  `StockReturnsPage`, `StockMovementsPage`, `StockAdjustmentModal`,
  `ReverseMovementModal`, `StockApprovalQueue`, `MonthlyInventoryAudit`,
  `BarcodeGenerator` (label print/lookup), `ProductManagement`,
  `QuickItemSelector`, `UnifiedInventory`.
- **PDF:** single Dompdf generator — `PayslipPdfService` →
  `resources/views/pdf/payslip.blade.php` embeds `public/pawesome.jpg` as a
  data URI (works with `isRemoteEnabled=false`). POS/service receipts are
  HTML print views, not PDF.

## 4. Prior-evidence currency check

| Prior claim (source) | Status vs HEAD `3ec1845b` |
|---|---|
| MySQL 8.0.44 suite 1128 pass (SYSTEM_AUDIT_TRACKER, 2026-11-18) | **HISTORICAL** — engine gone; suite grew to 1,278 cases; CI `mysql:8.0` remains the gate |
| Phase 13 route×role matrix: 784 probes, 0 violations (2026-11-08) | **HISTORICAL** — route count grew 722→748; spot re-probe scheduled Phase 3/4 |
| POS financial integrity + VAT-inclusive receipts (commit `3ec1845b`, HEAD) | **CURRENTLY VERIFIED (code)** — `POSController::processTransaction` recomputes prices/VAT server-side; receipt VAT breakdown confirmed in code |
| Stock movement system (migration `2026_11_22`, commit `346b8cb0`) | **CURRENTLY VERIFIED (code+schema)** — `stock_movements`-era tables present, returns/disposition endpoints routed |
| Animal-type compatibility (`PetServiceCompatibilityService`, `allowed_species`) | **CURRENTLY VERIFIED (code)** — enforced in `ServiceRequestController::store` (422 on incompatible species) and `BoardingRoomService` room assignment |
| Email outbox / Brevo delivery | **HISTORICAL for provider**; code path unchanged; live delivery remains environment-dependent |
| xlsx advisories risk-accepted (DEP-002) | **CURRENTLY VERIFIED** — `npm audit` still shows the same 2 advisories, no fix available; write-only usage previously proven |
| SYS-002 reports date-range gap (SYSTEM_FINAL_BUG_TRACKER, 2026-11-17) | **STALE → FIXED** — `AdminLiveReport.jsx` now has `DatePickerInput` start/end + presets sending `start_date`/`end_date` |

## 5. Known defects / gaps carried into Phase 1

See `FINAL_SYSTEM_REVISION_TRACKER.md` for classified findings. Preliminary
confirmed items from code inspection:

- **FR-01 (FEATURE_GAP, P2):** No unit-of-measure packaging conversion.
  `inventory_items.unit` (varchar 50) is a display label not accepted by any
  write endpoint; stock transactions take base-unit quantities only. Panel
  §8.3 requires piece/pack/box with conversion (e.g., 1 box = 12 pieces).
- **FR-02 (FEATURE_GAP, P2):** No automatic SKU/barcode generation on item
  create. Barcode is required for sellable items but must be entered/scanned
  manually; SKU is optional free text. Panel §8.2/§8.4 require automatic
  generation "when appropriate" with uniqueness.

## 6. Deployment limitations (unchanged)

- Supported targets: Vercel (frontend) + Railway (Laravel API/MySQL) per
  `docs/DEPLOYMENT.md`; `railway.json`/`vercel.json` verified previously.
- External gates still open: live deploy, MySQL 8 CI run on this branch,
  supervised queue worker + scheduler, Brevo REST key + sender domain
  (SPF/DKIM/DMARC), public webhook URL, edge HTTPS/CORS verification.
- Local `.env` is dev-only (`APP_DEBUG=true`); production values are a
  deployment checklist item, not an application defect.
