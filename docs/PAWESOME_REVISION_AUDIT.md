# Pawesome Revision B Audit

Audit baseline: 2026-10-20. Worktree started on `main` at `323d466`; the existing untracked `docs/user-manual/` and evaluator/user-guide files under `documentation/` are preserved.

## Scope and current verification

- OCR runtime was explicitly deferred by the user. GCash/Maya proof upload, manual reference entry, and cashier verification remain; receipt images are not used as payment authentication.
- No database migration or new third-party dependency was added.
- Baseline frontend production build passed (Vite 6.4.3; existing chunk/dynamic-import warnings). Baseline `BookingSchedulingIntegrityTest` passed (5 tests / 19 assertions).
- Post-change full backend suite passed: 606 tests / 2,967 assertions. PHP lint passed for every changed PHP source/test file.
- Post-change frontend production build passed with existing chunk/dynamic-import warnings (the output was directed to a new temporary directory, not the existing `frontend/build`).
- Focused browser tests passed: 14 Playwright tests for Add Pet, receipts, landing rooms, walk-in listing, approval confirmation, and ongoing booking detail; an additional 5-test run passed the responsive landing/walk-in/approval/ongoing screens, and a separate customer hotel room-selection test passed. UI tests used mocked API responses (`E2E_LIVE=false`); backend feature tests against the dedicated `pawesome_test` database exercised persistence/API behavior.
- Phase 9 local live-stack run passed 9/9 Playwright journeys and 18/18 database/API correlation checks against the dedicated `pawesome_test` database, with zero browser console errors and zero page-level API failures captured by the test monitor. This is local integration evidence, not deployment/production evidence.

## Findings and changes

