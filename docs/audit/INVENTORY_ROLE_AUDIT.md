# Inventory Role — Complete System Deep-Dive Audit & Final Completion

**Audit date:** 2026-11-17/18 (final completion pass same day)
**Scope:** Full Inventory role stack — React UI (`frontend/src/components/inventory/`,
`src/routes/InventoryRoutes.jsx`, `src/api/inventory.jsx`) → Laravel API
(`routes/api.php` `inventory/*`, `Admin\InventoryController`,
`Inventory\DashboardController`) → `App\Services\InventoryService` → MySQL
(`inventory_items`, `inventory_batches`, `inventory_logs`,
`inventory_monthly_audits`, `suppliers`).
**Verdict: COMPLETE — FINAL DEMO READY** (4/5). Deployment-ready status still
requires the production-env checklist in `docs/DEPLOYMENT.md`.
**Companion reports:** `INVENTORY_DATA_HYGIENE_REVIEW.md`,
`INVENTORY_E2E_DATABASE_SAFETY.md`.

---

## 1. Executive summary

The Inventory role was audited end-to-end on an isolated clone
(`pawesome_inventory_audit`, API `127.0.0.1:8001`, frontend `127.0.0.1:3001`).
`InventoryService` was already the hardened central stock-mutation layer
(transactions, `lockForUpdate`, FEFO/FIFO, expired-batch blocking, drift
self-healing via `RECON-*` batches, idempotency middleware).

**8 confirmed defects were fixed** (2 HIGH/MED endpoint defects, 4 log/transaction
integrity defects, 1 config defect, 1 fabrication defect), each with regression
coverage, plus **3 e2e test-harness defects** that were producing false failures.

Backend suite: 133 scoped tests (592 assertions) + 19 new regression tests — all
green. E2E: all 5 required inventory specs pass on the audit stack (46 browser
checks total; one flaky step passed on retry).

## 2. Methodology

- **Phase A** baseline: versions, 182 migrations applied, scoped suite on
  `pawesome_test` (MySQL), `npm run build`, dev-DB integrity snapshot.
- **Phase B** isolation: `pawesome` cloned to `pawesome_inventory_audit`;
  schema/migration parity verified; API on `:8001`; write-probe proved mutations
  land only in the audit DB (two stale `:8001` listeners killed first).
- **Phase C** authorization matrix (11 tests) incl. IDOR, actor-spoofing,
  unauthenticated, composite-role, and forbidden cross-role operations.
- **Phase D** backend handler review + live probes on `:8001`.
- **Phase E** schema/integrity diagnostics (read-only on dev DB).
- **Phase F** frontend review (live-data wiring, states, conventions).
- **Phase G** defect fixes + regression tests.
- **Phase H** Playwright on the isolated stack.
- **Phase I** this report.

Mutation safety gates used: `SELECT DATABASE()` verification, migration parity,
`AUDIT-TEST-*` write probe located only in the audit DB. No destructive commands
were run against `pawesome`; dev-DB reads were read-only. One accidental dev-DB
mutation (§8) was compensated through the app's own void flow and is disclosed.

## 3. Architecture inventory

- **Mutation source:** `InventoryService::{deductStock, addStock, adjustStock,
  adjustBatch, disposeBatch, receiveBatch, recordAudit}` — all transactional.
- **Callers verified:** POS sale (`deductStock`), POS void (`addStock`),
  receptionist legacy order-approval (transactional), vet/grooming/boarding/MAR/
  vaccination service consumption, monthly-audit variance write-off/receive.
- **Payment verification isolation:** payment verify/reject services contain zero
  inventory references — stock never changes on payment approval.
- **Audit approvals:** `manager/inventory-audits/{id}/approve|reject` gated by
  `role:manager,admin`; records `approved_by`/`approved_at`.
- **Customer ordering:** descoped by design (410 stubs) — confirmed unchanged and
  not reactivated.

## 4. Bugs and fixes

