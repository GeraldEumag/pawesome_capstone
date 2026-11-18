# Final Remediation and Defense Acceptance Gate

**Run date:** 2026-11-19  
**Recommendation:** **CONDITIONAL ACCEPTANCE**

## Checkpoint and data boundary

- Pre-implementation checkpoint: commit `754f2d2` (`checkpoint: booking audit before final remediation`). Only booking code/tests and `docs/audit/booking/` were included; Payroll changes were excluded.
- All live mutation probes in this run used the already verified isolated `pawesome_booking_audit` clone through API proxy `:8030` and its dedicated worker pool. No new live test was sent to the working `pawesome` database.
- The requested `pawesome_e2e_audit` database was inspected read-only. It has pending migrations, including booking status/email schema, ward-bed seeding, and a Philippine holiday-calendar update. They were not applied because that would change unrelated audit data; no reset, truncate, or delete was run. The test harness therefore accepts the verified isolated clone name as well as `pawesome_e2e_audit`.
- The generated Playwright evidence files under `browser-evidence/` were refreshed by the tests. Existing operational/Payroll/holiday/attendance worktree changes were left untouched.

## RES-001: grooming atomicity

The dedicated grooming status endpoint and the receptionist service-request status endpoint previously committed `service_requests` and `groomings` with separate saves. A failure between saves could leave their lifecycle states inconsistent.

Both paths now use `GroomingStatusSynchronizer`, which opens one `DB::transaction`, locks the applicable rows, checks the status transition against the locked state, writes the request first, and then writes the execution row. Both models use Laravel's default connection. A linked request and grooming row therefore commit together; an unlinked record is updated in a transaction without fabricating its counterpart. Existing authorization, payment/completion gates, response shapes, and notifications remain in their original paths.

`BookingFinalAuditTest` injects deterministic model-event failures:

- Before the first database update: the request `updating` event throws; both rows remain `approved`.
- After the first update and before the grooming update: the grooming `updating` event throws; the transaction rolls back the already-issued request update and both rows remain `approved`.
- Both failure points are exercised through both status endpoints.
- Successful linked synchronization, unlinked request status changes, unlinked execution-record status changes, invalid transitions, and payment-gated completion are covered.

**Result:** `BookingFinalAuditTest` and `ReceptionistCheckInGateTest`: **24 passed, 74 assertions**. The combined relevant booking/payment/report run passed **77 tests, 328 assertions**; see `BOOKING_TEST_RESULTS.md`.

## Playwright failure investigations

### A. Online counter verification

The spec appended `/api` to `E2E_API_URL`, which was already configured with `/api`; its pet and booking requests went to `/api/api/...` and failed before reaching the workflow. The spec now normalizes the base URL. The online booking remains excluded from cashier collection and the API still rejects a manual cash settlement with 422.

**Result:** the online counter-gating browser test passed in the corrected run.

### B. Walk-in grooming slot fixture

This had the same duplicated `/api` path. Availability requests were non-2xx, were skipped by the fixture loop, and therefore falsely appeared as 90 days of exhausted grooming capacity. The normalized URL now reaches the real availability endpoint; no availability rule was bypassed.

**Result:** the walk-in counter-collection browser test passed in the corrected run.

### C. Customer bookings URL/date filter

The initial failure was a 30-second wait for the UI's successful-update timestamp while the board was still loading. The live customer-bookings API took about 12 seconds in a direct request, and browser page hydration plus reload caused a retry to take about 20 seconds. The test also did not distinguish a visible API error from an in-flight request.

The test helper now waits for either a completed success or an explicit error (which fails the assertion), rather than silently waiting only for the timestamp. The URL round-trip and tablet cases have a 120-second test budget, reflecting the measured multi-request local worker-pool latency; business assertions were retained.

**Result:** URL round-trip and tablet cases passed in a focused rerun (**2 passed, 58.8 seconds**). The receptionist-change propagation case also passed independently (**1 passed, 44.0 seconds**).

## Previously skipped and unexecuted tests

The six earlier skips were the three `phase12-boarding-workflow` tests and three `phase12-veterinary-workflow` tests. Their guards required the hard-coded database name `pawesome_e2e_audit` and API port `8001`, even though the verified isolated stack used `pawesome_booking_audit` and `:8030`. The guards and direct-SQL fixtures now use an allowlist of isolated database names and the environment's database/API endpoint. No skip was counted as a pass.

The three boarding cases were enabled. The vaccination/payment/check-in lifecycle still fails as described below; the negative-prerequisite/ownership test and concurrent-room race test passed in a focused rerun (**2 passed, 27.9 seconds**).

