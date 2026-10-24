# Final System Audit — Pawesome Capstone B

**Date:** 2026-10-25 · **Baseline:** branch `main`, HEAD `3e75be0`, 62 modified/untracked entries (Revision B WIP — all preserved untouched). **Test env:** PHP 8.2.12, MySQL `pawesome_test` (empty fixtures, RefreshDatabase), Vite :3000 + artisan :8000 for captures.

## Architecture
Laravel 12 API (`routes/api.php`, 731 route lines, `ApiTokenAuth` + role middleware), React 18/Vite SPA (9 role route files), MySQL. Email via durable `email_deliveries` outbox → `emails` queue → mailable in `SendEmailDelivery` job.

## Findings & status (prior reconcile list)

| # | Item | Status | Evidence |
|---|---|---|---|
| F-01 | Inactive users obtaining API access via tokens | **FIXED** | `ApiTokenAuth.php:41` `!$user->is_active` reject; P1 test: "deactivated user token is rejected", "reactivated works again" |
| F-02 | POS trusting client prices/totals | **FIXED** | P1 test "pos ignores manipulated price and total" — server recomputes; also "hotel booking computes total from server room rate", "service request binds price to service" |
| F-03 | Boarding add-on inventory not wired | **FIXED** | P1: "approval deducts addon inventory once", "insufficient stock blocks approval atomically", "rejecting approved boarding restores addon stock" |
| F-04 | Payment-reference uniqueness | **FIXED** | `PaymentReferenceGuard` + BT "payment reference cannot be reused for a different booking"; P9 live: all 4 flows → 422 |
| F-05 | Confinement cancellation | **FIXED (uncommitted)** | `MedicalConfinementController::cancel` — locked txn, whitelist `recommended/consented/bed_assigned/approved_for_admission`, 422 stale-state, admitted must discharge |
| F-06 | Dispensation void | **FIXED (uncommitted)** | `DispensationController::void` (line 69) + route; dedupe test "duplicate dispense within window is rejected" |
| F-07 | Email delivery reliability | **PARTIAL** | Outbox intents dispatch verified (provider accepted); mailbox delivery BLOCKED — non-routable test domains |
| F-08 | Duplicate POS sale on retry | **FIXED (uncommitted)** | `IdempotencyKey` middleware on `pos/transaction` + frontend key reuse; test "oversized idempotency key rejected" |
| F-09 | Double-approve boarding | **FIXED** | Serialized pending transition; P9 concurrent test — one success, one 422 |
| F-10 | Store checkout open | **N/A** | Intentionally disabled — `CustomerStoreController` → 410 (P1 test) |

## Test evidence this session
- `php artisan test --filter='P1SecurityIntegrityTest'` → **15/15, 60 assertions** on current tree.
- `php artisan test --filter='PaymentBookingChannelTest|PrivatePetPhotoTest|BookingSchedulingIntegrityTest|BoardingRoomLifecycleTest|VeterinaryBillingPaymentFlowTest|AuditRegressionTest|EmailAuthFlowTest'` → **98/98, 493 assertions**.
- Mocked Playwright (after spec repairs): `revision-b-confirmed-flows` 5/5, `customer-add-pet-modal` 7/7 — no app defects.

## Remaining risks
See `REMAINING_RISKS.md`. Headlines: full 606-suite not rerun this session; mailbox delivery unproven; uncommitted WIP is not yet committed/regression-final; no load/concurrency soak testing.
