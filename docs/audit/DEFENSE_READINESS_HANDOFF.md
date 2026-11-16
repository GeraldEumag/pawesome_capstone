# Defense-Readiness Handoff — Action Needed Before the Demo

**For the next person (or Devin) working on this repo — read this first.**

A full defense-readiness audit was run on **2026-11-17** against an isolated copy of the
database. No application code was changed during the audit. The system is in **good shape**:
986 backend tests pass, 33 frontend tests pass, and a 98-step live probe of every role
passed with zero failures. Duplicate submissions, double approvals, last-item races,
price tampering, ID guessing, fake tokens, bad uploads, and injection-style input were
all handled correctly.

## The ONE thing that must be fixed before the defense

**The Sales Report returns an empty report whenever a date filter is used.**

- Endpoints affected: `GET /api/manager/reports/sales` and `GET /api/admin/reports/sales`
- Symptom: report works with **no** filter (shows all sales), but adding **any**
  `start_date`/`end_date`/`from`/`to` returns zero rows — even though sales exist.
- Why it matters: a panelist's natural demo is "make a sale → open today's sales report."
  They would see "No records found" — a live-demo credibility hit.

### Root cause (confirmed by direct SQL reproduction)

In `backend/app/Http/Controllers/Admin/ReportsController.php`, the `sales()` method:

1. Builds a query on `sales` and `leftJoin`s `users as cashiers` — both tables have a
   `created_at` column.
2. Applies `whereDate('created_at')` **unqualified** → MySQL error **1052**
   (`Column 'created_at' in where clause is ambiguous`).
3. A blanket `catch (\Exception)` swallows the error and returns `200 success` with an
   empty dataset — so a real failure looks like "no data."

### Required fix (Phase A)

1. Pass a qualified column to the date-range helper in `sales()` — e.g.
   `'sales.created_at'` instead of `'created_at'`.
2. Replace the blanket `catch → 200 + empty` in `sales()` with a logged error and a
   non-200 (or explicit `error` field) so a broken report can never masquerade as
   an empty one.
3. Add a feature test asserting a date-filtered sales report returns rows.

After the fix, re-verify: make a POS sale, open the sales report filtered to today,
and confirm the sale appears. Then re-run `php artisan test`.

## Also queued (not urgent for the demo)

- **Gate scripts** (`C:/xampp/pawesome-maintenance/`): Gate A generates invalid
  :31–:59 minute slots and pre-open hours; Gates C/D query the retired
  `vet_appointments` table; Gate B still expects admin to be blocked from staff
  routes (admin is *designed* to reach all staff modules). These are script bugs,
  not app bugs.
- **Before real deployment** (already on the release checklist): `APP_DEBUG=false`,
  `APP_ENV=production`, real DB password, queue worker + scheduler, CORS allow-list.
- **Not yet verified:** real email sends (Brevo), Telegram bot, MySQL 8 parity,
  full Playwright UI pass.

## Where the full details are

| Document | Purpose |
| --- | --- |
| `docs/audit/FINAL_DEFENSE_READINESS_AUDIT.md` | Technical report — every test, finding, and evidence link |
| `docs/audit/FINAL_DEFENSE_READINESS_AUDIT_PLAIN.pdf` | Plain-language version for sharing |
| `browser-evidence/final-defense-readiness/` | Evidence: 98-step probe results, gate logs, SQL reconciliation |

**Bottom line:** everything else holds up under pressure — fix the sales-report date
filter, re-verify that one screen, and the system is defense-ready.
