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

---

## D-11 discrepancy revalidation + correction design — 2026-10-22

Review-only increment. No historical records changed, no commits made.

### Phase 1 — Verified business rules

| Rule | Established behavior (code-verified) | Source |
|---|---|---|
| Late definition | `check_in > shift_start + grace` (08:00 + 15 min = 08:15 threshold); `late_minutes` measured **from shift start**, not from grace expiry | `CompanySchedule::lateMinutes` |
| Late deduction | `total_late_minutes × hourlyRate/60`, `hourlyRate = base_salary/208` (or `employee.hourly_rate`); rounded 2dp at row level; **no cap** | `PayrollComputationService` ~L506 |
| Incomplete punch | check-in without check-out → `incompletePunchDays` flagged, **never deducted**; late still counts if check_in exists | stats loop ~L293 |
| Undertime | `check_out < shift_end` → per-minute deduction at hourly rate; also uncapped | `undertimeMinutes`, ~L508 |
| Exemptions | **None exist** — no per-employee late exemption; `on_leave` rows skip deduction only when no `check_in`; an `on_leave` row *with* a check_in would still accrue late minutes (edge case, untested in prod data) | stats loop |
| Schedule | Single company-wide shift; per-employee overrides limited to rest-day pattern (`employee_day_offs`); no per-employee shift times | `CompanySchedule` |
| Payroll lifecycle | `draft` → `pending` (approve) → `paid` (markAsPaid); `cancelled` exists; **paid/cancelled immutable** via `update()` (422) | `Api\PayrollController` |
| Pre-payment correction | `update()` allows editing all money/attendance fields on draft/pending rows + triggers service recompute | `update()` ~L547 |
| Generation timing | Validates semi-monthly shape only — **no period-end gate**; duplicate prevention per person+period | `generate()` ~L146 |
| Attendance correction | `attendance_corrections`: employee requests → manager approves → writes `check_in/out` to attendance. **Does not recompute `is_late`, does not touch payroll** | `Manager\AttendanceCorrectionController::approve` |
| Post-payment adjustment | **Does not exist** — no reversal/adjustment entity anywhere | full codebase search |

**Unresolved business rules (owner must decide):**
- Should generation be blocked/warned before `period_end`? Currently allowed → late-arriving punches silently excluded.
- Should attendance corrections approved after payroll generation trigger a payroll re-check? Currently they silently diverge.
- Is a late longer than X minutes "absent" instead? Code says no — late is always per-minute regardless of magnitude (378 min late = still "present + late").
- `is_late` is never recomputed on `Attendance::save()` (explicit code comment) — corrections changing check_in leave the flag stale.

### Phase 2 — Discrepancy revalidated (dev DB `pawesome`, read-only)

| Fact | Evidence |
|---|---|
| 2026-10-22 = Thursday (dow=4) — workday | user 73 has **no** `employee_day_offs` → company Mon–Sat applies |
| `payrolls` id=1 `created_at` | **2026-10-22 13:31:46** |
| `attendance` id=2 `created_at` | **2026-10-22 14:18:13** — punch **postdates payroll generation by ~47 min** |
| `attendance` id=2 `check_out` | 14:18:18 — 5-second punch pair, clearly an E2E test artifact (chain4 kiosk test) |
| `attendance_corrections` for 2026-10-22 | **13 rows**, all `rejected`, all E2E test artifacts (`requested_check_in 08:00`, "E2E manual audit" reasons) |

**Verdict — reclassified:**

- `attendance.is_late=0` on id=2: **confirmed bug artifact** — punch ran under the pre-fix code; under corrected code `is_late=true` would have been stored.
- `payrolls.late_deductions=0.00` on id=1: **NOT a defect-caused error.** The punch did not exist at generation time (13:31 < 14:18), so 0.00 was correct for the inputs then present. The ₱969.23 figure is only what a recompute *today* would produce — and it would also add ≈ ₱415 undertime (check_out 14:18 vs 17:00 = ~162 min), totalling ≈ ₱1,384 of notional deductions on a test fixture.
- **Classification: inconclusive as a missed deduction; estimated conditional value only.** No employee was under-deducted — the payroll was accurate at generation; the late-arriving punch has no reconciliation path (the real gap).

