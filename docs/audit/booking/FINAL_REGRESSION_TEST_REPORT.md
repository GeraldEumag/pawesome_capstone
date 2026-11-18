# Final Regression Test Report

**Status:** Final regression is not green. No failing checks are silently excluded.

## Results

| Suite | Result | Details |
| --- | --- | --- |
| Full PHPUnit, corrected-timezone run | FAIL | `pawesome_test`; `APP_TIMEZONE=UTC`; 1,179 passed, 11 failed, 1 skipped, 5,767 assertions, 792.44 s. The test-only store-date fixture was corrected afterward and its class passed separately; the full suite was not rerun after that correction. |
| Focused backend regression | PASS | `APP_TIMEZONE=UTC php artisan test --filter='EmailServiceWorkflowTest\|ServiceRequestReadyForPickupTest\|VetUxHandoffTest\|VeterinaryWorkflowTest'`: 42 passed, 263 assertions. |
| Booking final audit feature test | PASS | 14 passed, 50 assertions, including atomic grooming and walk-in boarding request/reservation synchronization. |
| Service billing remediation | PASS | 27 passed, 97 assertions after correcting the test date to use the store timezone. |
| Frontend Vitest | PASS | 9 test files, 44 tests passed. |
| Production frontend build | PASS | Vite completed; dynamic-import overlap and >500 kB chunk warnings remain. |
| Selected Playwright regression batch | FAIL | Exact six-file rerun: 16 passed, 1 failed, 2 did not run, 0 flaky; 7.1 minutes. The boarding online lifecycle failed because a paid scheduled row was absent from the Today/ON GOING UI. The earlier 19-pass run is superseded. |
| Native walk-in Playwright | PASS (focused reruns) | Veterinary and grooming passed in the earlier focused run; hotel passed individually after the backend status-sync fix. A post-fix combined three-test rerun was not completed. |
| Syntax and diff checks | PASS | `node --check` on changed E2E specs and `git diff --check`. |

## Full-suite failure disposition

The corrected-timezone full backend run exposed 11 failures:

- Six Payroll tests, one Pharmacy/Confinement test and three payslip tests remain failing in unrelated worktree modules. These changes were preserved, not modified as part of the booking audit.
- One `ServiceBillingRemediationTest` fixture used app-UTC `now()` where the endpoint validates the store-local date. The fixture now uses `ServiceDurationService::STORE_TIMEZONE`; all 27 tests in that class passed afterward.
- The earlier non-UTC run's veterinary scheduling failures disappeared in the corrected-timezone focused run.
- The grooming completion-email test now exercises valid approval and `in_progress` transitions; `ready_for_pickup_at` is mass-assignable through the synchronizer. Their focused tests pass.

One intermediate targeted run reported missing/duplicate migration objects in `pawesome_test`; subsequent serial focused tests passed. No destructive reset was used. The full suite has not been rerun after the store-date fixture correction.