| Remark | Module / role | Severity | Evidence-backed finding | Change / verification | Status |
|---|---|---:|---|---|---|
| GCash reference extraction | Customer payment upload; cashier verification | Medium (OCR deferred) | `PaymentUploadModal` accepts receipt files and manual reference input, but no OCR runtime existed. User selected to defer dependency/service integration. | Preserved manual reference entry and cashier verification; no OCR dependency/API was added. | BLOCKED — OCR was explicitly deferred by the user; manual workflow remains available |
| Duplicate payment references and payment integrity | Customer proof endpoints; cashier | High | Proof routes stored references on different payable tables without a cross-table uniqueness check; cashier verification remains separately authorized and is not triggered by upload. | Added `PaymentReferenceGuard` using MySQL advisory locks plus normalized scans over existing reference-bearing tables, excluding the same booking/linked payment and same veterinary invoice version. Wired into service request, boarding, medical-confinement, and veterinary billing proof submissions. Feature tests and live J3/J5/J9 integrations reused one submitted reference across all four flows; each duplicate returned 422 and read-only DB probes confirmed rejected rows remained unpaid/proof-free. A simultaneous proof-upload race was not exercised. | PASS — all four sequential duplicate-reference paths verified locally; simultaneous proof-upload race not tested |
| Customer Add Pet picture and full form | Customer | Medium | The Add Pet file input relied on `accept`; shared Modal lacked a programmatic dialog label and could close when Escape was intended for the date picker. A loading ref was initialized but unused for same-tick duplicate submissions. | Added JPG/PNG/WebP and 5 MB client checks, accessible errors, synchronous submit guard, modal labeling, and capture-phase Escape handling. Add Pet Playwright 6/6 passed; private-photo backend authorization/storage tests passed. The Phase 9 live suite did not perform a browser image upload through to the database. | NOT TESTED — live browser-to-database pet-photo journey remains unverified; backend and mocked UI tests passed separately |
| Receptionist walk-in list visibility | Receptionist; cashier | High | The Walk-ins page rendered a fixed empty state; request formatting omitted persisted `booking_channel`. The store endpoint already persisted walk-ins transactionally. | Exposed the booking channel and implemented a persisted today list. Phase 9 J4 created a real test walk-in, verified the receptionist page showed the saved pet/customer/status, approved it, then verified cashier queue visibility, settlement, and database state. | PASS — local live API/database/browser workflow |
| Ongoing receptionist booking details | Receptionist | High | Active hotel, veterinary, and grooming pages use distinct persisted list models and local detail panels. No incorrect identifier was found; boarding API supports `in_care`. | Backend feature tests cover ongoing boarding list/detail authorization; mocked UI tests open hotel/veterinary/grooming detail panels. The live Phase 9 suite did not navigate an `in_care` record through each UI detail panel. | NOT TESTED — live persisted ongoing-detail UI journey remains unverified; API and mocked UI tests passed separately |
| Date/status/search filter preservation | Customer reports/history, receptionist lists, cashier transactions | Medium (not reproduced) | The active `BookingTracker` has status-only tabs; “Today” is rendered as a countdown label, not a date filter. The shared `ReportFilters` component has no active consumers. The Admin Customer Report independently retains date/status in one filter object, but its date controls have no “Today” preset. No matching active date-plus-status sequence was identified. | Read-only route/component audit found no concrete control matching the reported sequence. No speculative filter change was made. The exact route and action sequence from the affected UI are still needed for a faithful reproduction. | NOT TESTED — specific affected page/steps not identified |
| Public hotel landing and selected-room affordance | Public landing; customer boarding | Medium | Landing page had no room section. `boarding_rooms` has no photo column. Customer HotelForm used actual room IDs and availability but lacked a non-color-only selected label. | Added public room data and landing cards with actual fields, honest missing-photo state, and booking CTA; selected cards now expose `aria-pressed` and visible text. Backend room tests and mocked room-selection UI tests pass. Phase 9 exercised live room booking/availability via API using a one-unit test fixture created from an existing room template/rate; it did not test landing-to-booking selection in one live browser flow. | NOT TESTED — live landing-to-booking UI integration remains unverified; room photos are unavailable in current schema |
| Approval confirmation | Receptionist hotel/veterinary/grooming | Medium | Active hotel/veterinary handlers lacked confirmation; grooming wording was inconsistent. Boarding approval originally rechecked state outside the transaction, permitting concurrent stale requests. | Added consistent confirmation UI and a locked pending-state transition. Phase 9 tested concurrent boarding approval API requests: exactly one transition succeeded and the duplicate was rejected; mocked browser test confirms Cancel is inert and Confirm sends once. | NOT TESTED — live browser confirmation-to-API flow not exercised; concurrent backend transition and mocked dialog behavior passed separately |
| Pawesome logo on receipts | Cashier, customer, veterinary | Low | Receipt previews/PDF/print utilities omitted the official logo. | Added `pawesome.jpg` to PDF, browser-print HTML, POS/approval previews, and veterinary receipt. PDF/browser component tests passed. No physical printer was available; raw ESC/POS output remains text-only. | BLOCKED — browser/PDF paths tested, physical thermal logo output requires target printer/QZ validation |
| Pastel-theme contrast | Shared and touched modules | Low | Some placeholder/link/pink-button/focus colors had weak contrast. | Updated shared and scoped colors. Selected calculated ratios: muted text 7.58:1, placeholder 4.76:1, link 7.88:1, dark text on primary pink 5.11:1. Broad manual contrast review for every role/device was not performed. | NOT TESTED — selected token ratios checked; complete visual audit remains |

## Phase 9 staged execution evidence

### Stage A — read-only reconnaissance and database identity

- Worktree was on branch `main`, baseline commit `323d466`; the previous Revision B changes were present before this audit. Existing untracked `docs/user-manual/` and evaluator/user-guide files were preserved.
- `backend/phpunit.xml` pins `DB_CONNECTION=mysql`, host `127.0.0.1`, port `3306`, and database `pawesome_test`; `.env.testing` SQLite values are overridden.
- Read-only MySQL identity query `SELECT DATABASE(), @@hostname, @@port` using `-D pawesome_test` returned `pawesome_test`, local host `Pascua`, port `3306`. With the same explicit environment, `php artisan tinker --execute="echo DB::connection()->getDatabaseName();"` returned `pawesome_test`. The separate `pawesome` schema exists; no application/test write was directed to it.
- Before fixture setup, aggregate counts for `users`, `customers`, `pets`, `services`, `boarding_rooms`, `hotel_rooms`, `inventory_items`, and `sales` in `pawesome_test` were all zero; the migrations table contained 165 migrations.
- Read-only inspection of `docs/DEPLOYMENT.md`, `backend/railway.json`, `frontend/vercel.json`, and CI config confirmed Railway/Vercel targets and that Railway pre-deploy runs migrations. No provider account, deployment, production environment, or real domain was accessed.

