# PAYROLL_API_AUDIT.md

Route inventory from `php artisan route:list --path=payroll` (executed). All manager routes sit
behind `auth.api` + `throttle:api` + `role:manager,admin`; `my-payroll` routes behind `auth.api`.

## 1. Endpoint inventory

| Method | URI | Controller@method | Role | Purpose | Verified |
|---|---|---|---|---|---|
| GET | `/api/manager/payroll` | `Api\PayrollController@index` | manager,admin | list + summary | ✅ tests+E2E |
| POST | `/api/manager/payroll` | `Api\PayrollController@store` | manager,admin | manual create | ✅ **F-002 fixed: recompute server-side** |
| POST | `/api/manager/payroll/compute` | `Api\PayrollController@compute` | manager,admin | preview rows | ✅ |
| POST | `/api/manager/payroll/generate` | `Api\PayrollController@generate` | manager,admin | batch generate | ✅ idempotent |
| GET | `/api/manager/payroll/thirteenth-month` | `ThirteenthMonthController@index` | manager,admin | accrual list | ✅ |
| POST | `/api/manager/payroll/thirteenth-month/accrue` | `@accrue` | manager,admin | monthly accrual | ✅ |
| POST | `/api/manager/payroll/thirteenth-month/{accrual}/pay` | `@pay` | manager,admin | mark paid | ✅ |
| POST | `/api/manager/payroll/{payroll}/approve` | `Api\PayrollController@approve` | manager,admin | draft→pending | ✅ concurrent-safe |
| POST | `/api/manager/payroll/{payroll}/release` | `Api\PayrollController@markAsPaid` | manager,admin | pending→paid | ✅ transactional + outbox email |
| GET | `/api/manager/payroll/{payroll}` | `Api\PayrollController@show` | manager,admin | single record | ✅ |
| PUT | `/api/manager/payroll/{id}` | `Api\PayrollController@update` | manager,admin | edit draft/pending | ✅ recompute enforced |
| GET | `/api/manager/payroll/{payroll}/payslip` | `PayrollController@payslip` | manager,admin | payslip JSON | ✅ F-001 aligned |
| GET | `/api/manager/reports/payroll` | `Admin\ReportsController@managerPayroll` | manager,admin | payroll report | ✅ F-001 aligned |
| GET | `/api/manager/staff/{id}/payroll` | `Api\PayrollController@index` | manager,admin | per-staff list | ✅ |
| GET | `/api/my-payroll` | `PayrollController@myPayroll` | any staff auth | own records | ✅ self-scoped |
| GET | `/api/my-payroll/{id}/payslip` | `PayrollController@payslip` | any staff auth | own payslip | ✅ IDOR 403 |

Wildcard-order note in `routes/api.php` (static `compute/generate/thirteenth-month` before `{payroll}`) verified — `compute` resolves correctly, not swallowed by the wildcard.

## 2. Executed security probes (this audit + carried phase12 evidence)

| Probe | Result |
|---|---|
| Unauthenticated `GET /api/manager/payroll` | 401 ✅ |
| `customer` → manager payroll | 403 ✅ |
| `receptionist`/`cashier`/`inventory`/`veterinary` → manager payroll | 403 each ✅ (prior evidence + phase12) |
| `cashier` → `POST generate` | 403 ✅ (phase12 executed) |
| `cashier` → `POST {id}/approve` | 403 ✅ (phase12 executed) |
| `cashier` → another employee's `/my-payroll/{id}/payslip` | 403 ✅ |
| Missing payroll id → show/approve/payslip | 404 ✅ |
| Approve already-`paid` row | 422 ✅ (phase12) |
| Release non-`pending` row | 422 ✅ (`release requires pending status` test) |
| Tampered `gross_pay`/`net_pay` via `POST store` | **was persisted (F-002) → now recomputed** ✅ regression test |
| Duplicate `generate` same period | no duplicates (unique user/employee+period + updateOrCreate) ✅ |
| Concurrent `generate` ×2 | single row set ✅ (phase12 race evidence) |
| Concurrent `approve` ×2 | single logical transition ✅ (phase12) |
| Mass assignment of `status`/`processed_by` via store/update | blocked — status forced `draft`, transitions only via approve/release ✅ |
| Update `paid`/`approved` row | rejected ✅ (`update cannot set paid or approved status`) |

## 3. Validation & response conventions

- `store`/`update` validate person refs (`user_id`/`employee_id`/`employee_name`), semi-monthly
  dates, numeric money fields ≥0, `manual_attendance` array. Non-semi-monthly periods rejected
  (`2026 period validation accepts only semi monthly cutoffs` test).
- Responses: `{success, message, data}` envelope; `store` returns 200 (module convention — kept,
  reproduction test asserts the actual contract). Error paths return 403/404/422 as tabled above.
- Payslip JSON: `{company_name, earnings{…}, deductions{…,total_deductions}, net_pay, attendance{…},
  status, payment_*}` — post-F-001 `total_deductions` excludes attendance lines (already inside
  `earnings.gross_pay`); deduction lines remain for display.

## 4. N+1 / query notes

`index` paginates with `user`/`employee`/`processor` eager-loads; `compute`/`generate` batch-load
attendance per period range — no N+1 flagged in tests. Reports compute aggregates from a single
`payrolls` pull.

## 5. Side effects audit (approve/release)

`markAsPaid` runs inside a transaction: status→paid + `payment_date/method` + salary-loan
settlement + `email_deliveries` payslip-intent insert (occurrence-deduped). Executed tests prove:
settle-once, rollback of both status and loan on simulated failure, no email for non-account
employees, non-manager cannot release, repeated release does not duplicate the intent.
