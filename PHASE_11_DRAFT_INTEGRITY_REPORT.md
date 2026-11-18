# Phase 11 — Payroll Draft Integrity, Release Guard & Financial Regression

Date: 2026-11-19. Baseline: Phase 9/10 reports; all verified on isolated `pawesome_phase9_e2e` @ :8039.

## P1 Fixes — `app/Http/Controllers/Api/PayrollController.php`

### 1. `generate()` now refreshes drafts
- Old behavior: `exists()` check skipped ANY existing payroll for employee+period → drafts went permanently stale.
- New: fetch the row; skip only when status ≠ `draft` (approved/`pending`/`paid` stay immutable). Drafts fall through and are **updated in place** (identity fields + full `calculatePayroll(true)` recompute) — `updateOrCreate`'s attribute lookup was also found to miss rows stored as `datetime`, causing silent unique-key INSERT failures swallowed into `errors[]`; in-place update avoids that too.

### 2. `markAsPaid()` freshness guard
- Inside the existing row-lock transaction, the payroll is recomputed on a non-persisted `replicate()` and compared on 18 money/hour fields (gross, net, all deductions, statutory, hours, day counts).
- Drift > ₱0.01 → 422 `stale_fields` listed, status **reverted to `draft`** so it can be regenerated and re-approved. A stale payroll can no longer reach `paid`.

## Acceptance scenarios — verified live

| Scenario | Result |
|---|---|
| Generate draft → change attendance → regenerate | **Refreshed**: 10:00 check-in → late ₱250, gross ₱11,000→₱10,750, net ₱9,925→₱9,675 |
| Change attendance after approval → release | **422** "figures are stale" + `stale_fields=["gross_pay","net_pay","late_deductions"]` + status→`draft` |
| Release a stale draft | Rejected at the single release endpoint (`markAsPaid` is the only path to `paid`) |
| Approved/paid rows silently rewritten by generate | No — both paid rows (id 2, 3) returned in `skipped`, values unchanged |
| Rejected stale payroll → regenerate → reapprove → release | Full loop green → `paid` with corrected figures |
| Payslip/PDF/email/remittance reflect final release | Payslip gross 10,750/net 9,675/late 250/`paid`; outbox `payroll.payslip:7`→`accepted`, remittance lists all 3 paid employees |
| Audit history | `processed_by`/`processed_at` re-stamped on each generate/approve/release; prior `approved_by`/`approved_at` remain on the row as history of the first approval |

## P2 — Schedule precedence (decision documented)

- Current code: `CompanySchedule` reads only `system_settings`; `users.work_start_time`/`work_end_time` are dead fields in payroll (Phase 10 P10-2, ₱1,750 phantom-lateness demonstration).
- Recommended definition (needs management sign-off): **per-user shift wins when set, else company default** — implementing touches `CompanySchedule` + all callers; deferred pending approval.
- Short-term alternative: hide/ignore the per-user fields and manage shifts via `system_settings` + `employee_day_offs` only.

## Still open

- **Playwright browser E2E**: still blocked — ports :8000–:8014+ belong to the concurrent agent's worker pool; needs a dedicated Vite port and coordination.
- `pawesome_test` contention unchanged → full backend suite rerun still gated.
- Payroll id=3 (Phase 10's intentionally-stale released row) remains in the isolated DB as evidence — real systems would need a void/correction workflow for such rows; the new guard prevents recurrence.

**Verdict:** P1 draft-staleness and stale-release are **fixed and runtime-verified**. Payslip→PDF→email→remittance chain confirmed to emit only final released figures.
