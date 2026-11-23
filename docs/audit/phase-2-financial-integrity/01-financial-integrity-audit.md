# Phase 2 Financial Integrity Audit

## Baseline

- Branch: `audit/pawesome-final-acceptance`
- Commit at Phase 2 start: `afd48899e3aa92e65aa0d2364229d5010ad6d9a6`
- Existing worktree: X-15 receipt-label edits/tests and the untracked Phase 1/final-defense audit reports. These were preserved.
- Pre-existing tracked edits at Phase 2 start: `backend/resources/views/emails/payment-receipt.blade.php`, `backend/tests/Unit/EmailMailableSecurityTest.php`, `frontend/src/components/cashier/CashierPOS.jsx`, `frontend/src/components/cashier/CashierTransactions.jsx`, `frontend/src/components/cashier/components/PaymentApprovals.jsx`, `frontend/src/components/customers/CustomerPayments.jsx`, `frontend/src/components/shared/receipt/ReceiptDocument.jsx`, `frontend/src/utils/escpos.js`, `frontend/src/utils/receiptPdf.js`, and `frontend/src/utils/receiptPrinter.js`.
- Pre-existing untracked work at Phase 2 start: `docs/audit/final-defense-revision-audit/`, `docs/audit/phase-1-manuscript-remediation/`, `frontend/src/utils/receiptLabels.js`, and `frontend/src/utils/receiptVatLabels.test.jsx`.
- Prior observed checks: frontend unit tests 70/70; Vite build passed with chunk/import warnings; `EmailMailableSecurityTest` 4/4 passed.
- No development/production database was changed. After conditional authorization, a dedicated `pawesome_phase2_test` database was created on local MariaDB 10.4.32; tests applied the existing migrations there. No application migration was added.

## Workflow verdict

| Area | Finding | Severity / status |
|---|---|---|
| Customer product checkout | Deliberately disabled: `POST /api/customer/store/checkout` returns HTTP 410. Existing order/payment-proof/cancel mutations are also disabled. This conflicts with the prompt's request for a valid customer-store checkout, but reopening it would conflict with the established project scope and `CustomerOrderingDescopeTest`. | BLOCKED by scope; not re-enabled |
| POS prices and totals | Product and service prices, line totals, VAT, grand total and payment amount are computed/persisted server-side. Client amount fields are not used for persistence. | Existing behavior verified by source |
| POS eligibility | Products are checked for active, unarchived, sellable status and stock; services were looked up by ID without checking `is_active`. | P1 defect fixed |
| Receipt item identity | Client-supplied item names were persisted and could mislabel sale items and emailed receipts. | P2 defect fixed |
| Idempotency | Keyed requests serialize on the authenticated user row and replay stored responses. The POS route previously allowed requests with no key, and the UI retained a cached key after deterministic 4xx responses. | P1 gaps fixed |
| Historical customer receipt | Breakdown code referenced an undefined `$orderTotal`, rather than the persisted total. | P2 defect fixed |
| Stock, rollback, void | POS uses a transaction and shared `InventoryService::deductStock`; row locks/FEFO checks and sale void guard are present. Focused rollback/void tests and a two-process last-unit contention test passed on the disposable test database. | PASS on MariaDB; MySQL 8 CI remains unverified |

The approved X-15 VAT labels remain in place. The VAT-inclusive rule and 12% rate were not changed. Tax applicability still requires business/accountant confirmation.

## Changes

1. POS now requires a non-empty `Idempotency-Key`; the existing per-user serialized replay mechanism remains in use.
2. Cashier checkout keeps the key for uncertain network/server failures, but discards it after a deterministic 4xx so a corrected request can use a new key.
3. POS ignores client item labels/prices for persistence, uses database product/service names and prices, rejects inactive services, and rounds line/subtotal values to cents.
4. The exported POS API helper now sends an idempotency key.
5. Historical paid customer order receipts pass their persisted gross total to `ReceiptBreakdown`.
6. Added and executed focused POS, historical-receipt, authorization, atomicity and concurrency feature tests on the dedicated disposable database.
7. Updated the payment receipt email and its assertions to use the exact X-15 labels and avoid presenting included VAT as a subtraction.

No migration was needed. No customer store checkout, manuscript, vaccination-card workflow, X-15 label implementation, unrelated inventory workflow, or previous audit report was removed or rewritten.

## Readiness

**Not ready for Phase 2 acceptance sign-off.** The focused suites passed on local MariaDB except for one GD-dependent skip. MySQL 8 behavior remains unverified. Customer-store product checkout remains intentionally out of scope unless separately re-approved.

## Detailed finding register

### F2-01 — Inactive service accepted at POS

- Severity: P1. Requirement/workflow: reject inactive/non-saleable POS items.
- Evidence: `backend/app/Http/Controllers/Cashier/POSController.php:119-127` now resolves active services under lock; previously the controller used `Service::find()` and accepted a deactivated service.
- Root cause: request validation checked existence, not active sale eligibility.
- Fix: query an active service row under lock before resolving its price/name.
- Test performed: `PosFinancialIntegrityTest::test_inactive_service_cannot_be_sold_through_direct_api` added and PHP-linted.
- Result: PASS in the verified disposable database; included in the 48-test focused feature run.
- Remaining risk: concurrent service deactivation was not exercised.

