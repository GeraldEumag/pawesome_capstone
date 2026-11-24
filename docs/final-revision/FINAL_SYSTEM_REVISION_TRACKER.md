# FINAL_SYSTEM_REVISION_TRACKER.md — Pawesome Capstone B

**Revision cycle:** 2026-11-24 · **Branch:** `audit/pawesome-final-acceptance` · **Baseline HEAD:** `3ec1845b`

Classification: BUG / SECURITY / DATA_INTEGRITY / FEATURE_GAP / UX / PERFORMANCE / ACCEPTED_GAP
Severity: P0 blocker · P1 must-fix · P2 in-scope · P3 document/defer
Status: PENDING / IN PROGRESS / FIXED / VERIFIED / BLOCKED / ACCEPTED GAP

---

## A. Implementation findings (this revision)

| Revision ID | Panel Ref | Classification | Severity | Module | Current Condition | Root Cause | Proposed Correction | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | §8.3 Units of measurement | FEATURE_GAP | P2 | Inventory | `inventory_items.unit` was a display-only varchar; no write endpoint accepted it; stock in/out/returns took base-unit integers only. | UOM was never modeled — only a label column added incidentally. | Added `pack_size`/`box_size`/`unit_options` (migration `2026_11_24_000001`), writable `unit`, UOM-aware conversion in `InventoryService::recordStockIn`/`recordStockOut`, `uom.js` helper + selectors in Stock In/Out pages, Add Product fields. Physical-count adjustments, customer returns, and POS remain base-unit by design (documented). | FIXED — `InventoryUnitOfMeasureTest` 9/9 green; commit `b852fb26` |
| FR-02 | §8.2/§8.4 SKU & barcode generation | FEATURE_GAP | P2 | Inventory | SKU auto-generated but could collide → 422 instead of retry; barcode required for sellable items with no generator. | Auto-gen existed only for SKU; barcode requirement predates any generator. | `InventoryService::generateEAN13` (valid check digit, uniqueness-checked) auto-fills barcode on sellable item creation; SKU generation retries on collision; "cannot clear barcode" rule preserved. `BarcodeLookupTest` updated for auto-generation. | FIXED — 33 tests green (BarcodeLookup + UOM); commit `b852fb26` |
| FR-03 | §5.2/§13.4 Report-path indexes | PERFORMANCE | P3 | Database/Reports | `payments.created_at`, `service_requests.{created_at,payment_status}`, `customer_orders/boardings/medical_confinements/appointments.created_at`, `sales.status` unindexed; EXPLAIN showed `type=ALL` + filesort on payments/service_requests report merges and cashier-queue filters. | Indexes never added for report filters. | Migration `2026_11_24_000002` adds 8 single-column indexes (additive, reversible, existence-guarded). Post-migration EXPLAIN: `type=range` using the new indexes. | FIXED — EXPLAIN before/after evidence; commit `b852fb26` |
| FR-04 | §8.4 Concurrency | BUG / DATA_INTEGRITY | P1 | Inventory/Notifications | `InventoryConcurrentReturnTest` returned `[201,500]` — INNODB deadlock: `WorkflowNotifier` inserts took S locks on target `users` rows inside the business transaction while the idempotency middleware held the requester's X lock → users↔inventory_items lock-order inversion. Same shape existed for every `notifyRole`/`notifyUser` call inside any idempotent POST. | Notifications written inside business transactions acquire FK shared locks on `users` rows concurrently X-locked by other requests. | `WorkflowNotifier::{notifyUser,notifyEmail,notifyRole}` now write via `DB::afterCommit` — post-commit (or immediately when no transaction), rolled-back work never notifies. | FIXED — deadlock reproduced via `SHOW ENGINE INNODB STATUS`, resolved; concurrency tests green |
| FR-05 | §10.x Idempotency | BUG | P2 | Middleware | `IdempotencyKey::handleLocked` ran a per-request DELETE of expired `idempotency_keys` rows inside the transaction → X gap/supremum lock on the unique index early; the final response INSERT then deadlocked against a concurrent request holding business-row locks (`idempotency_keys`↔business-row inversion). A daily `idempotency:prune-keys` schedule already exists. | Redundant lazy expiry inside the hot request path. | Removed the per-request DELETE; expired rows are ignored by the `created_at >=` lookup and pruned by the scheduler. | FIXED — deadlock pair confirmed via InnoDB status; concurrency suite green |
| FR-06 | §8.4 Return oversell | DATA_INTEGRITY | P1 | Inventory | After deadlock fix, both concurrent returns returned 201 — `validateReturnSource`'s `alreadyReturned` sum used a plain consistent read on a pre-lock snapshot (REPEATABLE READ), missing the winner's just-committed return → oversell possible. | Stale-snapshot consistent read after `lockForUpdate`. | `alreadyReturned` sum now `->lockForUpdate()` — latest committed read under the item row lock. | FIXED — `InventoryConcurrentReturnTest` now `[201,422]` green |
| FR-07 | Test isolation | BUG | P1 | Test suite | `PosConcurrentStockTest`/`InventoryConcurrentReturnTest` override `beginDatabaseTransaction()` (workers are separate processes) and committed fixtures+financial rows into shared `pawesome_test` → 60 downstream failures (payroll PAW-0001 collisions, revenue/count drift, POS phantom rows). Suite at HEAD had never run green (1128-test green predates HEAD commit `3ec1845b`). | No cleanup of intentionally-committed rows. | `tearDown` in both classes deletes every committed row (sales/items/payments/invoices/logs/returns/notifications/email_deliveries/tokens/users) scoped to captured IDs + test window. | FIXED — full suite re-run pending |
| FR-08 | Test payload | BUG | P3 | Tests | `PublicRegistrationIntegrityTest` payload missing `date_of_birth` (required since `df19cc2f`, Apr 2026) — stale test. | Test not updated when field became required. | Added `date_of_birth` to payload. | FIXED — commit `172dc6ce`, 2/2 green |

