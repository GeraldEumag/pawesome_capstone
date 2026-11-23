# Phase 2 Completion Report

## Verdict

**PARTIALLY COMPLETE — not ready for final Phase 2 acceptance sign-off.** Focused backend suites passed on the verified disposable test database: 88 tests passed and one GD-dependent image test was NOT RUN. The available server was MariaDB rather than MySQL 8.

## Confirmed fixes

1. Inactive services can no longer be sold by a direct POS API request.
2. Client-submitted product/service names no longer control persisted sale-item or receipt-email labels.
3. The POS API route requires an idempotency key; deterministic 4xx failures in the UI rotate to a fresh key, while uncertain failures retain the retry key.
4. Historical customer order receipt breakdown uses the persisted order total.
5. POS product/service line and subtotal amounts are rounded to cents.
6. POS receipt UI no longer falls back to client cart totals/items when the server receipt is incomplete.
7. Added and executed a true two-process last-unit contention test: one sale succeeds, the competing request is rejected, and stock is deducted exactly once.
8. Aligned payment email output and test assertions with the exact X-15 VAT-inclusive labels; verified outbox/email tests.

## Existing correct behavior retained

- Product pricing, stock eligibility, stock deduction and VAT-inclusive total calculation are backend-authoritative.
- Sale/items/payment/invoice/stock changes are transactionally grouped and use the existing inventory service.
- Cash underpayment is rejected; payment amount follows backend total.
- Cashier route authorization and proof-versus-verification separation remain in place.
- X-15 labels and the 12% VAT calculation remain unchanged.

## Blocked or open

- Customer product checkout is intentionally disabled (HTTP 410) and remains so. A valid-checkout test is blocked until the approved scope is explicitly changed.
- One GD-dependent receipt image downscale test is NOT RUN because GD is unavailable.
- POS concurrency passed on MariaDB 10.4.32; MySQL 8 CI execution remains unverified.
- The discount endpoint contains example codes, but POS has no approved server discount policy. No discount policy was invented or enabled.
- Accountant/business confirmation of VAT applicability remains open.

## Database and X-15

- Migrations required: **No**.
- Application schema/migrations added: **No**. A new disposable `pawesome_phase2_test` database was created, verified empty, and migrated by the authorized test runs. Existing `pawesome` and `pawesome_test` were not targeted.
- X-15 VAT-inclusive receipt labels: **Preserved**.
- Vaccination-card workflow: **Untouched**.
- Manuscript and previous audit reports: **Untouched**.

## Next action required

Remaining acceptance work: verify the focused suites on MySQL 8 CI and obtain business confirmation of the VAT and discount policies. Customer product checkout remains out of scope pending a separate scope decision. No Phase 3 work was started.
