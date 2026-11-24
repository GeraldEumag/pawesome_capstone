# FINAL_SYSTEM_REVISION_TRACKER.md — Pawesome Capstone B

**Revision cycle:** 2026-11-24 · **Branch:** `audit/pawesome-final-acceptance` · **Baseline HEAD:** `3ec1845b`

Classification: BUG / SECURITY / DATA_INTEGRITY / FEATURE_GAP / UX / PERFORMANCE / ACCEPTED_GAP
Severity: P0 blocker · P1 must-fix · P2 in-scope · P3 document/defer
Status: PENDING / IN PROGRESS / FIXED / VERIFIED / BLOCKED / ACCEPTED GAP

---

## A. Implementation findings (this revision)

| Revision ID | Panel Ref | Classification | Severity | Module | Current Condition | Root Cause | Proposed Correction | Status |
|---|---|---|---|---|---|---|---|---|
| FR-01 | §8.3 Units of measurement | FEATURE_GAP | P2 | Inventory | `inventory_items.unit` is a display-only varchar; no write endpoint accepts it; stock in/out/returns take base-unit integers only. No piece/pack/box conversion exists anywhere. | UOM was never modeled — only a label column added incidentally. | Add `pack_size`/`box_size` (base units per packaging unit) + writable `unit`; convert `unit`-tagged quantities to base units server-side in `recordStockIn`/`recordStockOut`; expose fields in item payloads; unit selectors in Stock In/Out UI; Add Product fields. Physical-count adjustments, customer returns, and POS remain base-unit by design (documented). | IN PROGRESS |
| FR-02 | §8.2/§8.4 SKU & barcode generation | FEATURE_GAP | P2 | Inventory | SKU auto-generates (`InventoryService::generateSKU`, category prefix + random) but can collide → 422 instead of retry. Barcode is **required** for sellable items yet has no generator — staff must type/scan every code. | Auto-gen exists only for SKU; barcode requirement predates any generator. | Auto-generate a unique EAN-13 barcode (check-digit valid, CODE128-scannable) when a sellable item is created without one; keep the "cannot clear barcode on update" rule; SKU generation retries on collision. Update the one test asserting rejection. | IN PROGRESS |
| FR-03 | §5.2/§13.4 Report-path indexes | PERFORMANCE | P3 | Database/Reports | `payments.{created_at,status}`, `service_requests.{created_at,status,payment_status,request_date}`, `sales.status`, `appointments.created_at` are unindexed while report/cashier-queue queries filter on them. Table cardinalities are small (payments ≈45 rows dev). | Indexes never added for report filters. | **Evidence gate:** run `EXPLAIN` on the actual report/queue queries first; add a single additive migration only if plans show full scans on non-trivial tables; otherwise ACCEPTED_GAP with rationale. | PENDING |

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