### F2-02 — Client item labels persisted

- Severity: P2. Requirement/workflow: persisted sale items, receipts and emails must identify the selected database item.
- Evidence: `POSController.php:108-127,175-185,251-256` uses resolved database names; prior persistence used request `item_name`.
- Root cause: client display label was treated as the transaction snapshot.
- Fix: persist product/service names from database rows; client item names/prices are no longer required.
- Test performed: product tampering and active-service tests executed in the focused POS suite.
- Result: PASS in the focused POS feature run.
- Remaining risk: historical sale rows are not rewritten.

### F2-03 — Idempotency was optional on POS and stale after deterministic errors

- Severity: P1. Requirement/workflow: retries must not duplicate sale/payment/stock writes.
- Evidence: `backend/routes/api.php:452` requires middleware key mode; `IdempotencyKey.php:21-42` enforces it. `CashierPOS.jsx` retains keys on uncertain failures but rotates after 4xx.
- Root cause: requests without keys bypassed the ledger; UI could reuse a cached 4xx response key after cart/tender correction.
- Fix: require key at POS route, send it from the shared API helper, and rotate on deterministic 4xx only.
- Test performed: missing-key, replay and changed-payload feature tests passed in the focused POS suite.
- Result: POS idempotency tests PASS in the focused feature run; frontend suite PASS.
- Remaining risk: distinct-key concurrent stock contention passed; simultaneous same-key replay remains source-supported but not separately exercised.

### F2-04 — POS receipt could fall back to client cart amounts

- Severity: P2. Requirement/workflow: receipt UI must show persisted server values.
- Evidence: `frontend/src/components/cashier/CashierPOS.jsx` now calls `frontend/src/utils/posReceipt.js`, which rejects missing authoritative totals/items rather than using cart values.
- Root cause: receipt rendering used request/local totals as a fallback on an incomplete response.
- Fix: validate server items, subtotal, VAT, net and total; preserve cart/key if incomplete.
- Test performed: `frontend/src/utils/posReceipt.test.js`; full frontend unit suite and production build.
- Result: PASS; 73 frontend tests pass and build succeeds.
- Remaining risk: cashier must consult transaction history if a successful backend response lacks receipt details.

### F2-05 — Historical customer receipt used undefined total

- Severity: P2. Requirement/workflow: historical receipt breakdown must match persisted order total.
- Evidence: `backend/app/Http/Controllers/Customer/CustomerStoreController.php:182-213` now passes `$totalAmount`; prior code referenced undefined `$orderTotal`.
- Root cause: variable-name mismatch.
- Fix: pass the persisted total into `ReceiptBreakdown` and fallback payment.
- Test performed: historical receipt regression test passed in the focused feature suite.
- Result: PASS in the focused historical-receipt feature run.
- Remaining risk: read-only historical path only; customer store mutations remain disabled.

### F2-06 — Valid customer product checkout unavailable

- Severity: scope blocker. Requirement/workflow: prompt requests a valid customer checkout, but approved F-02 scope disables self-service product ordering.
- Evidence: `CustomerStoreController.php:12-29,148-151,218-221`; `CustomerOrderingDescopeTest.php:11-19,36-57,105-114`.
- Root cause: explicit prior project descope, not a calculation defect.
- Fix: none; workflow was not re-enabled.
- Test performed: `CustomerOrderingDescopeTest` asserts HTTP 410/no order and was executed.
- Result: disabled workflow test PASS; valid customer checkout remains BLOCKED by scope.
- Remaining risk: customer checkout acceptance cannot be met without scope re-approval.

### F2-07 — Discount policy undefined

- Severity: policy item / P2. Requirement/workflow: discounts must follow authorized backend rules.
- Evidence: `POSController.php:78-83,131-146` ignores client discounts and persists zero; legacy example codes are not a verified POS policy.
- Root cause: no approved server-side discount policy/engine.
- Fix: no new discount behavior introduced.
- Test performed: tampered discount case executed in `PosFinancialIntegrityTest`.
- Result: POS tampered-discount test PASS; source confirms discount input cannot lower total.
- Remaining risk: business owner must define discount eligibility; `discount_code` must not be treated as proof of an applied discount.

### F2-08 — Concurrent stock contention

- Severity: P1 requirement verified on local MariaDB; MySQL 8 verification remains open. Requirement/workflow: concurrent POS requests cannot oversell.
- Evidence: `POSController.php:93-109` and `InventoryService.php:433-447` lock/recheck current stock inside transaction.
- Root cause: original phase did not have an approved isolated test target.
- Fix: added a barrier-synchronized test using two separate Laravel request workers; shared locking path retained.
- Test performed: `PosConcurrentStockTest::test_two_concurrent_pos_requests_cannot_sell_the_last_unit_twice`, using two separately booted requests released through a barrier.
- Result: PASS on the verified disposable MariaDB 10.4.32 test server; one request succeeded, one was rejected, one sale/payment/item persisted, and stock reached zero.
- Remaining risk: run the same test on MySQL 8 CI; local XAMPP server is MariaDB, not MySQL 8.