| ID | Sev | Defect | Fix | Regression |
|----|-----|--------|-----|------------|
| INV-01 | HIGH | `Admin\InventoryController::updateStock` (`PATCH\|POST /api/inventory/{id}/stock`) wrote nonexistent `quantity` column → SQL error on every non-batch item; silently clamped over-draws; wrote incomplete logs | Delegated to `InventoryService::adjustStock` | `StockAdjustmentEndpointsTest` (8 tests) |
| INV-02 | MED | `Inventory\DashboardController` `POST /inventory/{id}/stock` silently clamped over-draw to 0 and reported success | Delegated to `InventoryService::adjustStock` | same file — overdraw rejected tests |
| INV-03 | MED | `adjustStock` rejected `quantity<=0` for all types → `set` to 0 impossible (UI allows it) | Service allows `set`→0; controller `min:0` | `set to zero is allowed` |
| INV-04 | MED | `reorderRequest` fabricated `RR-*` id and persisted nothing while UI claimed success | Persists real manager notification via `WorkflowNotifier` | `reorder request persists manager notification` |
| INV-05 | MED | `disposeBatch` non-transactional, no locks, log lacked actor/movement_type/before-after — source of the 12 actor-less legacy rows | Rewritten: txn + row locks + full log metadata | covered by batch suites (53 tests) |
| INV-06 | LOW | `InventoryItem` `created` hook + legacy `decrementStock`/`incrementStock`/`updateStock` helpers wrote minimal logs | Full actor/before/after metadata | `stock changes are logged`, `initial stock is logged` |
| INV-07 | LOW | `config/app.php` hardcoded `'UTC'` — `APP_TIMEZONE` unconfigurable; `before_or_equal:today` rejects a legitimate client "today" when client and server TZ differ | `env('APP_TIMEZONE','UTC')` (zero behavior change when unset) | e2e phase12 lifecycle re-run |
| E2E-01 | — | `test-utils.js::loginAs` minted tokens via `VITE_API_BASE_URL` (:8000) while `apiLogin`/specs use `E2E_API_URL` → token/DB mismatch → silent 401→/login stalls | `loginAs` prefers `E2E_API_URL` | dashboard spec now passes |
| E2E-02 | — | `inventory-dashboard.spec.js` bare glob `**/api/inventory*` could intercept the Vite module `/src/api/inventory.jsx` (timing-dependent corruption) | Pathname-scoped route predicates | 8/8 spec pass |
| E2E-03 | — | `phase12-inventory-workflow.spec.js` hardcoded `dbname=pawesome_e2e_audit` + a single-name gate | `E2E_AUDIT_DATABASE` env, still refuses non-`*audit*` names | spec runs on `pawesome_inventory_audit` |

## 5. Role authorization report

`InventoryRoleAuthorizationTest` — 11 tests, all pass on MySQL:

| Check | Result |
|-------|--------|
| Inventory reads/mutates own module (`/inventory/*`) | PASS (200/201) |
| Inventory blocked: cashier POS sale, payment verify, receptionist order mutation, manager/admin ops | PASS (403) |
| Forbidden ops leave zero state change (stock/log counts unchanged) | PASS |
| Unauthenticated | PASS (401) |
| Other staff roles cannot write inventory | PASS (403) |
| Actor-spoof fields in body ignored (actor = `$request->user()`) | PASS |
| Invalid item id / malformed payload | PASS (404/422) |
| `super_receptionist` reaches inventory | PASS |
| Reorder request persists real notification | PASS |

Shared routes reviewed: `billing/{type}/{id}/finalize-bill` (compute+total only,
no stock) and product lookups are intentionally open to inventory — documented
as design, not defects.

## 6. Database integrity report (dev DB, read-only)