## B. Verified-current items (inspected this revision — no change needed)

| Area | Evidence | Status |
|---|---|---|
| Animal-type compatibility (§7) | `PetServiceCompatibilityService::validateServiceCompatibility` enforced in `ServiceRequestController::store` → 422 `service_not_allowed`; `BoardingRoom.allowed_species` + `BoardingRoomService` room assignment; species rules cover Dog/Cat/Rabbit/Bird/Hamster/Fish/Reptile/Other | VERIFIED (code) — E2E re-probe in Phase 4 |
| Distinct stock workflows (§8.6) | `StockMovementController`: `stock-in`, `stock-out` (with approval queue for sensitive reasons), `returns` + `disposition` (restock/quarantine/damaged/dispose); all delegate to `InventoryService` inside transactions with `lockForUpdate` | VERIFIED (code) |
| Stock movement history (§8.7) | `InventoryLog` rows carry delta, stock_before/after, movement_type, reason, reference, actor (`user_id`, `performed_by`, `role`) — written inside the same transactions | VERIFIED (code) |
| Inventory alerts (§8.9) | `getLowStockItems`, dashboard `low_stock_count`, deduped `WorkflowNotifier` alerts on threshold crossing | VERIFIED (code) |
| Barcode lookup/POS (§8.4/§10.1) | `GET /api/products/barcode/{code}` normalized lookup, 404-safe, sellable/stock gated; `BarcodeGenerator.jsx` prints CODE128 labels via JsBarcode | VERIFIED (code) |
| Server-side POS pricing (§10.2) | `POSController::processTransaction` ignores client prices; resolves server unit prices, recomputes subtotal + VAT `subtotal*0.12/1.12` (VAT-inclusive), wraps in transaction with idempotency | VERIFIED (code, HEAD commit) |
| VAT receipts (§10.3/§10.6) | `net_amount`/`vat_amount`/`vat_rate` on all receipt payloads; `EmailContent::vatInclusivePortion`; on-screen breakdowns | VERIFIED (code) — prior E2E evidence HISTORICAL |
| Payment verification (§10.4) | `PaymentVerificationService` cashier-only verify; receipt-scanner chain flags low-confidence; AI never auto-approves | VERIFIED (code) |
| PDF logo (§11) | Sole PDF generator `PayslipPdfService` embeds `public/pawesome.jpg` as data URI (Dompdf `isRemoteEnabled=false`-safe); receipts are HTML print views | VERIFIED (code) |
| Inactive-account block (§4.1) | `ApiTokenAuth` middleware rejects `!$user->is_active` | VERIFIED (code) |
| Email outbox (§16.2) | `email_deliveries` durable outbox + `SendEmailDelivery` job + suppression/dedup; Brevo provider proven previously | VERIFIED (code); provider delivery = environment gate |
| Chatbot (§16.3) | FAQ → Groq/Gemini AI → rules fallback; `chatbot:eval` harness; no privileged actions | VERIFIED (code) |
| Reports date filter (SYS-002) | `AdminLiveReport.jsx` now has `DatePickerInput` start/end + presets → `start_date`/`end_date` params | STALE → **FIXED** (pre-existing) |

## C. Carried-over open items (from `docs/audit/` trackers — reclassified)

| ID | Classification | Severity | Item | Disposition |
|---|---|---|---|---|
| C-01 | ACCEPTED_GAP | P3 | Unrouted legacy payroll `update`/`processPayment` (SYS-004) | Dead code, unreachable — document only |
| C-02 | ACCEPTED_GAP | P3 | PAT tokens long-lived, no TTL/rotation policy (SYS-006/R-03) | Deployment-hardening item — document in DEPLOYMENT_READINESS |
| C-03 | ACCEPTED_GAP | P3 | `xlsx@0.18.5` advisories (DEP-002) | Risk-accepted: write-only usage proven; guard documented |
| C-04 | PERFORMANCE | P3 | Main bundle 3.7 MB / 1,086 kB gzip (PERF-001) | Chunking opportunity; not a defect — document |
| C-05 | ACCEPTED_GAP | P3 | Free-text payroll rows trust entered totals (SYS-005) | Maker-checker gated; Option B is a business decision |
| C-06 | BLOCKED | — | MySQL 8 engine verification, live deploy, Brevo domain auth, queue/scheduler daemons, edge HTTPS | External/environment gates — cannot be produced locally |
| C-07 | ACCEPTED_GAP | P3 | `pay_period_start/end` VARCHAR storing `YYYY-MM-DD 00:00:00` | Cosmetic; queries work — document |

## D. Evidence status of prior audit claims relied upon

See `SYSTEM_BASELINE_AUDIT.md` §4. Summary: code-level claims re-verified this
revision; runtime/browser claims from 2026-11-08/18 marked HISTORICAL pending
Phase 3/4 re-execution; provider/deployment claims remain environment-gated.
