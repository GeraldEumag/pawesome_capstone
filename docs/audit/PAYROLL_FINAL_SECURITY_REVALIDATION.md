# PAYROLL FINAL SECURITY REVALIDATION

**Date:** 2026-11-17 · Backend `pawesome_test` (feature tests) + `pawesome_e2e_audit` (browser/API).

## Access control matrix (executed)

| Actor | Manager payroll API | Approve | Release | Own payslip | Other payslip |
| --- | --- | --- | --- | --- | --- |
| Unauthenticated | 401 | 401 | 401 | 401 | 401 |
| cashier / employee | 403 | 403 | 403 | 200 | 403/404 (IDOR) |
| manager | 200 | 200 | 200 | 200 | 200 |
| admin | 200 | 200 | 200 | — | 200 |

## Tampering / privilege checks (executed)

| Probe | Result |
| --- | --- |
| Spoofed `gross_pay`/`net_pay` on linked row | Ignored — server recompute (F-002) |
| Spoofed `status`/`approved_by`/`processed_by` on store | Ignored — force-set to draft + `Auth::id()` |
| Negative deduction values | 422 (`min:0`) |
| `PUT` unlinked row to `pending` then release | 422 — `approved_by` gate (M-02) |
| `PUT` mass-assign `approved_by`/`processed_by` | Not validated — cannot be written |
| Self-approve own unlinked row | 422 maker-checker |
| Cross-manager approve unlinked row | 200 + `approved_by`/`approved_at` stamped |
| Payroll-ID reuse after soft delete | Prevented (`withTrashed()` MAX) |
| Unique-ID race under concurrent insert | Retried to next free suffix |
| Employee payslip for foreign id | 403/404 — IDOR held (E2E test 3) |
| Paid/cancelled row edits | Rejected by `update()` status guard |

## Notes

- Frontend visibility is not relied on for security — every check above is enforced server-side.
- Role model unchanged: `manager` = payroll operator, `admin` = override. No new roles.
- `payroll` enum value remains unused; `super_admin` normalizes to `admin`; `super_receptionist` unchanged.
- Legacy unrouted `App\Http\Controllers\PayrollController` methods (`update`/`processPayment`) can write `paid` but are unreachable — documented dead paths, flagged L-01 (not patched per scope).
