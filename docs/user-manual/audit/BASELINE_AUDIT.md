# Baseline Audit — Pawesome User Manual v0.4

**Audit date:** 2026-10-25
**Branch:** `main` (HEAD `3e75be0` — "Black sidebar text, chatbot render fix, drop landing boarding rooms")
**Auditor role:** senior development team, documentation rebuild for Capstone B

---

## 1. Git safety check

`git status` at audit start: **51 modified/untracked entries**. Significant pre-existing work in the tree that must be preserved untouched:

- **Modified app files (user's ongoing work — do not touch):** ~30 backend files (controllers, services, middleware incl. `IdempotencyKey`, `ApiTokenAuth`), `backend/routes/api.php` + `console.php`, `frontend/src/components/cashier/CashierPOS.jsx`, `AGENTS.md`, `docs/DEPLOYMENT.md`, `docs/user-manual/README.md`.
- **Deleted:** `backend/app/Services/InventoryDeductionService.php` (refactored away; deduction logic lives elsewhere — not user-facing).
- **Untracked user files:** `docs/PAWESOME_REVISION_AUDIT.md`, `docs/integration/`, `backend/tests/Feature/AuditRegressionTest.php`, `frontend/e2e/revision-b-confirmed-flows.spec.js`, `documentation/` evaluator guides.
- **Untracked files from the v0.3 pass (mine, prior session):** `PAWESOME_USER_MANUAL_v0.3.{md,pdf,docx}`, `REVISION_SUMMARY.md`, `.manual-injected-*.md`, `PAWESOME_USER_MANUAL.pdf`.

**Implication:** the working tree = HEAD + two waves of uncommitted changes. The "actual system" audited here is this working tree, not the 2026-10-22 build the v0.2 manual was verified against. Several v0.3 statements needed re-verification — see MANUAL_GAP_ANALYSIS.md.

## 2. Repository structure relevant to this task

- `backend/` — Laravel 12, PHP 8.2 (XAMPP CLI confirmed). Routes: `routes/api.php` (731 route lines), `web.php`, `console.php`. Feature tests under `tests/Feature/` (PHPUnit, `RefreshDatabase` against MySQL `pawesome_test` — confirmed by `tests/Feature/AuditRegressionTest.php:17` and `phpunit.xml` pinning `DB_DATABASE=pawesome_test`).
- `frontend/` — React 18 + Vite. Role route files in `src/routes/` (9 files: App, Admin, Cashier, Customer, Inventory, Manager, Receptionist, SuperReceptionist, Vet). Role sidebars in `src/components/<role>/`. Playwright suite in `e2e/` (~70 specs) plus `.manual-pdf-build.mjs` (manual → PDF, marked + Playwright print).
- `docs/user-manual/` — `PAWESOME_USER_MANUAL.md` (v0.2, preserved), `PAWESOME_USER_MANUAL_v0.3.md/pdf/docx` (preserved), `REVISION_SUMMARY.md` (v0.3), `README.md`, `audit/` (prior evidence), `screenshots/` (18 PNGs, all present).
- `docs/PAWESOME_REVISION_AUDIT.md` — **Revision B audit**, records a second verification wave ("Phase 9": 9/9 live Playwright journeys, 18/18 DB/API correlations on `pawesome_test`) plus a 606-test / 2,967-assertion backend suite pass and focused 52/300 filter pass.

## 3. Environment and verification methods actually available

| Capability | Status |
|---|---|
| PHP CLI | PHP 8.2.12 (XAMPP) — available |
| MySQL | Running on 127.0.0.1:3306 (XAMPP). `pawesome` and `pawesome_test` both exist |
| `pawesome_test` state | 178 migrations, **0 users / 0 service_requests / 0 boardings** — Phase 9 fixtures are gone; safe to run `RefreshDatabase` tests (verified before running) |
| `php artisan route:list` | Ran clean — routes enumerated |
| `php artisan test` (subset) | **98 passed / 493 assertions** (7 feature suites, ~74 s) — see WORKFLOW_VERIFICATION_MATRIX.md |
| Playwright (mocked) | `PW_START_FRONTEND=true E2E_LIVE=false` — auto-starts Vite; ran 3 specs: **10 passed / 4 failed** (all 4 failures = stale spec expectations, not app defects — see ROLE_FEATURE_MATRIX + MANUAL_GAP_ANALYSIS) |
| Live stack (API + Vite + real DB) | Feasible but not executed this pass — prior Phase 9 live evidence (same code lineage) plus today's backend suite used instead |
| PDF build | `node frontend/.manual-pdf-build.mjs` (parametrized in v0.3) — works, 18 image embeds |
| DOCX build | Portable pandoc 3.7.0.2 downloaded to `%TEMP%` — works |
| Email delivery | Not testable (test domains non-routable) — documented as limitation, consistent with both prior audits |

## 4. Documentation inventory

| File | Role |
|---|---|
| `PAWESOME_USER_MANUAL.md` | v0.2 original — **baseline to compare against, unchanged** |
| `PAWESOME_USER_MANUAL_v0.3.md` | v0.3 plain-language rewrite — **primary input for v0.4** |
| `audit/feature-verification-matrix.md` | v0.2 runtime evidence (2026-10-22) |
| `audit/screenshot-register.md` | 18-capture register + "not yet captured" list |
| `audit/documentation-gaps.md`, `documentation-qa-report.md`, `workflow-map.md`, `route-and-page-inventory.md`, `role-permission-matrix.md` | v0.2 supporting evidence |
| `docs/PAWESOME_REVISION_AUDIT.md` | Revision B findings + Phase 9 evidence |

## 5. Known deltas found during inspection (before claim-by-claim audit)

New/changed since the 2026-10-22 v0.2 verification:

1. Inventory sidebar has **Controlled Drugs** page (`ControlledDrugRegister.jsx`, route `/inventory/controlled-drugs`).
2. Manager sidebar has three new entries: **Invoice Approvals** (`ManagerInvoiceApprovals`), **Receipt Scanner** (`ReceiptScannerSettings`), **Controlled Drugs**.
3. Receptionist booking approvals now show a confirmation dialog ("Are you sure you want to approve this request?") — present in all three booking pages.
4. Boarding lifecycle actions exist for receptionist: Check In, Ready for Pickup, Check Out, Add Care Log, room assignment.
5. Walk-ins page renders "Recent Walk-in Bookings" list (`.recent-item`; spec selector `.walkins-recent-card` is stale).
6. Payment reference numbers must be unique across proof flows (`PaymentReferenceGuard`; backend test confirms reuse → 422).
7. Pet photo rules: JPG/PNG/WebP, **under 10 MB** (spec's 5 MB expectation is stale).
8. Landing-page "Boarding Rooms" section was **deliberately removed** in HEAD commit `3e75be0` — do not document.
9. POS sales carry an idempotency key (uncommitted) — no doc impact.
10. New uncommitted endpoints: confinement `cancel`, dispensation `void` — edge-case staff actions.

## 6. Initial known gaps

- 6 screenshot placeholders remain uncaptured (hotel form w/ vaccination upload, walk-ins form, reject dialog, POS cart, consultation editor, Create User form).
- Mailbox delivery unprovable (test domains) — consistent limitation.
- Mocked-spec drift: 3 spec expectations stale vs current UI (see above); deliberate removal explains the 4th.
- Payroll bulk/13th-month/loans/remittance/DTR exports, barcode generation, monthly audit submission, settings changes — still not exercised end-to-end anywhere on record.

## 7. Planned deliverables (all new files; nothing existing overwritten)

- `PAWESOME_USER_MANUAL_v0.4.md` (+ generated `.pdf`, `.docx`)
- `audit/ROLE_FEATURE_MATRIX.md`, `MANUAL_GAP_ANALYSIS.md`, `WORKFLOW_VERIFICATION_MATRIX.md`, `SCREENSHOT_AUDIT.md`, `BASELINE_AUDIT.md` (this file)
- `REVISION_SUMMARY_v0.4.md`
- `README.md` scoped update

Deviations from expected paths: none — all paths exist as described.