**Latent risk identified (supersedes the row-level finding):** generation is permitted mid-period and a paid payroll is never reconciled against attendance arriving afterward. Under the old bug, *any* post-generation or correctly-timed late punch was also invisible to deductions; under the fix, only post-generation punches are.

### Phase 3 — Correction workflow design

**Existing mechanisms (use first):**
- Pre-generation: `attendance_corrections` approval fixes the punch data itself.
- Pre-payment: `Api\PayrollController::update()` on draft/pending rows recomputes via the service — adequate for fixing pre-payment errors.
- **Post-payment: nothing.** A paid payroll cannot be adjusted, reversed, or supplemented — the closed-loop gap.

**Proposed minimal design (not implemented — requires owner approval):**

`payroll_adjustments` table + approval workflow:

| Requirement | Design |
|---|---|
| Original preserved | Adjustment is a new signed row (`delta_amount`, `delta_late_minutes`, …); parent payroll row never mutated |
| Evidence | `attendance_correction_id` link + free-text `reason` + `supporting_payload` JSON (before/after snapshot) |
| Approval | `requested_by` (manager) → `reviewed_by` (admin/manager — must differ from requester) + `reviewed_at`, `status: pending→approved→applied / rejected` |
| Preview | `POST /payroll/{id}/adjustments/preview` recomputes the period against current attendance via `PayrollComputationService` and returns the delta — no writes |
| Duplicate protection | unique key on `(payroll_id, attendance_id, type)` + `idempotency_key`; applied adjustments locked |
| Transaction | apply = create adjustment row + mark applied + (optionally) carry `applied_to_payroll_id` of next payroll — all in `DB::transaction` with row lock on parent payroll |
| Semantics distinction | Attendance correction changes the record; payroll adjustment changes the money. Adjustment should *reference* an approved attendance correction, not silently re-derive times |
| Visibility | Adjustment surfaced on the payslip response (`data.adjustments[]`) so employee/admin sees before/after |

