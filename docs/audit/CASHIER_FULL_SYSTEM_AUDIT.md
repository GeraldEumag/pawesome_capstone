# Cashier Module — Full-System Audit

Date: 2026-11-18 · Method: isolated `pawesome_cashier_audit` clone (API :8001, frontend :3001) + `pawesome_test` PHPUnit + live multi-role probes + source tracing. Nothing assumed from prior audit docs — everything re-verified.

## 1. Architecture as verified

```
React (CashierPOS / Dashboard / Transactions / History / Reports / PaymentApprovals)
  → src/api/{pos,cashierEndpoints,client}.js  (USE_MOCK_DATA=false, Bearer tokens)
  → routes/api.php  (54 cashier routes: auth.api + throttle + role:cashier)
  → Cashier\{DashboardController,POSController,ReceiptController}
    + Api\CashierPaymentController
  → Services: PaymentVerificationService (row-locked, channel-aware),
    PaymentSettlementService (append-only ledger, idempotent),
    InventoryService (all stock mutations, batch-aware),
    ServiceBillingService, VisitCompletionService, WorkflowNotifier
  → MySQL: sales/sale_items/payments/invoices (POS) +
    payment_settlements/_items (service ledger) +
    service_requests ↔ boardings/appointments/groomings/medical_confinements
```

## 2. Per-workflow verdicts

| Workflow | Verdict | Evidence |
|---|---|---|
| POS checkout | **Verified** | Server-authoritative pricing (client ₱0.01 → persisted ₱900), VAT-inclusive 12% (₱2,300 → ₱246.43), cash floor, payment-method validation, empty-cart/oversell 422, atomic writes (1 sale + items + payment + invoice + 1 deduction log) |
| Idempotency | **Verified** | `Idempotency-Key` replay returns same sale, no duplicates; settlement ledger has its own `verify:{type}:{id}:{receipt}` key |
| Inventory integration | **Verified** | Stock deducted once via `InventoryService`; expired batches excluded; void restored 56→58 exactly once through the dual-ledger convention |
| Void | **Verified (post-fix)** | `/cashier/pos/transaction/{id}/void` was already correct; dashboard `/cashier/void` was **always-500** → fixed (F-01), now full reversal + double-void 400 |
| Refund / multi-payment | **Verified (post-fix)** | Both were **always-500** enum violations → fixed (F-02/03); refund rows net revenue correctly |
| Payment verification | **Verified** | Row-locked, transactional; pending digital proof cannot be downgraded to cash; rejected-proof counter fallback honored; duplicate verify 422; unapproved 422; reject requires reason; settlement + mirror + activity log + receipt outbox atomic |
| Rejection & resubmission | **Verified** | Reason required, resubmission allowed, reject-after-paid 422 |
| Counter cash rules | **Verified** | Online unpaid → 422; walk-in and rejected-online → cash allowed and now recorded on the settlement (F-05) |
| Receipts | **Verified** | `receipt_number` persisted on bookings/settlements; `/cashier/receipt/{id}` + `/customer-order-receipts/{id}` expose stored items + VAT breakdown; proof files behind private routes; scanner flow via `ReceiptConfirmationService` with attempt logging |
| Dashboard & transactions feed | **Verified (post-fix)** | Double-listed linked payments (F-04) and cancelled-sale inflation (F-06) fixed; feed now shows each payment once |
| RBAC | **Verified** | 8-role matrix probed; cashier 403 on receptionist/inventory/admin/manager/payroll paths; unauth 401; composite `super_receptionist` and `admin` allowed; customer blocked at router + UI redirect (e2e) |
| Notifications/email | **Verified** | `WorkflowNotifier` + durable `email_deliveries` outbox; intents created inside the payment transaction (PaymentReceiptOutboxTest + live activity logs) |
| Cross-role sync | **Verified** | `markServiceRequestPaidFromLinked` mirrors settlement onto the originating SR; `syncServiceBillingForVerifiedPayment` marks billable items; `VisitCompletionService::tryComplete` on appointments; payment verification does **not** touch inventory or unrelated services |

## 3. Defect summary (all fixed — see `CASHIER_FIX_CHANGELOG.md`)

| # | Sev | Defect | Status |
|---|---|---|---|
| F-01 | P1 | `/cashier/void` wrote enum-illegal `voided` → always 500 | **Fixed** |
| F-02 | P1 | `/cashier/refund` wrote enum-illegal `refund` type → always 500; model clamp nullified negative-refund design | **Fixed** |
| F-03 | P1 | `/cashier/multi-payment` wrote enum-illegal `multi_payment` type → always 500 | **Fixed** |
| F-04 | P1 | transactions feed double-listed mirrored SRs + settlements | **Fixed** |
| F-05 | P2 | counter-cash settlements recorded `payment_method=NULL` (stale read) | **Fixed** |
| F-06 | P2 | dashboard aggregates summed cancelled sales into revenue | **Fixed** |

Remaining observations (non-blocking): P3 dead code (documented, unreferenced, retained per scope); `applyDiscount` demo calculator; `decimal(8,2)` tender columns; ₱0 sellable product row; model `VALID_*` supersets vs DB enums.

## 4. Data sources of truth (post-fix reconciliation)

| Bucket | Source | Reconciliation |
|---|---|---|
| POS revenue | `sales` where `status='completed'` (net of refund rows) | dashboard = Σ completed; feed = `pos_sale` rows |
| Service revenue | `payment_settlements` (authoritative) | feed excludes `settleable_type='service_request'` (SR leg renders those) AND SRs linked to operational records (settlement leg renders those) — **no double count** |
| Online orders | `customer_orders.payment_status='paid'` | feed `ORDER-*` leg; no order settlements exist (verified) |
| Pending queue | approved-unpaid + pending-proof rows across payable tables | 62 rows verified, excludes unapproved/rejected |
