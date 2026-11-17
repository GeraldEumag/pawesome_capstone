# PAYROLL FINALIZATION SUMMARY

**Date:** 2026-11-17 · Evaluator-oriented overview — reflects actual implementation only.

## What the Payroll Module does

Generates, approves, releases, and reports semi-monthly Philippine payroll for staff; provides employee self-service payslips; manages 13th-month accruals; and produces payroll reports.

1. **What it does** — Computes payroll from attendance, applies statutory deductions (SSS/PhilHealth/Pag-IBIG) + tax + loans + cash advances + manual deductions, and runs a draft → pending(approved) → paid lifecycle.
2. **How salary is computed** — `PayrollComputationService` (single source of truth) derives rates from `base_salary`/`hourly_rate`, applies the semi-monthly cutoff factor, computes statutory and other deductions.
3. **How attendance affects payroll** — Late/absent/undertime reduce **earned gross_pay** (the implemented business definition of gross). They are informational on payslips and are NOT re-subtracted in `total_deductions`.
4. **Statutory deductions** — SSS/PhilHealth/Pag-IBIG employee shares plus withholding tax; employer shares (`*_er_share`) are employer cost, never employee deductions.
5. **Generate & approve** — Managers preview (`/compute`), generate per period (`/generate`), then `approve()` stamps `processed_by`/`approved_by`/`approved_at` and moves to `pending`.
6. **Release** — `markAsPaid()` requires `pending`, writes `payment_*`, settles loans, and emits the durable `PayslipReleasedMail` outbox intent (only for account-backed payees).
7. **Self-service** — Employees see `/my-payroll` + `/my-payroll/{id}/payslip`; IDOR-protected.
8. **Protection** — Sanctum tokens + `manager,admin` middleware; server-authoritative totals on linked rows; maker-checker on unlinked rows; unique payroll IDs over soft-deleted rows with collision retry.
9. **Testing** — 1007 backend tests (5106 assertions), 14 payroll Playwright tests on an isolated DB, read-only DB integrity + historical reconciliation, production build.
10. **Remaining limitations** — unlinked rows still trust entered totals (gated by maker-checker, not eliminated); >3-way simultaneous id race bounded by 3-retry budget; legacy unrouted controller paths; no production deploy verification performed.

## Manual linked vs unlinked

- **Linked** (user_id or employee_id): always server-recomputed — client totals cannot persist.
- **Unlinked** (free-text `employee_name`): entered totals trusted by necessity; flagged `is_unlinked`, labeled "Manual" in the UI, and gated — a different authorized manager must approve before release.

## Historical reconciliation

One paid payroll on `pawesome` — zero attendance deductions → **not affected** by F-001. ₱0 exposure. Read-only analysis; nothing modified.