| Check | Result |
|-------|--------|
| Items / logs / batches / monthly audits / suppliers | 843 / 115 / 32 / 2 / 8 |
| Negative stock | 0 |
| Orphan `inventory_logs` (missing item) | 0 |
| Orphan `service_item_usages` | 0 |
| Batch `remaining > received` | 0 |
| Stock-vs-batch drift | **RESOLVED** — #275 `4IN1 VACCINE (TOGALABZ)` reconciled (RECON +8): stock 10 = batch sum 10 |
| Expired active batch | **RESOLVED** — item #838 batch `01` marked `expired`, stock 10→0, `expiry_mark` log |
| Logs missing actor/movement metadata | **12 legacy rows preserved** — actors unrecoverable; both writers fixed (no new rows) |
| `inventory:reconcile-stock` | **APPLIED to `pawesome` (user-approved)** — 381/381 actions; re-run: "All items already in sync"; 0 negative stock, 0 dup RECONs, 0 residual drift |

Full trace: `INVENTORY_DATA_HYGIENE_REVIEW.md`. Backup:
`backups/pawesome_backup_inventory_hygiene_20261118.sql` (restore-verified).
Root causes: #275 = unbatched `stock_adjustment_increment` (log 49) + 5
sale/void self-heal cycles; #838 = expired FEFO batch never swept (deduction
was already blocked); 12 logs = pre-fix writers (initial-stock hook ×6,
`disposeBatch` ×6).

## 7. Stock workflow verification (live, audit stack)

- Remove 2 from item 157: `11 → 9`, log `stock_adjustment_decrement`, actor
  `Administrator`/`admin` — PASS.
- Over-draw 9999: error, no state change — PASS (was silent-clamp pre-fix).
- POS sale → `pos_sale` log + FEFO batch decrement → void → `sale_void` +
  `batch_restock` restore — PASS (cashier spec, and used for §8 cleanup).
- Phase-12 lifecycle: UI product create → `Batch-001` → batch receive
  `Batch-002` → stock-out → monthly audit (variance −1, `discrepancy`,
  `pending`) → manager approve (`approved_by` = manager id) → report shows
  persisted qty — PASS (browser + DB assertions).
- Concurrent deductions cannot oversell/double-deduct — PASS.
- Unauthorized/tampering/duplicate batch_no/insufficient-stock rejected — PASS.
- Batch-receive retry with same `Idempotency-Key` replayed, not duplicated —
  PASS.

## 8. Deviation disclosure

The first cashier-spec run defaulted `E2E_API_URL` to `:8000` and created sale
#76 (`TRX-6AFCA42E0B765`) + a `pos_sale` log in the **dev** DB before timing
out. It was compensated via the designed cashier void endpoint: sale `cancelled`,
item 274 stock restored `57→58`, with `sale_void`/`batch_restock` logs (actor
`Cashier`). Net dev-DB effect: one voided transaction row and its logs —
deliberately retained as audit trail rather than deleted. All subsequent browser
mutation runs used the isolated `:3001`/`:8001`/`pawesome_inventory_audit` stack.

## 9. Automated test results

| Suite | Result |
|-------|--------|
| Scoped backend baseline (`DB_DATABASE=pawesome_test php artisan test`) | 133 tests / 592 assertions — PASS |
| `InventoryRoleAuthorizationTest` + `StockAdjustmentEndpointsTest` | 19 tests / 120 assertions — PASS |
| Post-fix re-run (authz + stock-adj + `InventoryTest`) | 45 tests — PASS |
| `php artisan test --filter=Inventory` (final completion re-run) | **128 tests / 619 assertions — PASS** |
| `php artisan test --filter=POS` (final completion re-run) | **43 tests / 291 assertions — PASS** |
| `npm run build` | PASS (pre-existing chunk-size warnings only) |

Note: `pawesome_test` was rebuilt during this pass after two parallel test
processes corrupted it via a migration race — do not run concurrent
`php artisan test` against the shared test DB.

## 10. Browser test results (isolated stack)