### Stage B — local reproduction and workflow results

- Seeded only the previously empty `pawesome_test` database with `php artisan db:seed --class=DatabaseSeeder`, with DB environment explicitly set to `pawesome_test`, `MAIL_MAILER=array`, and `QUEUE_CONNECTION=sync`. No reset, migration reset, external email, or provider call was run. The test database now retains demo seed records and synthetic Phase 9 test records; it was not cleaned/reset.
- Started a local Laravel API at `127.0.0.1:8001` and Vite at `127.0.0.1:3001`, with the API process and E2E tinker probes explicitly pointed to `pawesome_test`. Both `/api/health` and the frontend root returned 200. The servers were stopped after testing.
- Initial live attempts reproduced test-harness assumptions, not application failures: J3 targeted nonexistent `.pa-modal-footer` instead of the rendered `.pw-modal-footer`; J4 hard-coded a time that collided with prior test data and initially compared the customer label case-sensitively; J5 hard-coded room ID `6` despite seeded IDs starting at 125 and assumed a multi-unit room would reject its second booking; the Phase 9 result object also omitted `createdRecords`. These were corrected only in the test spec. J5 now creates a one-unit test room through the receptionist API using an existing room template and rate; it is a test-only record in `pawesome_test`, not a product/deployment change.
- Reproduction sequence and observed evidence:

| Flow | Route/role and action | Observed result and evidence |
|---|---|---|
| Customer booking and receptionist approval | Customer `POST /api/customer/requests` through `/customer/grooming`; receptionist approves the resulting request | Customer request persisted as online/pending, then linked grooming record became approved. Wrong-role approval was rejected. J1/J2 correlated DB and API results PASS. |
| Proof upload, duplicate, cashier verification | Customer `/customer/grooming` uploads a test PNG and manual reference; repeat proof POST for the same pending row; cashier opens `/cashier/payment-verification` and confirms GCash verification | Upload stayed pending with proof; duplicate POST returned 422 without marking paid; cashier row showed submitted reference; verify updated service/linked grooming to paid and receipt totals reconciled. J3 correlations PASS. |
| Walk-in visibility and settlement | Receptionist `POST /api/receptionist/walk-ins`; open `/receptionist/walk-ins`; approve; cashier `/cashier/payment-verification` collects cash | Persisted walk-in appeared in receptionist list, remained unavailable to cashier before approval, then became collectible and settled as cash. DB/API/UI correlation checks PASS. |
| Boarding room and concurrent approval | Test receptionist creates one-unit test room via API from a seeded room template; customer submits booking; receptionist verifies card; two approval POSTs run concurrently; reject afterward | First booking persisted to the selected room, over-capacity booking returned 422, exactly one approval succeeded while the duplicate returned 422, and rejection released the reservation. J5 DB/API correlations PASS. |
| Inventory, reports, RBAC | Admin submits an over-stock decrement; manager loads reports; customer probes staff-only routes | Invalid adjustment returned 422 with stock unchanged; report reconciliation and role-denial checks passed. J6-J8 correlations PASS. |
| Cross-flow duplicate references | Customer has already submitted a service-request GCash reference; submit that reference against a new boarding, confinement, and veterinary invoice | All three secondary submissions returned 422; read-only DB probes confirmed no proof was stored on the rejected rows and no veterinary payment request was created. J3/J5/J9 correlations PASS. |