**Simpler acceptable alternative (owner's call):** treat late-arriving attendance as an input to the *next* payroll run (supplementary earnings/deductions row), which avoids touching paid records entirely but leaves the paid row permanently understated — needs an explicit policy decision.

### Phase 4 — Proposed regression tests (when design is approved)

1. `lateMinutes` boundaries: check_in 08:00/08:15 → 0; 08:16 → 16; 14:18 → 378 — **partially covered now** by `HrFinanceWorkflowTest::dtr report filters and computes` + `PayrollIndustryTest`; add exact-boundary (08:15 vs 08:16) cases.
2. Post-generation punch: generate period, then insert late attendance dated inside it → paid payroll unchanged; adjustment preview reports the delta.
3. Adjustment lifecycle: propose → preview → approve → apply → re-apply rejected (idempotent); rejected path leaves no residue.
4. Authorization: requester ≠ approver enforced; cashier/customer 403.
5. Attendance-correction → payroll linkage: approved correction flags affected draft payrolls; paid payrolls unchanged until explicit adjustment.
6. Rollback: forced failure mid-apply leaves parent payroll and adjustment row consistent (transaction test).
7. `is_late` recompute-on-correction: approving a correction that changes check_in refreshes the stored flag (currently stale — fix needed in `AttendanceCorrectionController::approve` regardless of the adjustment workflow).

### Recommendation

**Accept the development-seed discrepancy — do not correct the rows.**

Rationale: every affected record (attendance 1–4, payroll 1, all 13 corrections) is a same-day E2E/manual-verification artifact for a test user; no real employee, no real payroll disbursement, and the stored `late_deductions=0.00` was *accurate at generation time*. Mutating test rows would falsify the audit trail for zero real-world benefit. The mis-stored `is_late=0` should remain as-is: it is honest evidence of the pre-fix behavior.

Ranked next actions:
1. **Owner decision:** post-payment adjustment workflow (design above) — the genuine closed-loop gap, independent of test data.
2. **Owner decision:** mid-period generation gate/warning — prevents recurrence of invisible late punches.
3. Small fix worth doing regardless: recompute `is_late` in `AttendanceCorrectionController::approve` (stale-flag defect, well-scoped).
4. If a production DB exists: authorized read-only scan for `is_late=0` punches outside grace + paid payrolls covering them.
5. No historical remediation on dev data.

### Phase status

- Business rules: **verified** (code + DB evidence above)
- Discrepancy: **revalidated — reclassified from "confirmed missed deduction" to "generation-timing artifact"** (dev-test data)
- Correction design: **documented, unimplemented — awaiting owner approval**
- Regression tests: **proposed, unwritten**

---

## Attendance-correction consistency + generation-timing analysis — 2026-10-22 (part 2)

### D-16 — FIXED: stale `is_late`/`status` on approved attendance corrections

- **Root cause:** `AttendanceCorrectionController::approve` wrote `check_in`/`check_out` and saved, but `is_late` and `status` are never recomputed on `Attendance::save()` (explicit model comment — the kiosk owns those fields). A corrected punch inherited whatever flag the original punch set.
- **Fix:** approval is now wrapped in `DB::transaction` and, when a `check_in` exists after the correction, recomputes `is_late` via `CompanySchedule::lateMinutes()` — the identical rule the barcode kiosk applies at punch time — and syncs `status`: `late` when late; `late`/`absent` → `present` when the corrected punch is on time (a punch disproves absence). `on_leave` is deliberately untouched — leave approval is a separate authority from the punch record.
- **Scope note:** `is_early_leave` is declared on the model but **no code path ever writes it** — dead flag, left as-is (documented, not expanded into).
- **Regression tests:** new `tests/Feature/AttendanceCorrectionConsistencyTest.php` — 9 cases / 32 assertions: late→on-time, on-time→late, grace boundary (08:10), absent-row correction, row-creation-when-missing, unauthorized 403, reject preserves record, already-reviewed 422, DTR reflects corrected state (`late_minutes=90`). **PASS — Runtime verified.**

### Payroll generation timing — analysis + documented policy blocker

- `generate()` validates only the semi-monthly period shape; `period_end > today` is allowed. Duplicate prevention (`existingPayroll` skip + `updateOrCreate`) means a late-arriving punch can never enter that person/period's row afterward — except through `update()` on a draft/pending row, which accepts `manual_attendance` and triggers a full service recompute.
- **Why no gate was implemented:** (a) mid-period generation is demonstrated intentional behavior — the dev `paid` payroll was generated Oct 22 for Oct 16–31 (capstone demo flow); (b) `payroll/compute` already provides the authorized preliminary-calculation path; (c) `update()`+recompute reconciles late attendance *before* payment; (d) blocking generation or gating `approve`/`markAsPaid` on `period_end ≤ today` would break the demonstrated demo flow — the cutoff choice is a business decision, not a defect fix.
- **Policy decision required from owner:** (1) hard-block `generate` when `period_end` is future, (2) allow but mark results `preliminary` and block `approve`/`markAsPaid` until the period closes, or (3) status quo (rely on pre-payment `update()` reconciliation). Recommendation: option 2 — preserves demo ability to preview, protects money movement. **NOT IMPLEMENTED — awaiting decision.**
- Finalized-payroll safety is already adequate: `paid`/`cancelled` rows are immutable via `update()` (422) and duplicate-skipped by `generate` — no unsafe path introduced.

### Remaining post-payment gap (unchanged)

`payroll_adjustments` design from the previous section stands — attendance corrections approved after a payroll is `paid` still have no monetary reconciliation path. Owner approval required before implementation.

### Test evidence (executed this session)

| Command | Result |
|---|---|
| `--filter="AttendanceCorrectionConsistencyTest"` on `pawesome_test` | **13 passed** / 46 assertions |
| `--filter="AttendanceCorrectionConsistencyTest\|PayrollEndToEndTest\|PayrollIndustryTest"` | **31 passed** / 241 assertions |
| Full `php artisan test` on `pawesome_test` | **693 passed / 0 failed** / 3,306 assertions (~129 s) |

### Files changed (uncommitted — left for review)

- `backend/app/Http/Controllers/Manager/AttendanceCorrectionController.php` — transactional approve + `is_late`/`status` recompute
- `backend/tests/Feature/AttendanceCorrectionConsistencyTest.php` — new, 13 cases
- `backend/app/Http/Controllers/Api/PayrollController.php` — D-17 lifecycle fix (below)
- `backend/tests/Feature/PayrollEndToEndTest.php` — +1 case
- `docs/SYSTEM_AUDIT_REPORT.md` — this section

### Review-round edge cases — 2026-10-22 (part 3)

Three checkpoint items re-verified; one new defect found and fixed:

| Check | Result |
|---|---|
| `on_leave` + corrected punch | **Bug in first pass, fixed** — the late branch set `status='late'` unconditionally, clobbering `on_leave`. Now `on_leave` is preserved in both directions; `is_late` still reflects the corrected punch truthfully. **Pre-existing policy issue surfaced:** payroll counts `paidLeaveDays` AND late minutes on an `on_leave` row carrying a `check_in` (stats loop applies the late check to any record with `check_in` regardless of status). Double-counting an approved-leave day is a business-rule question for the owner — flagged, not changed. |
| Status transition coverage | `early_leave`/`present`/`on_leave` verified preserved; only `late`/`absent` transition to `present` on an on-time corrected punch; any non-`on_leave` status goes `late` when the punch is late. Covered by 4 new tests. |
| Transaction rollback | Verified by forced-failure test (`Attendance::saving` throws): approve returns 500, attendance row unchanged, correction stays `pending`, `attendance_id` stays NULL — both writes revert atomically. |

### D-17 — FIXED: payroll lifecycle bypass via `update()`

- **Found during** the period-close feasibility review: `PUT /api/manager/payroll/{id}` accepted `status:'paid'` (and `'approved'`, a status `approve()` never even produces — it sets `'pending'`). A direct API call could mark a draft `paid` **skipping `markAsPaid()`'s loan settlement (`loans_settled` guard → loans could be deducted again on a later payroll), `processed_by`/`payment_date` stamping, and all notifications**.
- **Fix:** `update()` status enum restricted to `draft,processing,pending,cancelled` — terminal/effective statuses only via the dedicated endpoints. `cancelled` retained (no dedicated cancel endpoint exists). The now-unreachable `approved`-transition tracking block was removed.
- **Regression test:** `PayrollEndToEndTest::update cannot set paid or approved status` — both rejected 422, `cancelled` still works, `loans_settled` untouched. **PASS.**
- **Period-close policy feasibility:** enforcement points exist cleanly at `approve()` and `markAsPaid()` (`$payroll->pay_period_end` is on the model); with D-17 closed there is no third transition path, so a `period_end ≤ today` guard added at those two methods would fully cover the lifecycle. Implementation still awaits the owner's policy choice (options documented above).

### Final lifecycle security review — 2026-10-22 (part 4)

**Full payroll status write-path enumeration** — every routed writer traced:

| Path | Status writes | Verdict |
|---|---|---|
| `POST payroll/generate` | creates `draft` (updateOrCreate, existing skipped) | OK |
| `POST payroll` (store) | hardcodes `status:'draft'` — no user-supplied status accepted | OK |
| `POST payroll/compute` | preview only, no writes | OK |
| `POST payroll/{id}/approve` | `paid`→422; else `pending` + `processed_by/at` | OK |
| `POST payroll/{id}/release` | `paid`→422; else `paid` + payment metadata + loan settlement | **Was non-atomic → fixed (below)** |
| `PUT payroll/{id}` | enum `draft,processing,pending,cancelled`; `paid`/`cancelled` rows 422 (cannot reopen) | OK post-D-17 |
| Legacy `App\Http\Controllers\PayrollController` (`update`/`destroy`/`processPayment`/`generateForPeriod`) | **UNROUTED** — only `payslip`/`myPayroll`/`summary`-adjacent GETs wired | Dead code, no live bypass — retire with owner sign-off |

**D-18 — FIXED: non-atomic `markAsPaid`.** Previously `status:'paid'` committed before `settleLoanDeductions` ran; a mid-settlement or notification failure left a `paid` row with partially-settled loans and `loans_settled=false` — and every retry 422'd on the already-paid guard, making the loans permanently under-settled. Now the entire release (status, settlement, notifications) runs in `DB::transaction` — failure rolls everything back and the endpoint is cleanly retryable. Regression test: `PayrollIndustryTest::failed release rolls back status and loan settlement` (forced `Notification::saving` failure → 500 → status non-paid, balance untouched, `loans_settled=false`, retry settles once). **PASS.**

**Loan-settlement verification:** `loans_settled` guard + `settleLoanDeductions` covered by existing `loan deduction settles once on release` test — double-release 422, balance reduced exactly once. `approve()` is idempotent-safe (re-approving a `pending` row re-stamps `processed_by/at` — harmless).

**Cancelled records:** `update()` 422s on `paid`/`cancelled` rows — cancelled payrolls cannot be reopened through any routed path.

**Documented-not-fixed (minor, owner-visible):**
- `MyAttendanceCorrectionController::store` computes a `$locked` flag for `status IN ('approved','paid')` payrolls but (a) never uses it (comment admits corrections are allowed regardless) and (b) `'approved'` is never a stored status — `approve()` writes `'pending'`. Vocabulary drift; the lock check would also miss `pending` payrolls covering the corrected date. Dead code + semantic gap — documented.
- No duplicate-pending-correction guard: an employee can file N pending corrections for one date; approval order determines final state (dev DB shows 13 such artifacts). Human review gate makes this low-risk but noisy.
- `requested_check_out` has no ordering check vs `requested_check_in` (e.g., in 17:00 / out 09:00) — manager approval is the only guard.
- `approve()`/`update()` payroll paths are still non-transactional for their notification tail — a notification failure after the status update returns 500 with the state change persisted (advisory data lost, not financial). Lower severity than D-18; could be wrapped in the same pattern if desired.

**Review 3 — `on_leave` + check_in payroll semantics (documented, unchanged):**
In `PayrollComputationService` (~L259-285 and the monthly-path twin), a record whose `status === 'on_leave'` increments `paidLeaveDays` — and if it carries a `check_in`, the unconditional late block *also* accrues `late_minutes`. Net effect: a paid leave day **plus** a late deduction. Whether "present-but-late during approved leave" should deduct is a business decision — the correction workflow can now produce such rows legitimately (employee worked during leave). **Owner decision required:** should `check_in` on an `on_leave` row (a) keep paid-leave + late deduction (current), (b) convert to a worked day, or (c) keep paid-leave and ignore the punch. Financial implication per occurrence: up to `late_minutes × hourly/60` over-deduction from the employee.

### Payroll policy audit — 2026-10-22 (three decision records)

Evidence: `tests/Feature/PayrollLeavePolicyAuditTest.php` (3 tests, 14 assertions — all PASS against `pawesome_test`; tests document CURRENT behavior, not desired behavior).

#### Decision A — Leave vs. payroll (VERIFIED DEFECTS FOUND)

**Verified finding A1 — unpaid leave is paid.** `LeaveController::approve` runs `markAttendanceOnLeave` for *every* leave type including `unpaid_leave` (L177-179; balance deduction is correctly skipped at L163-164, but attendance marking is not). Payroll then counts `status='on_leave'` rows as `paidLeaveDays++` unconditionally (`PayrollComputationService` L268-270) — the `unpaid_leave` check at L338 is unreachable for approved unpaid leave because the approval always created an attendance row. **Verified live:** approved 1-day `unpaid_leave` → `paid_leave_days=1, absent_days=0, absent_deductions=0`. Cost: `daily_rate` per unpaid-leave day paid to the employee.

**Verified finding A2 — on_leave + punch double-counts.** An `on_leave` row carrying `check_in` gets `paidLeaveDays++` AND `totalLateMinutes`/`undertime`/`nightDiff`/OT (`PayrollComputationService` L281-304). Such rows arise only via correction approval or manual status edit — the kiosk check-in overwrites `on_leave`→`present`/`late` (`BarcodeAttendanceController` L106-118). **Verified live:** late punch on `on_leave` row → `paid_leave_days=1` + `late_deductions>0`.

**Verified finding A3 — baseline correct:** paid leave with no punch → `paid_leave_days=1`, no deductions.

**Owner decision required:**
1. Fix `markAttendanceOnLeave` to skip `unpaid_leave` (attendance rows would then hit the L338 `unpaid_leave`→`absent` path and deduct correctly) — OR keep rows but make payroll consult `leave_requests.type` for `on_leave` rows. Recommended: skip marking for `unpaid_leave` (minimal change, uses existing correct path).
2. Punch on an `on_leave` row: (a) convert to worked day (lose the paid-leave credit — recommended; the employee physically worked), (b) keep paid leave + deduct lateness (current — penalizes twice: leave balance spent AND late deduction), (c) keep paid leave, ignore punch.

#### Decision B — Payroll period closing (lifecycle gaps found)

**Verified finding B1 — approval is skippable.** `markAsPaid` (`Api\PayrollController` L345-414) blocks only `status='paid'`; a `draft` payroll can be released directly, skipping `approve()`'s `pending` transition AND its notification. `cancelled` rows can also be paid via `markAsPaid`. Enforced sequence `draft→pending→paid` does not exist.

**Verified finding B2 — no period-close gate anywhere.** `generate` validates only the semi-monthly shape (L162); `approve`/`markAsPaid` never inspect `pay_period_end`. Mid-period generation, approval, and payment are all possible.

**Verified finding B3 — reconciliation path exists.** `update()` L636-643 recomputes via `calculatePayroll(true)` on money/attendance input changes; `generate` skips existing rows (L194-206). Late attendance therefore only reaches a draft/pending payroll through a manual `update()` call — there is no "re-generate" or automatic staleness refresh.

**Verified finding B4 — 13th-month accrual is not automatic.** Despite the doc comment "called after each payroll run," `accrue13thMonth` is invoked only by `php artisan payroll:accrue-13th` (`AccrueThirteenthMonth` command) and `POST manager/payroll/thirteenth-month/accrue` (`ThirteenthMonthController` L53-61). `markAsPaid` never calls it — if the command is not scheduled, accruals silently never happen. Also confirmed: it accrues the *configured* `base_salary`, not earned basic (`PayrollComputationService` L737-772 — `total_accrued = Σ month_basic / 12`).

**Owner decision required:** (a) enforce `markAsPaid` requires `status='pending'` (recommended — closes the approval skip; blocks cancelled→paid too); (b) choose period-close policy — recommend block `approve`/`markAsPaid` until `pay_period_end < today`, keep generation open as "preliminary"; (c) whether `generate` should offer an explicit recompute for stale drafts vs. manual `update()`.

#### Decision C — Post-payment corrections (design proposal, unimplemented)

Current: `update()` and `destroy()` both 422 on `paid` rows; the status enum excludes `paid`/`approved` from user input. Paid payrolls are fully immutable — there is **no mechanism at all** to correct a paid payroll.

Recommended (if approved): `payroll_adjustments` table — `payroll_id`, `type` (earning/deduction), `amount` (signed), `reason`, `requested_by`, `approved_by`, `status` (pending/approved/rejected/applied), applied into a *later* payroll run as a line item. Preserves the paid record and audit trail; no negative payments; requester ≠ approver enforced. Alternatives evaluated: direct edit of paid row (rejected — breaks immutability/audit), reversal+reissue (rejected for capstone scope — requires voiding disbursement records).

**Owner decision required:** approve the adjustment model + who may request/approve, or defer.

#### New defects register additions

| ID | Finding | Severity | Status |
|---|---|---|---|
| D-19 | `unpaid_leave` paid as if paid leave (verified live) | HIGH — direct overpayment | Awaiting owner decision A1 |
| D-20 | `markAsPaid` bypasses `approve()` (draft/cancelled → paid) | HIGH — lifecycle bypass | Awaiting owner decision B1 |
| D-21 | `on_leave`+punch double-counts (verified live) | MED — edge-case, correction/manual only | Awaiting owner decision A2 |
| D-22 | 13th-month accrual never fires post-payroll; formula uses rated not earned basic | MED | Documented; needs scheduling decision + formula ruling |

### Payroll hardening increment — 2026-10-22 (D-19/D-20 implemented, D-21/D-22 documented)

#### D-19 — FIXED: unpaid leave paid as paid leave
Payroll-side fix in `PayrollComputationService` `on_leave` attendance branch (~L268-279): the row's covering approved `leave_requests.type` is consulted — `unpaid_leave` counts `absentDays += 1` (mirroring the no-record path at ~L345) instead of `paidLeaveDays++`. Leave approval and attendance marking are **unchanged** — `on_leave` rows still render for display; only the money path is type-aware. Covers new approvals, pre-existing rows, and manual markings wherever a real `unpaid_leave` request exists. Rows marked `on_leave` with NO covering approved leave keep paid-leave treatment (conservative fallback — a manager-marked leave row without a request is treated as paid).
Tests: `PayrollLeavePolicyAuditTest` — approved unpaid → absent+deduction; leftover `on_leave` row over unpaid date → absent+deduction; pending/rejected leave → ordinary absence; paid leave → paid, no deduction.

#### D-20 — FIXED: release bypasses approval
`markAsPaid` (`Api\PayrollController` ~L354-360) now requires `status === 'pending'` after the already-paid guard — `draft`/`processing`/`cancelled` → 422, so `approve()` (pending + processed_by/at + notifications) can no longer be skipped. Frontend `PayrollManagement.jsx` Release button now disabled unless `status === 'pending'` (previously enabled for draft — API rejected silently-possible path; 422 toast remains as fallback). Existing tests that released generated drafts were updated to call `/approve` first — they were exercising the bypass.
Tests: `release requires pending status` (draft/processing/cancelled → 422, no payment fields written), `approve then release is the only pay path` (full transition + second-release 422), plus updated loan-settlement/rollback/payslip flows.

#### D-21 — Scenario matrix (behavior UNCHANGED, owner decision pending)

| Scenario | Current outcome (verified) | Recommended rule | Needs owner? |
|---|---|---|---|
| Paid leave, no punch | Paid day, no deduction | Keep — correct | No |
| Unpaid leave, no punch | Absence deduction (post-D-19) | Keep — correct | No |
| Pending/rejected leave, no punch | Ordinary absence | Keep — correct | No |
| Half-day paid leave, no punch | 0.5 paid + 0.5 absent | Keep — correct | No |
| `on_leave` row + real punch (correction/manual) | Paid leave day + late + undertime + OT | **Convert to worked day** (employee physically worked; refund leave balance) — or (b) keep paid + ignore punch | YES |
| `on_leave` + punch via kiosk | Kiosk overwrites to present/late — punch wins | Keep — already a worked day | No |
| Unpaid leave + punch | Status stays present/late → worked day, paid | Keep — correct (they worked) | No |
| Correction sets check_in on `on_leave` row | `is_late` recomputed, `on_leave` preserved → double-count | Follows chosen A2 rule | YES |
| `on_leave` row, no covering leave request | Paid day (fallback) | Keep — manual manager marking is authoritative | No |

Blocked: rule for "employee punched on an approved paid-leave day" — affects late/undertime/OT accrual AND whether leave balance deduction should be refunded.

#### D-22 — 13th-month report (formula UNCHANGED)

- **Formula** (`PayrollComputationService::accrue13thMonth` L737-772): writes the employee's *configured* `base_salary` into `thirteenth_month_accruals.{mon}_basic` (max on repeat calls); `total_accrued = Σ 12 month columns ÷ 12`.
- **PH-law deviation:** statutory formula is Σ *earned* basic ÷ 12 — rated base overstates accrual for months with unpaid absences/undertime and ignores mid-month proration nuance.
- **Call sites:** `php artisan` command `AccrueThirteenthMonth` (all staff+employees, passes `base_salary`) and `POST /manager/payroll/thirteenth-month/accrue` (`ThirteenthMonthController` L53-61). **Never invoked from `markAsPaid` or any payroll lifecycle hook** — despite the doc comment claiming "called after each payroll run." If the command is unscheduled, accruals silently never happen.
- **Effect of triggering post-payment:** accrual would capture the rated base at payment time (idempotent via `max()`), making accruals automatic but binding them to payment events — a month paid twice still writes once. Correctness still requires the earned-basic formula change first; scheduling alone perpetuates the rated-base deviation.
- **Proposal (blocked):** (1) change accrual input to earned basic for the paid period (`period_base` or computed basic component); (2) hook into `markAsPaid` inside the existing transaction OR schedule the artisan command — hook is more reliable; (3) backfill strategy for months already accrued under rated-base. Owner must confirm formula source and whether accrued rows may be recomputed.

#### Final review pass — 2026-10-22 (post-implementation audit)

**D-19 deep review — one additional defect found and fixed.** The per-date leave map (`approvedLeaveDates`) was populated by an unordered `->get()` — overlapping approved leaves of *different types* on the same date resolved nondeterministically (paid vs. unpaid depended on MySQL row order). Added `->orderByRaw("type = 'unpaid_leave'")` so `unpaid_leave` sorts last and deterministically wins the date — never pays a day covered by unpaid leave. All other D-19 edges verified correct: approval-status filter (only `approved` reaches the map), period-boundary clipping (`max($start)`/`min($end)`), Employee→`user_id` identity resolution (null user_id → no leave, correct), no double-counting (`$leaveDates` guard), rest days/holidays unaffected (leave marking is workday-gated), compute is stateless (leave changes reflected on next compute/update).

**D-20 concurrency gap found and fixed.** Pre-fix `markAsPaid` validated `status`/`loans_settled` on the route-bound (stale) model *outside* the transaction — two concurrent releases on a `pending` payroll would both pass the guards and settle loans twice. The transaction now re-fetches with `Payroll::lockForUpdate()` and re-validates status under the lock — the concurrent loser waits, then sees `paid` → 422. (Release is an internal state transition + loan-balance writes + notifications; no external disbursement integration exists to duplicate.) True simultaneous-request coverage isn't reproducible in PHPUnit; the guarantee rests on InnoDB row-lock semantics plus sequential re-release tests.

**New regression coverage (PayrollLeavePolicyAuditTest → 8 cases):** overlapping paid+unpaid leave → unpaid wins; leave spanning a period boundary counts only in-period days; leave outside the period ignored; pending/rejected leave → ordinary absence; unpaid → absent deduction on both approval-created and pre-existing `on_leave` rows; paid leave unaffected; `on_leave`+punch documented unchanged.

**Results:** focused 61/61 + leave-policy 8/8; full suite **704/704, 3,364 assertions**; frontend build passes.
