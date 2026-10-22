# Pawesome System Audit — Baseline & Coverage Report

**Audit date:** 2026-10-22
**Branch:** `main` (ahead 2 of `origin/main` — commits `0b4393b`, `c6f1a90`; no push)
**Environment:** local dev (Windows/XAMPP), `APP_ENV=local`, `APP_DEBUG=true`, DB `pawesome`
**Working tree at audit start:** 49 modified + 12 untracked pre-existing WIP entries — all preserved, none audited as audit work unless individually verified.

## Phase 0 — Repository baseline

| Item | Value |
|---|---|
| Backend | Laravel 12.69.2, PHP 8.2.12, Sanctum ^4.3 |
| Frontend | React 18.3, React Router 7, Vite 6.4 |
| Database | MySQL (XAMPP), `pawesome` (dev) / `pawesome_test` (CI-parity test) |
| API surface | 667 registered routes (662 `/api`, sanctum, storage, `/up`) |
| Models / controllers | 60 models, 79 controllers, 7 middleware, 7 mailables, 1 job + 1 notification class |
| Schema | 73 tables, 172 migrations — all `Ran` |
| Tests | 64 Feature/Unit test files; 71 Playwright specs |
| Mailer | `MAIL_MAILER=smtp`, `QUEUE_CONNECTION=sync` |

## Phase 2 — Baseline results (executed)

| Command | Result |
|---|---|
| `DB_DATABASE=pawesome_test php artisan test` | **655 passed, 0 failed** — 3,162 assertions, 150 s |
| `npm run build` (frontend) | **PASS** — 2,184 modules, 40 s; warnings only (chunk size; mixed static/dynamic imports — P3 cosmetic) |

## Coverage map — required audit phases vs. existing evidence

| Audit area | Existing verified evidence | Status |
|---|---|---|
| Authn/authz, role matrix, cross-role denial | `AuthorizationMatrixTest`, `CustomerDataIsolationTest`, `EnsureRole`/`ApiTokenAuth` middleware, `docs/RBAC_PERMISSION_MATRIX.md`, chain3 gate tests | COVERED by tests |
| Email lifecycle | `EmailAuthFlowTest`, `EmailDeliveryOutboxTest`, `EmailServiceWorkflowTest`, `EmailStructuredContentTest`, `EmailPreferencesAndTemplatesTest`, `EmailMailableSecurityTest`, `docs/NOTIFICATION_MATRIX.md` | COVERED (dispatch→outbox→provider-accept); **mailbox delivery still unproven — needs test inbox** |
| Payments/POS/billing integrity | `ServiceBillingRemediationTest` (33 cases), `TransactionAtomicityTest`-style coverage, `docs/TRANSACTION_ATOMICITY.md`, void/refund/settlement tests | COVERED by tests |
| Inventory stock integrity | `DatabaseIntegrityTest`, stock-adjust/batch/disposal tests, `inventory:reconcile-stock` command, `docs/XLSX_STORAGE_RISK_AUDIT.md` | COVERED by tests |
| Booking/vet/grooming/boarding lifecycles | `VeterinaryWorkflowTest` (16), `BookingSchedulingIntegrityTest`, `BookingWorkflowStageTest`, `BoardingRoomLifecycleTest`, `VetCancellationReasonTest` | COVERED by tests |
| Soft-delete/retention | `SoftDeleteRetentionTest` (11), `docs/DATA_RETENTION_SOFT_DELETES.md` | COVERED by tests |
| API contracts | `ApiResponseEnvelopeTest`, `NormalizeApiResponse` middleware, `docs/API_RESPONSE_CONVENTION.md` | COVERED by tests |
| Deployment/recovery | `docs/DEPLOYMENT.md`, `docs/DEPLOYMENT_READINESS_REPORT.md`, `docs/PHASE_10_DEPLOYMENT_RECOVERY_CHECKLIST.md` | DOCUMENTED — not re-verified this run |
| User-manual verification chains | `docs/user-manual/` — 34 Playwright tests, 32 pass + 2 flaky, 18 screenshots, matrix 21V/3T/2NI | COVERED (committed `0b4393b`, `c6f1a90`) |