- Final live run: `E2E_BASE_URL=http://127.0.0.1:3001`, `E2E_API_URL=http://127.0.0.1:8001/api`, `E2E_LIVE=true`, `E2E_EVIDENCE_DIR=C:\Users\ACER\AppData\Local\Temp\pawesome-phase9-evidence-36438f87d50a4b19b14de8f2f1890200`, `DB_DATABASE=pawesome_test`, and `LARAVEL_STORAGE_PATH=C:\Users\ACER\AppData\Local\Temp\pawesome-phase9-storage-70fcb33b4d6b47c4a2eeb9547e4daf2d`; command: `npx playwright test e2e/phase9-capstone-b-demo.spec.js --project=chromium --workers=1 --output C:\Users\ACER\AppData\Local\Temp\pawesome-phase9-results-36438f87d50a4b19b14de8f2f1890200 --reporter=list`.
- Actual result: **9/9 journeys passed**, **18/18 correlation checks passed**, `consoleErrors=0`, `httpFailures=0` in the page-level monitor. The live run used real local API requests and read-only database probes for customer booking, receptionist approval, proof upload/duplicate proof rejection, cashier verification and receipt totals, walk-in visibility and settlement, POS sale/void, room reservation/conflict/release, concurrent boarding approval (one success, one 422), duplicate-reference rejection across all four proof flows, inventory rejection, reporting persistence, and authorization checks. The explicit 401/403/422 security probes are asserted separately through the Playwright API request context.
- Mail was configured to `array`; the run did not send real email. The final run used temporary storage. Earlier interim Phase 9 attempts used the default local private disk; any synthetic test uploads from those runs were left in place rather than deleted.

### Stage C — targeted remediation

- No application-code defect was reproduced during this Phase 9 audit. Targeted edits were limited to correcting the Phase 9 test harness assumptions above and adding assertions for live walk-in-list visibility, duplicate proof submissions across all four flows, and concurrent duplicate approval.
- Existing Revision B app changes remain as recorded in the findings table; no migrations, dependencies, application routes, or production settings were changed during this Phase 9 audit. Synthetic customer/booking/payment/inventory fixtures were created only in `pawesome_test` and were not deleted.

### Stage D — verification and evidence boundaries

- Full backend suite previously passed on `pawesome_test`: `php artisan test` — **606 passed, 2,967 assertions**. This was run before Phase 9 seeding; it was not rerun afterward to avoid the test suite altering the retained integration fixtures.
- Frontend build passed to an isolated temporary output directory; existing Vite dynamic-import and large-chunk warnings remain. Focused mock-driven Playwright runs and PHP syntax checks are recorded above.
- Phase 9 screenshots and JSON evidence were written under the temporary evidence directory stated above, not into the repository. The API/browser phase was live against the dedicated local test DB; it was not a deployed-environment run.

#### Verification command ledger

| Check | Command and environment | Actual result |
|---|---|---|
| Focused backend regressions | From `backend/`: `php artisan test --filter='PaymentBookingChannelTest|PrivatePetPhotoTest|BookingSchedulingIntegrityTest|BoardingRoomLifecycleTest|VeterinaryBillingPaymentFlowTest'` on MySQL `pawesome_test` | 52 passed, 300 assertions |
| Full backend suite | From `backend/`: `php artisan test` on MySQL `pawesome_test` | 606 passed, 2,967 assertions; before Phase 9 fixture seeding |
| PHP syntax | `php -l` for each changed PHP source and feature-test file | No syntax errors |
| Frontend build | From `frontend/`: `npm run build -- --outDir C:\Users\ACER\AppData\Local\Temp\pawesome-build-finalcheck-f9c19b288aa94cb6bf1b4822fa11c287` | Passed; pre-existing dynamic-import and >500 kB chunk warnings |
| Focused mock/browser suite | From `frontend/`: `npx playwright test e2e/customer-add-pet-modal.spec.js e2e/receipt-pdf-regression.spec.js e2e/revision-b-confirmed-flows.spec.js --project=chromium --workers=2 --output C:\Users\ACER\AppData\Local\Temp\pawesome-e2e-final-1e937d3db7e549dc84354e8d31f8c484 --reporter=list` with `E2E_LIVE=false` | 14 passed |
| Local live Phase 9 workflows | From `frontend/`, with `E2E_BASE_URL=http://127.0.0.1:3001`, `E2E_API_URL=http://127.0.0.1:8001/api`, `DB_DATABASE=pawesome_test`, `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`, `E2E_LIVE=true`, `LARAVEL_STORAGE_PATH` and `E2E_EVIDENCE_DIR` set to isolated temporary paths: `npx playwright test e2e/phase9-capstone-b-demo.spec.js --project=chromium --workers=1 --output C:\Users\ACER\AppData\Local\Temp\pawesome-phase9-results-36438f87d50a4b19b14de8f2f1890200 --reporter=list` | 9 passed; all 18 recorded scenario/database/API correlations PASS; no page-level console/API failures captured; separate security probes passed |
| Final diff hygiene | `git diff --check` | Passed; no whitespace errors |

