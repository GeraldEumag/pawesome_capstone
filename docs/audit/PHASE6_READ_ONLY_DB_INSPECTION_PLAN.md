# Phase 6 Read-Only Database Inspection Plan

Status: **PLAN ONLY — the configured application database was not accessed.**

The user has not authorized connecting to the configured application
database. No database credentials were read and no connection or query against
that database was attempted. This plan is a gate for a later, explicitly
approved inspection; it performs no repairs.

## Authorization and connection gate

Before execution, obtain explicit approval that names the exact host, schema,
environment, permitted time window, and authorized operator. Use a dedicated
read-only account with `SELECT` on the target schema and metadata views only.
Do not use the application's write-capable `.env` credentials.

At connection start, record only the approved target identity and verify it
before any data query:

```sql
SELECT DATABASE() AS selected_schema,
       CURRENT_USER() AS inspection_account,
       @@hostname AS database_host,
       @@read_only AS server_read_only;
```

Abort unless the returned schema/host/account match the written approval and
the account cannot write. Do not run migrations, seeders, commands, `SELECT ...
FOR UPDATE`, temporary-table writes, or mutation scripts. Do not export
personal data; report aggregate counts and redacted examples only if separately
authorized.

## Ordered, read-only checks

First inspect physical definitions and indexes through
`INFORMATION_SCHEMA.COLUMNS`, `TABLE_CONSTRAINTS`,
`KEY_COLUMN_USAGE`, and `STATISTICS` for `attendance`,
`attendance_corrections`, `attendance_records`, `leave_requests`,
`leave_balances`, and `payrolls`. Confirm physical column names before running
the dependent checks below. The statements are templates, not pre-approved
queries.

### Attendance

```sql
SELECT user_id, date, COUNT(*) AS row_count
FROM attendance
WHERE deleted_at IS NULL AND user_id IS NOT NULL
GROUP BY user_id, date HAVING COUNT(*) > 1;

SELECT employee_id, date, COUNT(*) AS row_count
FROM attendance
WHERE deleted_at IS NULL AND employee_id IS NOT NULL
GROUP BY employee_id, date HAVING COUNT(*) > 1;

SELECT COUNT(*) AS ownerless_rows
FROM attendance
WHERE deleted_at IS NULL AND user_id IS NULL AND employee_id IS NULL;

SELECT COUNT(*) AS dual_owner_rows
FROM attendance
WHERE deleted_at IS NULL AND user_id IS NOT NULL AND employee_id IS NOT NULL;

SELECT COUNT(*) AS orphan_user_rows
FROM attendance a LEFT JOIN users u ON u.id = a.user_id
WHERE a.deleted_at IS NULL AND a.user_id IS NOT NULL AND u.id IS NULL;

SELECT COUNT(*) AS orphan_employee_rows
FROM attendance a LEFT JOIN employees e ON e.id = a.employee_id
WHERE a.deleted_at IS NULL AND a.employee_id IS NOT NULL AND e.id IS NULL;

SELECT status, source, COUNT(*) AS row_count
FROM attendance WHERE deleted_at IS NULL
GROUP BY status, source ORDER BY status, source;
```

Check ownership mismatches (such as `attendance.user_id` linked to an employee
whose `employees.user_id` is different) only after confirming that relationship
is intended in the physical schema.

### Corrections

Inspect requester, attendance, and reviewer joins; aggregate counts for
orphaned references, pending requests older than the approved review SLA,
reviewed rows missing reviewer/time, and invalid status values. Compare
original/requested punch fields with the linked attendance state without
altering either. The newly added original-punch and cancellation-audit
migrations must first be confirmed present in `INFORMATION_SCHEMA`; they have
not been applied to the application database in this phase.

### Leave

Use a self-join of approved leave requests by `user_id` and intersecting date
ranges to report overlap counts. Separately aggregate approved
`days_counted` by type/year and compare with available balance data and
attendance `on_leave` rows. Report cross-year spans, fractional days, cancelled
requests with remaining leave attendance, and cancelled rows with non-null
cancellation attribution. This is reconciliation only; do not infer or repair
policy.

### Payroll

Inspect approved/paid payroll rows for missing approver metadata, duplicate
period/person rows, and period snapshots. Compare attendance
`updated_at`/correction review time with payroll approval/payment times only
where the physical fields and timezone semantics are confirmed. Report
counts of post-approval/post-payment attendance changes; do not recompute
payroll or update any row.

### Legacy `attendance_records`

Inspect table definition, indexes, row counts by date/status/source, and
foreign-key/orphan counts. Before any migration or deprecation, search
application routes, scheduled jobs, reports, frontend/API consumers, and
external integration contracts. This plan authorizes no removal or migration.

## Output and stop conditions

The inspection report must identify target, read-only account, timestamp,
tables/columns inspected, aggregate results, query errors, and limitations.
Stop if a schema differs from the reviewed migrations, unexpected production
host/schema is returned, the account has write privileges, or a query would
require exposing unapproved personal data. Provide findings and a separate
corrective migration proposal for review; do not repair data during this
inspection.