| Spec | Result |
|------|--------|
| `batch5-inventory-system.spec.js` (24 checks — all 17 inventory routes, role bounce-backs) | PASS |
| `inventory-dashboard.spec.js` | 8/8 PASS |
| `inventory-responsive-audit.spec.js` | 3/3 PASS |
| `phase12-inventory-workflow.spec.js` (mutation lifecycle + API hardening + concurrency) | 3/3 PASS, first attempt (flaky 5s expects raised to the spec's 30s convention) |
| `cashier-inventory-workflow.spec.js` (POS → stock logs → manager reports) | PASS |
| `inventory-e2e-database-safety.spec.js` (mutation guard regression) | 9/9 PASS (8 decision-table + 1 live probe; dev leaks 0) |

Evidence: `browser-evidence/system-security-audit-20261108/phase12-inventory/`
screenshots + `inventory-*-evidence.json`.

## 11. Feature verification matrix

| Feature | Status |
|---------|--------|
| Dashboard (live metrics, low/out-of-stock, recent activity, auto-refresh) | PASS |
| Item CRUD incl. archive/unarchive rules, barcode, sellable flags | PASS |
| Unified inventory (list/filter/search/sort/paginate, row actions) | PASS |
| Stock adjustments (remove/set; add → batch receive; over-draw rejected) | PASS |
| Batches (FEFO/FIFO, expiry block, adjust/dispose, `RECON-*` heal) | PASS |
| Movement history / stock logs (complete actor+before/after metadata) | PASS |
| Low-stock / reorder alerts (persisted manager notifications) | PASS |
| Expiration tracking/alerts | PASS |
| Reports + stock movement report | PASS |
| Monthly audits (variance, status, manager approve/reject, immutability) | PASS |
| Audit analytics | PASS |
| Suppliers | PASS |
| Notifications on stock events | PASS |
| Cross-role integrations (POS deduct/void restore, service consumption) | PASS |
| Customer ordering | NOT APPLICABLE (descoped, 410 — verified unchanged) |

## 12. E2E database safety (final-completion addition)

New `frontend/e2e/audit-guard.js` enforces three layers before any mutation
spec runs: env contract (`E2E_API_URL` + `E2E_AUDIT_DATABASE`; dev ports and
dev/test/system DB names hard-fail), a **server-side identity proof** (probe
row written through the API, located via PDO in audit DB and confirmed absent
from dev DB, then cleaned up), and per-worker caching. Wired into
`phase12-inventory-workflow`, `cashier-inventory-workflow`, and the two mutating
`inventory-dashboard` tests. Regression: `inventory-e2e-database-safety.spec.js`
— 9 tests (8 decision-table + 1 live probe), all executed green. Full spec:
`INVENTORY_E2E_DATABASE_SAFETY.md`.

## 13. Deployment readiness (inventory-specific)

| Check | Status |
|-------|--------|
| `APP_DEBUG=false` in prod | NOT VERIFIED (env config — `docs/DEPLOYMENT.md` checklist) |
| `APP_TIMEZONE` configurable | VERIFIED (now `env('APP_TIMEZONE','UTC')`) |
| Inventory indexes | VERIFIED (`inventory_logs`: item/movement/created/user; `inventory_batches`: item/status/expiry) |
| Scheduled inventory task | VERIFIED — `inventory:check-expiries` daily 07:30 (expiry sweep) |
| `inventory:reconcile-stock` | VERIFIED — dry-run default, transactional actions, idempotent; documented in AGENTS.md + hygiene review |
| Queue/mail/CORS/secrets | NOT VERIFIED / BLOCKED (infrastructure — deployment checklist) |
| Test credentials/audit DB names in prod code | VERIFIED clean — guard/specs live in `e2e/` only; no audit DB names in app code |

## 14. Remaining risks

1. **12 actor-less legacy logs** — permanent; actors unrecoverable (documented,
   not fabricated).
2. **Windows e2e flakiness** — socket exhaustion; run `--workers=1|2`.
3. **Bundle size** — ~3.6 MB index chunk (pre-existing; informational).
4. **Shared `finalize-bill` access** — design observation for future RBAC tightening.
5. **UI-mutation caveat** — the e2e guard proves the API endpoint is isolated;
   browser-driven mutations also need `E2E_BASE_URL` pointing at an audit-
   configured frontend (documented in the safety report).
6. **Deployment** — production env/queue/mail config per `docs/DEPLOYMENT.md`.
