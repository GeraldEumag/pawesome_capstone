# 10 — Production Smoke Tests

## Status: BLOCKED — cannot execute until backend + frontend are deployed

The runbook §C checklist is fully prepared (report 14 of release audit +
checklists in reports 08/09). All 27 test items below are **NOT RUN**
against production — they require live URLs that don't exist yet.

## Prepared test matrix (will execute post-deploy)

| # | Test | Account/Role | Expected |
| --- | --- | --- | --- |
| 1 | `GET /api/health` | none | 200 `{"status":"ok"}` |
| 2 | `GET /up` | none | 200 |
| 3 | `GET /.env` | none | 404/403 |
| 4 | Staff login | admin + 1 role | Token issued; dashboard loads |
| 5 | Customer registration | new test customer | Account + verification email intent |
| 6 | Verification email | test inbox | Email received; verify link works |
| 7 | Email verification | same | `email_verified_at` set; booking unlocked |
| 8 | Pet registration | test customer | Pet created |
| 9 | Pet photo upload | test customer | Stored on private disk; viewable by owner |
| 10 | Appointment booking | test customer | Booking in receptionist queue |
| 11 | Receptionist queue | receptionist | Sees the booking |
| 12 | Species mismatch | incompatible pet/service | 422 rejection |
| 13–16 | Inventory CRUD + stock in/out + history | inventory role | Rows + movement ledger |
| 17 | POS sale | cashier | Sale completes |
| 18 | VAT-inclusive total | same | Receipt math = gross − extracted VAT |
| 19 | Stock deduction | same | Stock decremented atomically |
| 20 | Receipt/PDF render | same | Document renders with logo |
| 21 | Payment-proof access | customer vs other customer | Own=200, other=403 |
| 22 | Email outbox | system | `email_deliveries` drains; worker processes |
| 23 | Scheduled task | system | `schedule:work` entries fire (logs) |
| 24 | Queue worker | system | `jobs` processed; `failed_jobs` empty |
| 25 | Frontend↔API | browser | No CORS/console errors; data loads |
| 26 | Role restrictions | each role | Forbidden endpoints → 403 |
| 27 | Customer/staff separation | customer token on staff route | 403 |

## Rules carried forward

- Designated test accounts only; no real customer data touched.
- No real financial transactions — test records only.
- Each result will record: preconditions, steps, expected/actual,
  timestamp, evidence, pass/fail.

**Status: ALL NOT RUN — blocked on deployment.**
