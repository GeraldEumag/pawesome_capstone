# PAYROLL_DATABASE_AUDIT.md

Schema from migrations + executed read-only queries on `pawesome_test` (dev DB untouched by
mutating checks; browser writes went to isolated `pawesome_e2e_audit`).

## 1. Tables

### `payrolls` (soft deletes)
- **Keys/constraints:** PK `id`; UNIQUE `payroll_id`; UNIQUE `(user_id, pay_period_start, pay_period_end)`
  and `(employee_id, …)` (migration `2026_09_24_000002_enforce_unique_payroll_periods`);
  FK `user_id→users` (nullable), `employee_id→employees` (nullable), `employee_name` free-text fallback.
- **Money:** `base_salary`, `hourly_rate`, `gross_pay`, `net_pay`, statutory `sss/philhealth/pagibig_contribution`,
  `tax_deduction`, `deductions` (other), `bonus`, `allowances`, `non_taxable_allowances`, `commission`,
  `other_earnings`, `overtime_pay`, `night_differential`, `rest_day_pay`, `regular_holiday_pay`,
  `special_holiday_pay`, `*_ot_pay`, `late/absent/undertime_deductions`, `salary_loan`, `cash_advance`
  — `decimal(12,2)`-class columns.
- **Attendance snapshot:** `present/absent/payable/working_days`, `total_late/undertime_minutes`,
  `regular/overtime_hours`, `paid_leave_days`, `is_prorated`, `manual_attendance` JSON.
- **Lifecycle:** `status` (draft/processing/pending/paid/cancelled), `processed_by/at`,
  `approved_by/at`, `payment_date/method`, `remarks`, `deleted_at`, timestamps.
- Person model: exactly one of `user_id` (account) / `employee_id` (non-account) / `employee_name`
  (free-text manual) per row.

### `attendance`
- UNIQUE `(user_id, date)` and `(employee_id, date)` — MySQL permits multiple NULLs so the two
  columns never collide; dual-path like payrolls.
- `check_in/check_out`, `total_hours`, `overtime_hours`, `status`, `source` (kiosk/manual),
  `is_late`, `is_early_leave`, `review_status`, `approved_by`, correction metadata, `deleted_at`.

### Related
`users` (`base_salary`, `hourly_rate`, `role`, `department`, `position`) · `employees` (same +
`employee_no` for non-account staff) · `leave_requests` (status/type/dates; only approved paid
leave credits attendance) · `holidays` (regular/special, dates) · `employee_day_offs` ·
`salary_loans` (balance/installment) · `thirteenth_month_accruals` · `system_settings`
(CompanySchedule source) · `email_deliveries` (payslip outbox intents).

## 2. Executed integrity queries (pawesome_test)

| Check | Result |
|---|---|
| payrolls with no person (user+employee+name all null) | 0 |
| duplicate user+period rows (live) | 0 |
| duplicate employee+period rows (live) | 0 |
| duplicate `payroll_id` incl. trashed | 0 |
| payroll `user_id` orphans | 0 |
| payroll `employee_id` orphans | 0 |
| attendance `user_id` orphans | 0 |
| duplicate attendance (user+date) | 0 |
| `net_pay ≠ gross − (statutory+tax+deductions+loans)` > ₱1 | 0 |

## 3. Constraint behavior verified by tests

- Unique user/employee+period → `generate` is idempotent (`updateOrCreate`), duplicate POST and
  concurrent POST leave one row (executed phase12).
- Unique `payroll_id` incl. trashed → **F-003 defect proven** (count()+1 reused trashed seq →
  23000 duplicate). Fixed: seq = max(numeric suffix, withTrashed)+1.
- Soft deletes preserve history; `updateOrCreate` keyed on live rows — a trashed row for the same
  person+period does **not** block regeneration (unique index covers the period pair only for
  the composite key incl. soft-delete scope of the unique rule — regeneration path tested green).

## 4. Design notes (documented, not changed)

- `payrolls.user_id` is nullable → non-account employees supported intentionally (migration
  `2026_09_13_000003`); consistent with "not every employee must have a system login".
- Attendance corrections post-generation do **not** retro-edit saved payroll rows — payroll
  snapshots stored on the row; regenerate is an explicit manager action (updateOrCreate).
  Documented behavior, consistent with "historical payroll preserved".
- No separate payslip table: payslips are projections of saved payroll rows (single source) —
  correct by design ("payslip must not independently recalculate").

## 5. Concurrency

- `payrolls` uniqueness gives DB-level duplicate protection for generation.
- `payroll_id` seq generation is read-max-then-insert (small window); collisions are caught by
  the unique index (batch `generate` absorbs per-row errors into `errors[]`). Post-F-003 the
  residual risk is a true simultaneous-first-create race — Low, documented.
- `markAsPaid` is transactional (status + loans + email intent together).
