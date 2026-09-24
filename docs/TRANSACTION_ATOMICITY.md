# Transaction Atomicity & Data Consistency — Pawesome

Audit + hardening record for multi-write backend workflows. Every workflow
below was traced end-to-end (controller → service → model).

## Transaction boundary map

| Workflow | Tables written | Boundary | Concurrency control | External effects |
|---|---|---|---|---|
| POS checkout | sales, sale_items, payments, invoices, inventory_items(+batches), inventory_logs | `DB::transaction` in `POSController::processTransaction` | `lockForUpdate` on each product before the stock check; deduction serialized by `InventoryService::deductStock` row lock | Audit log after commit |
| POS void/refund | sales, payments, invoices, inventory_items, inventory_logs | `DB::transaction` in `voidTransaction` | `lockForUpdate` on the sale row — a second void waits, sees `cancelled`, returns 400 | Audit log after commit |
| Payment verify (all 6 types) | payment table + linked service record + service_item_usages | `DB::transaction` in `PaymentVerificationService::performVerify` | `lockForUpdate` on the payment record and linked service record | Notification rows are inside the tx (roll back on failure); audit log after |
| Payment reject | payment table | `DB::transaction` in `performReject` | `lockForUpdate` on the record | Same |
| Customer order approve | customer_orders, inventory_items, inventory_logs | `DB::beginTransaction` | Order row locked + `status` re-checked inside the tx; inventory rows locked in `inventory_item_id` order (deadlock-safe ordering) | Notification + audit after commit |
| Customer order reject/cancel | customer_orders, inventory_items, inventory_logs | `DB::beginTransaction` | Same locked re-check; stock restore only when `status === 'approved'` | Notification + audit after commit |
| Order status update | customer_orders, inventory_items | `DB::transaction` + order `lockForUpdate` (pre-existing) | deductStock/addStock lock items | — |
| Inventory adjust | inventory_items, inventory_logs, activity_logs | `DB::transaction` | `lockForUpdate`; negative stock rejected | Notification rows inside tx |
| Inventory create/update/archive/delete | inventory_items, batches, inventory_logs | `DB::transaction` (added) | `lockForUpdate` on update/archive/delete | — |
| Service inventory usage (vet/grooming/boarding) | service_item_usages, inventory_items(+batches), inventory_logs | `DB::beginTransaction` in each `*InventoryService` | `lockForUpdate` on items (vet explicitly; all via `deductStock`) | Low-stock notifications after commit |
| Boarding add-on deduct/restore | booking_add_ons, inventory_items, inventory_logs | `DB::transaction` in `BoardingAddOnInventoryService` | `lockForUpdate` per item + `deduction_status` guard prevents double-deduct | — |
| Appointment markAsPaid | sales, appointments | `DB::transaction` + `lockForUpdate` (pre-existing) | already-paid re-check inside tx | — |
| Confinement admit/release/clear/progress-note | medical_confinements, hotel_rooms, medical_progress_notes | `DB::transaction` (added) | status guards before write | Notification + audit after commit |
| Attendance check-in | users (lock), attendance | `DB::transaction` (added) | user-row lock serializes check-then-create | — |
| File uploads (proofs/photos) | owning record | `FileStorageService::storeAndPersist` — DB write in tx | new file deleted on failure; old file removed only post-commit | Filesystem is not transactional — handled by delete-on-failure lifecycle |
| Chatbot bookings | single-row creates | n/a (single write) | — | — |

## Gaps found and fixed

1. **`PaymentVerificationService`** — verify/reject wrote the main payment
   record, then ran the linked-service update and billing sync as separate
   commits. A billing failure left `payment_status='paid'` with unpaid line
   items. Now wrapped in `DB::transaction` with `lockForUpdate` on every
   record read.
2. **`CustomerOrderController::approve/reject/cancel`** — the `status` guard
   and inventory reads ran outside the transaction and without locks. Two
   concurrent approvals could double-deduct stock; approve+reject could
   double-restore. Order row is now locked and status re-checked inside the
   transaction; inventory rows are locked in sorted order.
3. **`POSController::voidTransaction`** — no lock on the sale row (double-void
   → double stock restore) and an early return left the transaction open.
   Both fixed.
4. **`MedicalConfinementController`** — `admit`, `release`,
   `clearForDischarge`, and `addProgressNote` performed multi-table writes
   (confinement status + room occupancy + progress note) with no transaction.
   A failed room update could leave a pet "admitted" in a free room. Wrapped.
5. **`InventoryService::deductStock`/`addStock`** — the stock check read the
   row without a lock, so non-POS callers could oversell under concurrency.
   Both now `lockForUpdate`. `createItem`/`updateItem`/`archiveItem`/
   `deleteItem` wrapped in transactions so item writes and their inventory
   logs can't diverge.
6. **`AttendanceController::checkIn`** — check-then-create could produce a
   duplicate same-day record under a race; now serialized on the user row.

## Deliberately not transactional / deferred

- `InventoryDeductionService` — dead code (imported but never called; reads a
  non-existent `quantity` column). Superseded by `BoardingAddOnInventoryService`.
  Candidate for removal in a cleanup phase.
- `ServiceBillingService::syncServicePaymentState` when called from
  `getServicesWithUnpaidBalances` performs a sync-on-read single-row write per
  service — idempotent by design; left as-is.
- Activity-log writes are intentionally outside workflow transactions
  (post-commit) so an audit failure can never roll back business state, and a
  rolled-back operation is never recorded as completed.
- `WorkflowNotifier` writes `notifications` table rows (no external dispatch),
  so notifications inside a transaction roll back correctly — no afterCommit
  needed today. If real queued mail is added later, dispatch it after commit.

## Regression tests

`tests/Feature/TransactionAtomicityTest.php` — 15 tests covering commit-all,
late-failure rollback (via forced model-event exceptions), no partial
deductions, double-void/double-approve/double-reject idempotency, negative
stock rejection, room-status atomicity, and duplicate check-in prevention.
