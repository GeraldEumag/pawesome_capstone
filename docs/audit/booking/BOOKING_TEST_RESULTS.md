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

## Final remediation gate (2026-11-19)

### Git and database safety

- Checkpoint before implementation: `754f2d2` (`checkpoint: booking audit before final remediation`); Payroll files were not included.
- The verified mutation stack remained `:8030` → workers `:8011`–`:8014` → isolated `pawesome_booking_audit`. The requested `pawesome_e2e_audit` was inspected read-only and has four pending migrations, including an unrelated Philippine holiday-calendar update. No migration/reset/truncate was run there.

### Backend regression after remediation

Command:

```text
DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test --filter="BookingFinalAuditTest|ReceptionistCheckInGateTest|PaymentBookingChannelTest|ReportsTest|ManagerReportReconciliationTest"
```

Result: **77 passed, 328 assertions**, 86.57s.

Focused command:

```text
DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test --filter="BookingFinalAuditTest|ReceptionistCheckInGateTest"
```

Result: **24 passed, 74 assertions**, 89.64s. This includes four deterministic rollback injections (before/after the first write through both grooming endpoints), successful linked synchronization, unlinked-record handling, transition and payment gates, store-local check-in, and room-reservation release.

The first combined run before the final guard adjustment had 74 passing and 3 failing check-in assertions because the grooming transition guard also rejected generic `checked_in` status on unlinked legacy service requests. The guard now applies grooming lifecycle transitions only to grooming lifecycle statuses (and still rejects unsupported transitions when an execution row exists); the focused and combined reruns above pass.

### Veterinary completion race

- Initial browser race run: reproduced two HTTP 200 responses for simultaneous completion.
- Fix: reload/lock appointment and recheck active status and assignee inside the transaction before billing or lifecycle updates.
- Focused Playwright test: **1 passed**; response pair asserted as `[200, 422]`.

### Playwright results and dispositions

- Corrected selected run: **11 passed, 4 failed, 1 flaky, 3 did not run**.
- Online and walk-in booking channel-gating tests: **2 passed** after normalizing a duplicated `/api` base.
- Customer-board URL round-trip and tablet tests: initial selected run was timing-sensitive; focused rerun after success/error-aware loading synchronization: **2 passed, 58.8s**.
- Phase 12 hotel negative gates and same-room race: **2 passed, 27.9s**.
- Phase 12 veterinary unauthorized-role case: initially blocked by missing `vet_tech` seed account; isolated test fixture now creates it in the configured audit DB, focused rerun **1 passed, 13.9s**.
- Phase 12 native veterinary lifecycle passed in the selected run. Its concurrent completion case passed after the lock/recheck fix.
- Phase 12 native hotel lifecycle remains unresolved: one attempt received no observed vaccination-verification response after the UI action; retry did not find the scheduled booking in the receptionist's current-date queue. It is not counted as passed.
- The earlier six skips were caused by a hard-coded database name/API port guard. The guard and direct-SQL fixture now use the configured allowlisted isolated DB. Boarding negative/race and all three veterinary cases have focused execution; the boarding native lifecycle remains failed.
- The customer-board receptionist-change propagation test was not reached after the serial failure, then passed independently (**1 passed, 44.0s**).

### Build

`npm run build`: **PASS**, Vite 6.4.5, 1m46s. Existing import/chunk warnings remain.

See `FINAL_REMEDIATION_AND_DEFENSE_ACCEPTANCE.md` for the full failure-by-failure analysis and six-workflow matrix.

## Final acceptance continuation — 2026-11-19

### Focused backend remediation

- `APP_TIMEZONE=UTC DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test --filter='BookingFinalAuditTest'`: **14 passed, 50 assertions**. Includes hotel walk-in service-request/boarding/reservation approval synchronization.
- `APP_TIMEZONE=UTC DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test --filter='EmailServiceWorkflowTest|ServiceRequestReadyForPickupTest|VetUxHandoffTest|VeterinaryWorkflowTest'`: **42 passed, 263 assertions**.
- `APP_TIMEZONE=UTC DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test --filter=ServiceBillingRemediationTest`: **27 passed, 97 assertions** after the hotel schedule-date fixture was changed to use `ServiceDurationService::STORE_TIMEZONE`.

### Full backend regression

Command:

```text
APP_TIMEZONE=UTC DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test
```

Result: **1,179 passed, 11 failed, 1 skipped, 5,767 assertions, 792.44 seconds**. The 11 failures were 6 Payroll, 1 Pharmacy/Confinement, 3 payslip, and 1 store-date fixture failure. The store-date fixture subsequently passed within the 27-test class run; the full suite was not rerun after that correction. The one skip is the GD-dependent image downscale case. Preserve and separately disposition the non-booking Payroll/Pharmacy/payslip failures.

An intermediate targeted run produced missing/duplicate migration-object errors in `pawesome_test`. A later serial focused class run completed with 27 passing tests. No `migrate:fresh`, manual schema repair, or working-database reset was run.

### Final selected Playwright rerun

Environment: frontend `http://127.0.0.1:3001`, API `http://127.0.0.1:8030/api`, database `pawesome_booking_audit`, Chromium, one worker, zero retries.

The exact six-file batch completed with **16 passed, 1 failed, 2 did not run, 0 flaky** in 7.1 minutes. The online hotel lifecycle failed after cashier verification: the UI's Today/ON GOING list showed zero rows for boarding #88 although the isolated DB held it as `scheduled` / `paid` and room reservation #48 as `scheduled`. The check-in action was not reached. Evidence: `browser-evidence/system-security-audit-20261108/phase12/selected-regression-final-rerun.json` and `07-boarding-checkin-tab-failure-context.md`. This final run supersedes the earlier 19-pass batch.

The individual native hotel walk-in rerun passed after the controller fix. The earlier veterinary and grooming walk-in tests passed individually, but a post-fix combined three-test rerun was not completed. All six workflows therefore remain not fully accepted.

### Frontend, syntax and build

- Vitest: **9 files / 44 tests passed**.
- `npm run build`: **passed**; dynamic/static import overlap and large-chunk warnings remain.
- `php -l` passed for the modified boarding controller and feature test/model files.
- `node --check` passed for the modified walk-in/native UI Playwright specs.
- `git diff --check` passed; line-ending warnings were emitted for existing files.

### Safety

- Browser mutations used `pawesome_booking_audit`; PHPUnit used the configured isolated test database `pawesome_test`.
- No intentional writes were made to the working `pawesome` database during this continuation.
- No production deployment or real customer email delivery was attempted.