## Defect register (seed)

| ID | Severity | Finding | Status |
|---|---|---|---|
| S-01 | P2 | **Bulk semi-monthly payroll generation** not runtime-exercised | UNVERIFIED — needs E2E run |
| S-02 | P2 | **13th-month pay accrual/processing** not runtime-exercised | UNVERIFIED |
| S-03 | P2 | **Salary loans** workflow not runtime-exercised | UNVERIFIED |
| S-04 | P2 | **Remittance/DTR/payroll report exports** not runtime-exercised | UNVERIFIED |
| S-05 | P3 | **Barcode generation & monthly audit submission pages** not exercised | UNVERIFIED |
| S-06 | P2 | **Real mailbox delivery** — SMTP `accepted` proven, inbox delivery not | BLOCKED — needs Mailtrap/test-inbox credentials |
| S-07 | P2 | **Human first-time-user walkthrough** | PENDING — external gate |
| S-08 | P2 | **School template/rubric** for manual submission | PENDING — external dependency |
| S-09 | P3 | Kiosk UI punch flow — API+DB verified, browser UI entry not exercised | PARTIAL |
| S-10 | P3 | Vite build warnings (chunk size, mixed imports) | COSMETIC |
| S-11 | P3 | Day-off sync delete+insert not wrapped in DB transaction | LOW RISK — noted during D-07 fix |

## Initial risk register

- **R-1:** `APP_DEBUG=true` and seeded demo accounts are fine for the local/capstone demo but must not reach production (documented in DEPLOYMENT.md release checklist).
- **R-2:** `QUEUE_CONNECTION=sync` acceptable for demo only; business production needs a supervised worker + scheduler (documented).
- **R-3:** ~49 uncommitted WIP files include unrelated feature work (evaluator guides, revision specs, `PaymentReferenceGuard.php`) — not audit scope; preserved as-is.
- **R-4:** Email outbox is durable and provider-acceptance is proven; without a test mailbox, end-to-end delivery remains the largest honest evidence gap.

## Verification boundary

This report establishes baseline test/build health and maps existing verified evidence. It does not re-execute every workflow; items marked UNVERIFIED were not run in this session. Per-workflow evidence lives in `docs/user-manual/audit/` (runtime chains) and the test suite itself.

---

## Increment 2026-10-22 — Runtime workflow verification + schema investigation

### A. Runtime verification matrix

| ID | Workflow | Evidence | Result | Defect/limitation | Next action |
|---|---|---|---|---|---|
| S-01 | Bulk payroll generate | `PayrollEndToEndTest` (generate→draft, duplicate prevention, authz) + `PayrollIndustryTest` — executed in suite | PASS — Automated test | Frontend bulk-UI not exercised in browser | Optional: E2E page pass |
| S-02 | 13th-month accrue/pay | `HrFinanceWorkflowTest` 6 cases — accrue, idempotency, eligibility skip, pay full/partial/repay-422, role gate | PASS — Runtime verified (API+DB) | Accrual uses `base_salary` (not actual earned basic) — **business-rule ambiguity**, flagged not changed | Owner confirms formula |
| S-03 | Salary loans | `HrFinanceWorkflowTest` 6 cases — create/cancel/scope/self-service/role gate; payroll-deduction path via `PayrollIndustryTest::loan deduction settles once` | PASS — Runtime verified | `my-loans` comment says "pending manager approval" but auto-approves — doc/code mismatch; no repayment endpoint outside payroll deduction | Confirm intended approval flow |
| S-04 | Remittance/DTR/export | `HrFinanceWorkflowTest` 6 cases — remittance rows/totals/empty/validation/role; DTR filters+lateness; attendance export | PASS — Runtime verified | SSS employer-share formula assumes ee=5% (×1.7/×2.7) — business rule, flagged; `attendance/export` returns JSON for `format=csv` (no real file) | Owner confirms SSS rate + whether file export needed |
| S-05 | Barcode + monthly audit | `BarcodeLookupTest` (8 cases, pre-existing) + `HrFinanceWorkflowTest` 5 audit cases (list/save+stock adjust/validation/report/role) | PASS — Runtime verified | `audit_month` accepts any string (no `Y-m` format check) — minor | Optional hardening |

