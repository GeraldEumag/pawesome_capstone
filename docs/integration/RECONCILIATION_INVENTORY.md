# Reconciliation Inventory

Snapshot date: 2026-10-21
Repository root: `C:\xampp\htdocs\Pawesome_Capstone`

## Current Git state

- `main` HEAD: `249d9694c205deddf417973674db4df441b90ff6`.
- Local `origin/main` points to the same commit; ahead/behind is 0 / 0.
- No fetch was performed during this Phase 2 inventory.
- The worktree has 48 modified tracked paths, no staged paths, and 19 untracked files before adding the two Phase 2 reports below. No unmerged paths exist.
- `git diff --check` and `git diff --cached --check` passed.
- The current original worktree’s 48 tracked changed files match the isolated tested worktree byte-for-byte. The listed IDE edits are part of that same reconciled state; no additional tracked divergence was found.
- `docs/integration/` was empty when inspected. This inventory and `REPOSITORY_CLEANUP_REPORT.md` are deliberate new untracked documentation files; no source files are changed by this report.
- No commit, push, deploy, reset, clean, stash drop, patch application, test, migration, or database operation occurred while preparing this inventory.

## Stash, patch, backup, and worktree evidence

| Evidence | Verified state |
|---|---|
| Retained stash | `0b9f76a15e6f31d47d5db179b4c47aa641c2245a`, a commit whose first parent is the pre-pull `323d466cd23e7b353bd2bc4c28c684635e29060b`. It remains at `stash@{0}` and records 45 tracked files, 1,192 insertions, and 215 deletions. It was not popped or dropped. |
| Reconciliation patch | `C:\Users\ACER\AppData\Local\PawesomeIntegrationWorktrees\integration-to-original-20261020.patch`; 122,663 bytes; SHA-256 `54D9E6C1687834A7A1CABF963584A8C40385CB62996BDE9E65A536AA5691197D`. |
| Patch application state | `git apply --reverse --check` returned 0. `git apply --check` failed because the patch is already present. The patch was not reapplied. |
| Verified backup | `C:\Users\ACER\AppData\Local\PawesomeBackups\git-sync-20261020-5d90a76b7c4c4ae3a2f7a6478a8e98cf`; verification manifest is present. |
| Isolated worktree | `C:\Users\ACER\AppData\Local\PawesomeIntegrationWorktrees\pawesome-origin-main-249d969`, detached at `249d9694c205deddf417973674db4df441b90ff6`. |
| Unreachable commits | `git fsck --full --no-reflogs --unreachable` reports 24 unreachable commits. No garbage collection was run. |

## Tracked modification inventory

The 48 tracked working-tree changes are:

```text
backend/app/Http/Controllers/Api/ServiceRequestController.php
backend/app/Http/Controllers/BoardingController.php
backend/app/Http/Controllers/BoardingRoomController.php
backend/app/Http/Controllers/Customer/VeterinaryBillingController.php
backend/app/Http/Controllers/MedicalConfinementController.php
backend/app/Http/Controllers/ReceptionistRequestController.php
backend/app/Services/ServiceBillingPaymentService.php
backend/routes/api.php
backend/tests/Feature/BoardingRoomLifecycleTest.php
backend/tests/Feature/BookingSchedulingIntegrityTest.php
backend/tests/Feature/PaymentBookingChannelTest.php
backend/tests/Feature/PrivatePetPhotoTest.php
frontend/e2e/customer-add-pet-modal.spec.js
frontend/e2e/customer-bookings-board.spec.js
frontend/e2e/customer-responsive-audit.spec.js
frontend/e2e/phase9-capstone-b-demo.spec.js
frontend/e2e/receipt-pdf-regression.spec.js
frontend/e2e/receptionist-later-bookings.spec.js
frontend/src/App.css
frontend/src/components/cashier/CashierDashboard.jsx
frontend/src/components/cashier/CashierHistory.jsx
frontend/src/components/cashier/CashierPOS.css
frontend/src/components/cashier/CashierPOS.jsx
frontend/src/components/cashier/CashierPaymentVerification.jsx
frontend/src/components/cashier/CashierTransactions.jsx
frontend/src/components/cashier/components/PaymentApprovals.css
frontend/src/components/cashier/components/PaymentApprovals.jsx
frontend/src/components/customers/CustomerPayments.jsx
frontend/src/components/customers/CustomerPets.css
frontend/src/components/customers/CustomerPets.jsx
frontend/src/components/customers/HotelForm.css
frontend/src/components/customers/HotelForm.jsx
frontend/src/components/landing/Landing.css
frontend/src/components/landing/LandingPage.jsx
frontend/src/components/receptionist/ReceptionistGroomingBookings.jsx
frontend/src/components/receptionist/ReceptionistHotelBookings.jsx
frontend/src/components/receptionist/ReceptionistVeterinaryBookings.jsx
frontend/src/components/receptionist/ReceptionistWalkIns.css
frontend/src/components/receptionist/ReceptionistWalkIns.jsx
frontend/src/components/shared/Modal.jsx
frontend/src/components/shared/PaymentUploadModal.css
frontend/src/components/shared/PaymentUploadModal.jsx
frontend/src/components/veterinary/VetReceipt.css
frontend/src/components/veterinary/VetReceipt.jsx
frontend/src/hooks/useBookingViewParams.js
frontend/src/styles/theme.css
frontend/src/utils/receiptPdf.js
frontend/src/utils/receiptPrinter.js
```

These changed paths match the isolated tested worktree by SHA-256. `frontend/e2e/revision-b-confirmed-flows.spec.js` is untracked rather than part of the 48-path tracked diff.

## Untracked-file inventory

The 19 untracked files present before adding these reports are:

```text
backend/app/Services/PaymentReferenceGuard.php
docs/PAWESOME_REVISION_AUDIT.md
docs/user-manual/PAWESOME_USER_MANUAL.md
docs/user-manual/README.md
docs/user-manual/audit/documentation-gaps.md
docs/user-manual/audit/documentation-qa-report.md
docs/user-manual/audit/feature-verification-matrix.md
docs/user-manual/audit/repository-inventory.md
docs/user-manual/audit/role-permission-matrix.md
docs/user-manual/audit/route-and-page-inventory.md
docs/user-manual/audit/screenshot-register.md
docs/user-manual/audit/workflow-map.md
documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.docx
documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.md
documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.pdf
documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.docx
documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.md
documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.pdf
frontend/e2e/revision-b-confirmed-flows.spec.js
```

- Eighteen of these 19 files match the verified backup by SHA-256.
- The untracked E2E spec differs from the backup copy because the isolated version was updated to match the incoming date-filter API contract; the original copy remains in the backup, and the current original version matches the isolated tested version.
- The user manuals, audit report, and evaluator documents are intentional project assets; no cleanup is recommended.

## Ignored/local assets

- `backend/.env` exists, is ignored, and matches the backup hash. Its contents were not read or disclosed.
- `backend/storage/app` contains 328 files totaling 41,000,507 bytes. All paths and SHA-256 hashes match the backup. The directory includes image and PDF files and may contain uploaded proof/photo evidence; preserve it and keep it out of Git.
- `backend/vendor`, `frontend/node_modules`, and `frontend/build` exist as ignored/generated paths. No cleanup was attempted.
- `frontend/test-results` is tracked by `origin/main`; it has no local diff.
- The root `.gitignore` excludes `backend/storage/app/*`, `frontend/build/`, and `frontend/node_modules/`. No `.gitignore` change is proposed.
- The isolated `docs/GIT_SYNC_AND_REGRESSION_REPORT.md` is not in the original worktree. It predates the payroll migration-target discovery and is not treated as authoritative for that incident.

## Thirteen overlapping paths and reconciliation decisions

All 13 original/remote overlap paths were reviewed. Eleven applied cleanly in the isolated reconciliation; two had manual hunk conflicts. Current original contents match the isolated tested contents.

