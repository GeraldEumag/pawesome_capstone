# M-02 — FREE-TEXT MANUAL PAYROLL POLICY

**Status: DECIDED (Option C) & IMPLEMENTED & VERIFIED**

## Investigation summary

Free-text rows (`user_id` NULL, `employee_id` NULL, `employee_name` free-text) are created via `POST /api/manager/payroll`. Because no person record is linked, salary/attendance/loans cannot be derived — entered financial totals are trusted by necessity. Previously they could be created, approved, and released entirely by one person.

## Approved policy — Option C (user decision)

**Keep the feature, require a different authorized approver (maker-checker), server-enforced.**

## Implementation (no new tables/endpoints)

- `Payroll::getIsUnlinkedAttribute()` — `user_id IS NULL && employee_id IS NULL`; appended to API payloads.
- `Api\PayrollController::approve()` — rejects self-approval of unlinked rows (creator = `processed_by` at that moment) with 422; now stamps `approved_by`/`approved_at` (previously always NULL).
- `Api\PayrollController::markAsPaid()` — unlinked rows require `approved_by` non-null (proof the gated `approve()` ran); plus a `status === 'pending'` gate so draft/cancelled rows can't be paid. Blocks the `PUT {status:'pending'}` bypass since `update()` never writes `approved_by`.
- `PayrollManagement.jsx` — `.payroll-manual-badge` "· Manual" label + person-type filter ("With Account" / "Staff Member (No Account)").
- `ReportsController` — `person_type` distinguishes account-backed vs employee-record vs unlinked rows.

## Coverage of every release path

| Path | Gate |
| --- | --- |
| `POST /{id}/approve` | maker-checker 422 on self-approval |
| `POST /{id}/release` | requires `approved_by` for unlinked rows + `pending` status for all |
| `PUT /{id}` | `status` allowed values exclude `paid`; can't write `approved_by` |
| Legacy `PayrollController::processPayment` | **unrouted** (verified via `route:list`) — dead path, documented |
| `PayrollFinalizationTest` covers: self-approve 422, cross-approve+release 200, PUT-bypass 422, linked-row self-approve still allowed | all PASS |

## Residual notes

- Unlinked rows still don't generate payslips (no `user` → no email intent — preserved behavior, verified by `Phase4InventoryPayslipTest::test_release_without_account_user_sends_no_email`, fixture updated to a properly-approved row).
- Historical unlinked rows created before this gate are unaffected (none exist on `pawesome` — see reconciliation report).