### B. Schema investigation matrix (read-only — nothing altered)

| Pair | Tables/models | Evidence | Classification | Recommendation |
|---|---|---|---|---|
| `boarding_rooms` vs `hotel_rooms` | `BoardingRoom` (room_code, species, capacity, category, soft-delete) vs `HotelRoom` (room_number, per-room) | Live booking flow writes `service_requests.boarding_room_id` + `boarding_room_reservations` (26 rows); `boardings.hotel_room_id` filled on 14 legacy rows, NULL on 37 newer ones; `Boarding` model comment says "Keep for backward compatibility" | **Intentional compatibility/legacy structure** | Keep; no migration needed. Owner may retire `hotel_rooms` after the 14 legacy boardings age out |
| `appointments` vs `vet_appointments` | `appointments` (69 rows; veterinarian_id, service_request_id, billing, medical records) vs `vet_appointments` | `vet_appointments` **does not exist** — explicitly retired by migration `2026_09_28_000002_retire_vet_appointments` ("active workflow uses appointments exclusively") | **Resolved — no duplication** (completed legacy migration) | None |
| `grooming_appointments` vs `groomings` | `GroomingAppointment` (0 rows, thin columns) vs `Grooming` (163 rows, billing/FK-rich) | Live API (`Api\GroomingController`, used by frontend `grooming.js` → `/api/grooming`) reads `groomings`. Legacy `GroomingController` queries the empty table and **is still routed** at `customer/grooming/*` — but no frontend code calls those paths | **Probable dead routes over legacy table** — any call would silently write to the dead table | Retire `GroomingController` + `customer/grooming` routes + `grooming_appointments` table — needs owner sign-off (deletion, not performed) |

### C. Defect register additions

| ID | Severity | Defect | Root cause | Fix | Status |
|---|---|---|---|---|---|
| D-11 | **P1** | **Lateness never counted anywhere** — `late_deductions` always 0, kiosk `is_late` never set, DTR shows −90 min | `CompanySchedule::lateMinutes` used `$actual->diffInMinutes($shiftStart)`; Carbon 3 diffs are signed → negative for late arrivals, and all consumers guard `> 0` | Swapped operands → `$shiftStart->diffInMinutes($actual)` (1 line) | **FIXED + regression-tested** |
| D-12 | P2 | `thirteenth-month/{id}/pay` accepted `paid_amount: -100` (reduces paid_amount silently) and any `paid_date` string | No input validation on the pay endpoint | Added `sometimes|numeric|min:0.01` + `sometimes|date` | **FIXED + regression-tested** |
| D-13 | P2 | `reports/remittance?period=bogus` → HTTP 500; unknown `type` silently returned base-only rows | Unvalidated `explode('-', $period)` + `match` default | Added `date_format:Y-m` + `in:sss,philhealth,pagibig` | **FIXED + regression-tested** |
| D-14 | P2 | `customer/grooming` routes serve dead legacy table | Route wiring to retired controller | Proposed: retire routes/controller/table (owner decision) | DOCUMENTED — deletion requires approval |
| D-15 | P3 | `my-loans` code comment claims "pending manager approval" while auto-approving | Comment drift | Proposed: correct the comment or implement approval per owner | DOCUMENTED |

### D. Test evidence

- `php artisan test --filter="HrFinanceWorkflowTest|PayrollIndustryTest|PayrollEndToEndTest|ManagerAttendanceApiTest"` on `pawesome_test` → **43 passed / 0 failed** (280 assertions), exit 0. Includes the new 23-case `tests/Feature/HrFinanceWorkflowTest.php`.
- First run of the new spec caught all three defects (4 red cases) before fixes — defects are reproducible, not hypothetical.
- Full-suite regression run pending in next commit checkpoint (the 655 baseline is pre-increment).

