# Phase 4 — Inventory Adjustment Semantics + Payslip-Release Email

**Commit:** *(this commit)*
**Base:** `8dba6b2` (Phase 3)
**Scope:** (1) payslip-release email through the durable `email_deliveries` outbox; (2) inventory adjustment/reconciliation semantics review + concurrency/integrity hardening.

---

## 1. Payslip-release email

### Root cause

`App\Mail\PayslipReleasedMail` and both of its Blade views existed (Phase 1/2 era work) but had **zero call sites** — marking payroll paid produced only an in-app `Notification` row. Employees were never emailed that their payslip was ready.

### Implementation

`Api\PayrollController::markAsPaid` already wrapped status transition + loan settlement + notifications in `DB::transaction` under `lockForUpdate`. The outbox intent was added **inside that same transaction**, immediately after the existing in-app payslip notification:

```php
app(EmailDeliveryService::class)->intent(
    new PayslipReleasedMail($payeeName, $payPeriod, (float)$payroll->net_pay, $payslipUrl, $employeeEmail),
    [
        'event_key'      => 'payroll.payslip_released',
        'occurrence_key' => 'payroll.payslip:' . $payroll->id,
        'recipient'      => $employeeEmail,      // authoritative: $payroll->user->email
        'source_type'    => 'payroll',
        'source_id'      => $payroll->id,
        'user_id'        => $payroll->user_id,
    ]
);
```

| Property | Mechanism |
|---|---|
| Atomicity | Intent is created inside `markAsPaid`'s existing `DB::transaction` — if the transition or any later step fails, no intent survives. `SendEmailDelivery` is dispatched `afterCommit` by `intent()`, so it can never send for a rolled-back release. |
| Deduplication | `intent()` does `createOrFirst` on `(event_key, occurrence_key)`. The occurrence key is bound to the payroll row (`payroll.payslip:{id}`) — one payslip email per payroll, ever. Retries/replays return the existing delivery. |
| Recipient | Server-authoritative `$payroll->user->email` — never client input. Payrolls without an account user (`user_id` null, or user without email) produce no intent. |
| Payslip URL | `config('app.frontend_url') . '/' . {role-path} . '/payroll'` — the role-scoped `MyPayroll` route (`super_receptionist` maps to `receptionist`). |
| Authorization | Unchanged — route sits under `role:manager,admin`; release still requires `status === 'pending'` under the row lock. |
| Retry/dispatch | Standard outbox flow: `email-deliveries:dispatch` republishes pending intents; worker sends via `SendEmailDelivery` on the `emails` queue with `max_attempts` (default 4) and send-time suppression re-checks. |

## 2. Inventory adjustment/reconciliation semantics

### Verified existing semantics (correct — preserved)

- **Stock increases are never "adjustments."** Every adjust path (`Admin\InventoryController::adjustStock` → `InventoryService::adjustStock`, `Admin\InventoryController::updateStock`, `Inventory\DashboardController::adjustStock`) rejects `add`/`increment` with *"Stock increases must be recorded as a new batch through the batch receiving action."* FIFO/expiry provenance is therefore always real — never a fabricated +N on a counter.
- **`remove`/`set` reconcile batches, not just the counter.** `InventoryService::reconcileToStock` derives the batch gap vs `getPhysicalBatchStock()`: surplus → a labelled `ADJUST-*` batch; deficit → FEFO write-off via `reduceBatchesFefo`. Flat `stock`/`quantity` then set to target + `InventoryLog` row with before/after/delta/actor.
- **`inventory:reconcile-stock`** artisan command reports (and with `--apply` repairs via `RECON-*` batches) flat-vs-batch drift.
- **Audit**: every path writes `InventoryLog` (before/after, delta, performed_by, role, user_id, reason) and `ActivityLog` + `WorkflowNotifier` alerts.

### Gaps fixed in this phase

| Gap | Fix |
|---|---|
| `Inventory\DashboardController::adjustStock` did read-modify-write **without** a transaction or row lock — a concurrent deduction between read and `reconcileToStock` could drift batches vs the counter. | Wrapped the mutation in `DB::transaction` + `InventoryItem::lockForUpdate()` (same pattern the Admin `updateStock` already used). |
| `Admin\InventoryController::adjustBatch` had no transaction/lock, and accepted `remaining_quantity` **greater than** the batch's received `quantity` — inflating remaining fabricated stock units. | Wrapped in `DB::transaction` with locks on both batch and item rows; added `newQuantity > batch->quantity → 422` guard. |

No semantic changes — `add` stays forbidden, reconciliation math and log shape are identical; the fixes only serialize the writes and close the phantom-stock hole.

## 3. Files changed

- `backend/app/Http/Controllers/Api/PayrollController.php` — outbox intent in `markAsPaid` (+2 imports)
- `backend/app/Http/Controllers/Inventory/DashboardController.php` — `adjustStock` transaction + lock
- `backend/app/Http/Controllers/Admin/InventoryController.php` — `adjustBatch` transaction + locks + quantity cap
- `backend/tests/Feature/Phase4InventoryPayslipTest.php` — new (8 tests)
- `docs/audit/PHASE4_INVENTORY_PAYSLIP.md` — this report

## 4. Verification

| Check | Command | Result |
|---|---|---|
| DB identity | `php artisan tinker` | `mysql / pawesome_test` (phpunit.xml-pinned) |
| Phase 4 tests | `php artisan test --filter=Phase4InventoryPayslipTest` | **8/8 passed, 32 assertions** |
| Full backend suite | `php artisan test` | **984 passed / 1 skipped / 0 failed / 4,906 assertions** |
| Frontend tests | `npx vitest run` | **32/32** |
| Production build | `npm run build` | clean (pre-existing chunk-size warnings only) |

Test coverage: intent creation (keys, encrypted recipient, source linkage, serialized `PayslipReleasedMail` payload), dedupe on repeat release, no intent on rejected/unauthorized release, **transaction rollback when outbox throws** (status stays `pending`, zero rows), no intent for non-account payrolls, batch-quantity cap rejection, valid batch adjustment updating stock + audit log.

## 5. Known limitations / remaining risks

- The payslip deep-link uses a role-path map (`veterinary`→`veterinary`, `super_receptionist`→`receptionist`); unknown roles still get a `/{role}/payroll` path that may not resolve — the email copy directs the user to My Payroll regardless.
- Actual email delivery still depends on the queue worker + `email-deliveries:dispatch` scheduler being supervised in production (`QUEUE_CONNECTION=sync` in the demo bypasses this).
- `DashboardController::adjustStock`'s `remove` clamps at zero (`max(0, ...)`) rather than rejecting — pre-existing semantic, kept deliberately.
- Rollback: revert the three controller edits + delete the test file; no schema or data changes were made.

## 6. Stop gate

Phase 4 complete at this commit. Phase 5 (schema cleanup) and Phase 6 (manuscript/docs alignment) remain unauthorized pending explicit approval.