| Path | Decision / evidence |
|---|---|
| `backend/app/Http/Controllers/Api/ServiceRequestController.php` | Retain upstream store-hour, holiday, workflow-stage, and ready-for-pickup behavior alongside the Revision B payment-reference guard. Current hash matches isolated. |
| `backend/app/Http/Controllers/BoardingController.php` | Retain upstream holiday/store-hour and workflow stages with the Revision B room concurrency/approval and payment-reference protections. Current hash matches isolated. |
| `backend/app/Http/Controllers/ReceptionistRequestController.php` | Retain upstream workflow stages, `store_today`, and pickup state while preserving walk-in channel handling. Current hash matches isolated. |
| `backend/routes/api.php` | Retain upstream customer-bookings, manager people/day-off, and holiday routes plus the local public room route. Current hash matches isolated. |
| `frontend/e2e/customer-responsive-audit.spec.js` | Retain unified-bookings API mocks and Revision B room-selection/accessibility coverage. Current hash matches isolated. |
| `frontend/src/components/cashier/CashierTransactions.jsx` | Retain responsive table wrapper and awaited receipt-PDF handling. Current hash matches isolated. |
| `frontend/src/components/customers/CustomerPayments.jsx` | Retain authenticated proof viewing and asynchronous PDF handling. Current hash matches isolated. |
| `frontend/src/components/customers/HotelForm.css` | Manual conflict: retain Revision B readable dark text and room badge contrast with upstream design tokens. Current hash matches isolated. |
| `frontend/src/components/customers/HotelForm.jsx` | Retain unified bookings, holiday dates, vaccination/care-log behavior, and accessible room selection. Current hash matches isolated. |
| `frontend/src/components/receptionist/ReceptionistGroomingBookings.jsx` | Retain shared stage/date filters and pickup flow with approval confirmation/idempotency safeguards. Current hash matches isolated. |
| `frontend/src/components/receptionist/ReceptionistHotelBookings.jsx` | Retain shared stage/date filters and vaccination/approval safeguards. Current hash matches isolated. |
| `frontend/src/components/receptionist/ReceptionistVeterinaryBookings.jsx` | Retain shared stage/date filters and explicit holiday override flow with approval safeguards. Current hash matches isolated. |
| `frontend/src/components/shared/Modal.jsx` | Manual conflict: keep title association only for rendered titles and preserve focus-stable Escape handling and contextual close labels. Current hash matches isolated. |

Additional file decisions and test corrections are recorded in the isolated historical report, but its payroll-database section is stale and must not be reused as the current incident record.

## Payroll/database incident — unresolved

The failed payroll probe used mismatched database names:

- Artisan’s captured runtime identity was `pawesome_payroll_race_test_20261020` on `Pascua:3306`.
- PHPUnit’s custom config forced `pawesome_payroll_race_probe_20261020_a6f41e`.
- The migration output reports 170 migrations completed on the former. The PHPUnit probe passed three identity assertions on the latter, then failed because `users` did not exist; it never reached `markAsPaid()`.
- A read-only check shows the race-test schema currently has 73 tables / 170 migration rows, 0 users/payrolls/salary loans/employees, 15 settings, 17 holidays, no `work_schedules`, and an empty `employee_day_offs` table.
- No pre-migration dump or row snapshot exists for that schema. The migration log shows the `up()` that drops `work_schedules` ran; it is unknown whether any pre-existing rows or customized settings were affected.
- MariaDB binary logging and the general query log are off. The error log has no matching schema/migration entries. The verified backup has dumps only for `pawesome` and `pawesome_test`.
- No restore, rollback, new database, migration, or test rerun was performed in this Phase 2 inventory.

## Remaining uncertainties and phase limits

- The pre-migration contents of `pawesome_payroll_race_test_20261020` cannot be reconstructed from the current snapshot; treat it as potentially modified.
- The payroll settlement concurrency condition remains untested; do not mark it fixed or passed.
- No secret scan was run in this phase. `.env` and the upload directory were not opened.
- No cleanup, `.gitignore` edit, staging, commit, push, deployment, test, migration, or database write was performed.