### E. Remaining blockers

- 13th-month: accrual uses `base_salary` not actual earned basic — needs owner's authoritative formula (Philippine law: basic pay earned ÷ 12).
- SSS employer-share ratio assumes employee share = 5% — needs owner confirmation against the intended SSS table year.
- `attendance/export` `format=csv` returns JSON placeholder — real file generation not implemented (scope question).
- Mailbox delivery, human walkthrough, school template — unchanged external gates.

---

## D-11 historical impact assessment — 2026-10-22

**Classification: QUANTIFIED (dev DB) — production not assessed (no authorized access).**

### Methodology

- Read-only inspection of the **development** database `pawesome` (XAMPP MySQL, via `php artisan tinker` / `DB::table()`). No UPDATE/DELETE, no payroll regeneration, no migrations — per read-only mandate.
- Consumers of `CompanySchedule::lateMinutes()`: `PayrollComputationService` (2 call sites — semi-monthly and monthly stats), `BarcodeAttendanceController` (writes stored `attendance.is_late` at punch time), DTR report (recomputes at read).
- Config at assessment time: `shift_start=08:00`, `grace=15` (late threshold 08:15), `dailyRate = base_salary/26`, `hourlyRate = base_salary/208` (or `employee.hourly_rate` override), `late_deductions = total_late_minutes × hourlyRate/60` (`PayrollComputationService` lines ~506).

### Records inspected (dev DB — sparsely seeded)

| Scope | Count |
|---|---|
| `attendance` total | 4 |
| with `check_in` | 2 |
| `is_late = 1` stored | 0 |
| `payrolls` total | 1 (status `paid`) |

### Findings

| Category | Count | Evidence |
|---|---|---|
| **Confirmed mis-flagged attendance** | 1 | `attendance` id=2, user 73, 2026-10-22, `check_in=14:18:13` — 378 min past shift start, `is_late=0` written at barcode punch time |
| **Confirmed missed payroll deduction** | 1 | `payrolls` id=1, period 2026-10-16→10-31 covers attendance id=2 → `late_deductions=0.00` should have been ≈ **₱969.23** (378 min × 32,000/208/60) |
| Correctly unflagged | 1 | `attendance` id=1, check_in 08:00 — on time |
| Not evaluable | 2 | `attendance` ids 3–4 — `on_leave`, no `check_in` (by design) |
| Suspected but unconfirmable | 0 | — |

### Estimated financial impact

- **≈ ₱969.23 under-deduction** on the single paid payroll row (overpayment to the employee). Evidence-based: period coverage confirmed, deduction formula taken verbatim from the service. Label: **estimated** — exact amount depends on whether a regenerate would re-derive identical base inputs.

### Blast radius of the stored flag

- `attendance.is_late` is written once at punch time and **never recomputed** — `AttendanceController`, `Admin\ReportsController` DTR views, and dashboards all read the stored flag. Historical rows punched under the bug remain mis-flagged unless remediated.
- DTR `late_minutes` is recomputed at read → displays correctly going forward without remediation.
- Future punches are fixed by the code change; **no historical rows were modified** in this increment.

### Limitations

- Dev DB only — production (if it exists) was not queried; real-world volume is unknown and likely larger.
- Employee PII deliberately excluded from this report (internal ids only).
- Payroll id=1 is `paid` — any correction requires a reversal/adjustment workflow with audit trail.

### Remediation (requires payroll-owner approval — NOT performed)

1. Owner decision: re-issue an adjustment entry for payroll id=1 or document as accepted variance (dev/seed data — arguably no action needed).
2. If production data exists: a reviewed remediation script recomputing `is_late` for historical punches and flagging affected paid payrolls — separate increment, explicit approval required.
