# Booking Test Results

Audit date: 2026-11-18/19. Working DB boundary: see residue/deletion report; all subsequent API mutation probes used `pawesome_booking_audit` via `:8030`.

## PHPUnit

- Baseline booking subset before code changes: **96 passed, 412 assertions**, 195.12 s. Command used `DB_DATABASE=pawesome_test` and filters for walk-in, booking scheduling, boarding room availability/lifecycle, customer booking rules/board, payment channel, store hours, and check-in gates.
- Final targeted regression command (booking, walk-in, hotel lifecycle/availability, customer rules, payment channels, store hours, check-in, transactions, grooming audit regression, reports and manager reconciliation): **145 passed, 630 assertions**, 259.07 s.
- After that command, a focused regression for reopening a cancelled grooming request **without a linked execution row** passed (**1 test, 3 assertions**). This closes a state-machine edge case discovered during final code review.
- `BookingFinalAuditTest` covers terminal grooming reopen prevention on both endpoints and with/without an execution row, grooming status synchronization/transition and payment gates, store-timezone check-in, and walk-in reservation release.
- An intermediate combined test run hit a MariaDB deadlock during concurrent migration setup; isolated rerun and final targeted command passed. No code defect was implicated.
- Full backend suite: **NOT TESTED**.

## Live API probes (`pawesome_booking_audit`)

| Probe | Result |
| --- | --- |
| unauthenticated booking POST | 401 |
| customer→receptionist approval; vet→approval; receptionist→cashier verify; cashier→vet status; customer→walk-in | all 403 |
| online vet booking; duplicate same slot; outside-hours slot | 201; duplicate 422; invalid time 422 |
| customer price spoof (`0.01`) | stored catalog price (`500.00`) |
| receptionist sees request; approved vet with assigned veterinarian | visible; 200 |
| vet scheduled→completed direct; invalid status | both 422 |
| vet starts and saves medical notes | both 200 |
| duplicate vet approval | 200 idempotent response; no second appointment (also covered by existing PHPUnit regression) |
| grooming request/approval | 201 / 200 |
| unpaid grooming completion | 422 |
| cancelled grooming→approved/in_progress before fix | both 200 (confirmed defect); regression tests after fix return 422 |
| hotel room capacity 1 | first overlapping booking 201; second 422 |
| blocked holiday date | 422 |
| online hotel card gate | approval before vaccination verification 422; after verification 200 |
| walk-in hotel | creation 201; approval 200; cash settlement 200; check-in 200; care log 200; checkout 200 |
| walk-in reservation status after checkout before fix | remained pending; availability false (confirmed DEF-002); code/test fix added |
| sales date filters (manager and admin) | HTTP 200 each; 48 rows and nonzero revenue |
| online payment proof/verification | multipart upload succeeded; cashier verification marked paid; repeat verify 422 |

Live emails were configured `MAIL_MAILER=array`; no external provider was called. E2E audit stack used 4 `artisan serve` workers behind :8030.

## Browser E2E (Playwright)

Command: selected six specs (`booking-channel-gating`, `customer-bookings-board`, `phase12-boarding-workflow`, `phase12-veterinary-workflow`, `receptionist-room-assignment`, `receptionist-booking-order`) with `E2E_BASE_URL=http://127.0.0.1:3001`, `E2E_API_URL=http://127.0.0.1:8030/api`, Chromium, 1 worker.

Observed summary: **6 passed, 3 failed, 6 skipped, 4 did not run**. Confirmed failures:

1. `booking-channel-gating`: online counter-verification flow failed; see Playwright error context/trace under `frontend/test-results/`.
2. `booking-channel-gating`: walk-in fixture could not find a free grooming slot within 90 days (seeded DB capacity exhaustion).
3. `customer-bookings-board`: URL/date-preset round-trip timed out waiting for update timestamp.

The browser suite was not all green; these E2E scenarios are **NOT VERIFIED**. Existing backend tests remain the stronger evidence for the relevant domain rules.

## Frontend / other

- Production build: `npm run build` **PASS**, Vite 6.4.5, 2m26s. Existing dynamic/static import and large-chunk warnings remain; build exits successfully.
- Frontend unit tests: **NOT TESTED**.
- Full browser six-flow manual E2E: **NOT TESTED**.
- Provider delivery, MySQL 8 parity, and production deployment checks: **NOT TESTED**.