The three veterinary cases were enabled. The online lifecycle passed in the selected run. The role-denial case initially failed because the audit clone had no `vettech@example.com` account; a test-only fixture now creates that role only in the configured audit database, and the test passed in a focused rerun (**1 passed, 13.9 seconds**). The concurrent-completion case exposed the backend race described below and passed after the fix (**1 passed, 5.9 seconds**).

The earlier serial-suite failures prevented later tests from starting. In the corrected/targeted runs, booking-board filter-change, phone-layout, tablet, and receptionist-change cases passed (some on retry or focused rerun). The two boarding cases that did not run after the lifecycle failure have since passed individually. The selected suite was not rerun as one final all-green batch, and the boarding lifecycle failure remains open.

## Additional reproduced defect: concurrent veterinary completion

The enabled veterinary race test showed that two concurrent completion requests could both pass a status check performed before the transaction and both return 200. The controller now reloads the appointment with `lockForUpdate()` inside the transaction and rechecks the active-consultation state and veterinarian assignment before billing or status writes. One request succeeds and the other returns 422 after observing the committed terminal state.

**Regression:** the Playwright race test now asserts the response pair `[200, 422]`, final lifecycle state, and veterinary attribution; it passed.

## Updated browser results

Selected-suite command:

```text
E2E_LIVE=true E2E_BASE_URL=http://127.0.0.1:3001 E2E_API_URL=http://127.0.0.1:8030/api E2E_AUDIT_DATABASE=pawesome_booking_audit npx playwright test e2e/booking-channel-gating.spec.js e2e/customer-bookings-board.spec.js e2e/phase12-boarding-workflow.spec.js e2e/phase12-veterinary-workflow.spec.js e2e/receptionist-room-assignment.spec.js e2e/receptionist-booking-order.spec.js --project=chromium --workers=1 --reporter=list
```

First corrected selected run: **11 passed, 4 failed, 1 flaky, 3 did not run**. The original channel-gating failures passed after URL normalization. The customer-board URL test was flaky and passed on retry. The enabled veterinary lifecycle passed; vet-tech setup and veterinary concurrency were then fixed and each passed in focused reruns. The boarding lifecycle remained failing.

The boarding lifecycle retry still has two unresolved browser symptoms: one attempt waited for a vaccination-verification response that did not arrive after the UI click; the retry could not find the scheduled booking in the customer-date receptionist queue. The negative hotel gates and room race pass, but this does not prove the full online boarding browser lifecycle. A final all-six-spec rerun was not completed.

## Six-workflow acceptance matrix

| Required workflow | Existing evidence | Browser acceptance |
| --- | --- | --- |
| Veterinary online | Customer booking UI + consultation lifecycle passed; API/PHPUnit status, payment, and authorization checks passed | Partial pass |
| Veterinary walk-in | Authorized receptionist API/live and backend evidence; no browser walk-in lifecycle executed in this run | Not fully verified |
| Hotel online | Capacity, vaccination, payment, room, and lifecycle API/backend checks passed; native boarding Playwright lifecycle failed | Conditional |
| Hotel walk-in | Isolated live create/approve/cash/check-in/care-log/checkout probe and reservation-release regression passed | No full browser walk-in lifecycle |
| Grooming online | Online booking/cashier-gating browser test passed; API/payment/lifecycle regressions passed | Partial pass; customer form lifecycle not fully browser-driven |
| Grooming walk-in | Walk-in creation/cashier UI/browser test passed; online/walk-in channel/payment backend tests passed | Partial pass; full receptionist UI lifecycle not fully covered |

The six paths have meaningful backend/live evidence, but this is not sufficient to claim complete customer-to-staff browser acceptance for every channel.

## Regression and build

- Booking, grooming, check-in, payment-channel, reporting, and manager reconciliation PHPUnit command: **77 passed, 328 assertions**.
- Grooming atomicity + check-in focused command: **24 passed, 74 assertions**.
- Sales report date-filter tests passed within `ReportsTest`; payment and role authorization cases passed within the targeted run.
- `npm run build`: **PASS**; Vite retained existing dynamic/static import and large-chunk warnings.
- Full backend suite, frontend unit suite, and all-six-flow final browser run: **not executed**.

## Final recommendation

**CONDITIONAL ACCEPTANCE.** RES-001 is closed with deterministic rollback evidence, the concurrent veterinary completion race is fixed and regressed, the three original Playwright failures were traced to harness/latency issues and have focused passing evidence, and the Sales report regression remains green.

Do not upgrade to unconditional acceptance until the native online boarding browser lifecycle is repaired and green, the final selected browser suite is rerun without unresolved failures, and all six channel/workflow paths have sufficiently complete browser evidence. The exact requested `pawesome_e2e_audit` database was not mutated because its pending migrations include unrelated changes; prepare/approve that clone before claiming acceptance against that named environment.