### Stage E — release decision

**NOT READY for production.** The local Phase 9 workflow passed, but no deployed environment was tested. Live browser-to-database Add Pet image upload, landing-room selection through the browser, ongoing booking detail panels, actual transactional-email delivery, complete cross-role/device visual review, and physical thermal-printer logo output remain unverified. The reported date/status filter reset also remains NOT TESTED until the exact affected route and reproduction sequence are identified.

## Changed files so far

- `docs/PAWESOME_REVISION_AUDIT.md`
- `backend/app/Services/PaymentReferenceGuard.php`
- `backend/app/Http/Controllers/Api/ServiceRequestController.php`
- `backend/app/Http/Controllers/BoardingController.php` (proof guard and serialized approval state transition)
- `backend/app/Http/Controllers/MedicalConfinementController.php`
- `backend/app/Http/Controllers/Customer/VeterinaryBillingController.php`
- `backend/app/Services/ServiceBillingPaymentService.php`
- `backend/app/Http/Controllers/ReceptionistRequestController.php`
- `backend/app/Http/Controllers/BoardingRoomController.php`
- `backend/routes/api.php`
- `backend/tests/Feature/PaymentBookingChannelTest.php`
- `backend/tests/Feature/PrivatePetPhotoTest.php`
- `backend/tests/Feature/BookingSchedulingIntegrityTest.php`
- `backend/tests/Feature/BoardingRoomLifecycleTest.php`
- `frontend/src/components/shared/PaymentUploadModal.jsx`
- `frontend/src/components/shared/PaymentUploadModal.css`
- `frontend/src/components/shared/Modal.jsx`
- `frontend/src/styles/theme.css`
- `frontend/src/App.css`
- `frontend/src/components/customers/CustomerPayments.jsx`
- `frontend/src/components/customers/CustomerPets.jsx`
- `frontend/src/components/customers/CustomerPets.css`
- `frontend/src/components/customers/HotelForm.jsx`
- `frontend/src/components/customers/HotelForm.css`
- `frontend/src/components/landing/LandingPage.jsx`
- `frontend/src/components/landing/Landing.css`
- `frontend/src/components/receptionist/ReceptionistWalkIns.jsx`
- `frontend/src/components/receptionist/ReceptionistWalkIns.css`
- `frontend/src/components/receptionist/ReceptionistHotelBookings.jsx`
- `frontend/src/components/receptionist/ReceptionistVeterinaryBookings.jsx`
- `frontend/src/components/receptionist/ReceptionistGroomingBookings.jsx`
- `frontend/src/components/veterinary/VetReceipt.jsx`
- `frontend/src/components/veterinary/VetReceipt.css`
- `frontend/src/components/cashier/CashierTransactions.jsx`
- `frontend/src/components/cashier/CashierHistory.jsx`
- `frontend/src/components/cashier/CashierDashboard.jsx`
- `frontend/src/components/cashier/CashierPaymentVerification.jsx`
- `frontend/src/components/cashier/CashierPOS.jsx`
- `frontend/src/components/cashier/CashierPOS.css`
- `frontend/src/components/cashier/components/PaymentApprovals.jsx`
- `frontend/src/components/cashier/components/PaymentApprovals.css`
- `frontend/src/utils/receiptPdf.js`
- `frontend/src/utils/receiptPrinter.js`
- `frontend/e2e/customer-add-pet-modal.spec.js`
- `frontend/e2e/customer-responsive-audit.spec.js`
- `frontend/e2e/receipt-pdf-regression.spec.js`
- `frontend/e2e/revision-b-confirmed-flows.spec.js`
- `frontend/e2e/phase9-capstone-b-demo.spec.js`

## Remaining audit/verification work

1. Audit concrete date/status/search/page controls identified in the running UI; add a focused regression only for a reproduced reset. The current active pages did not expose a paired date/status reset during code inspection.
2. Run responsive and visual contrast checks across all requested screens; current Playwright checks cover Add Pet and hotel room selection, not every target role/device.
3. Validate the raw ESC/POS logo requirement on the actual supported QZ/printer hardware before claiming thermal logo output.
4. Confirm local/deployed storage and room-photo configuration when real room images exist; the current boarding-room schema has no photo column.
