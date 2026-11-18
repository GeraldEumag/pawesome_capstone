# Phase 9 — End-to-End Payroll Journey Verification Report

Date: 2026-11-19
Environment: **isolated** stack — dedicated DB `pawesome_phase9_e2e`, `php artisan serve` on `127.0.0.1:8039`, `MAIL_MAILER=log`, `QUEUE_CONNECTION=database`.

## A. Database Isolation

- `pawesome_phase9_e2e` created new (name verified absent first); 191 migrations applied cleanly.
- `pawesome` (dev DB) was **not** mutated; `pawesome_test` was **not** touched or rebuilt.
- Incident found and mitigated: a pre-existing server was already bound to :8010 (part of a concurrent agent's worker pool on :8000–:8014+) answering requests against `pawesome`. Early login failures were logged to `pawesome.login_logs` (read-only side effect of a failed login attempt to a user that doesn't exist there — no data written). The isolated stack was moved to verified-free port :8039. **Lesson: always verify port ownership before trusting a local API endpoint.**
- Concurrent-agent activity on this machine is still live; the contention risk on `pawesome_test` from Phase 8 therefore remains unresolved — full-suite reruns must still wait for ownership confirmation.

## B. The Complete Employee Payroll Journey — VERIFIED end-to-end via live HTTP

Synthetic data only: `p9.mgr@test.local` (manager) and `p9.emp@test.local` (cashier, ₱26,000/mo).

| Step | Action | Result |
|---|---|---|
| 1 | Employee login + `POST /api/attendance/check-in`, `check-out` | 200/200 — attendance id=1, source `web` |
| 2 | Employee submits correction `POST /api/my-attendance/corrections` (08:00→17:00) | 201 |
| 3 | Manager lists pending + approves | 200 — correction `approved`, reviewed_by=1; new attendance row 08:00–17:00 |
| 4 | `POST /api/manager/payroll/compute` → `generate` (Nov 16–30) | 200 — preview/generate consistent; semi-monthly base ₱13,000 |
| 5 | `POST …/payroll/2/approve` | 200 |
| 6 | `POST …/payroll/2/release` | 200 — status `paid`, method Bank Transfer |
| 7 | Duplicate release | **422 — no double-pay** |
| 8 | Approve after release | **422 — lock enforced** |

## C. Financial Reconciliation (persisted payroll id=2 vs payslip vs PDF vs remittance)

| Field | Payroll row | Payslip JSON | PDF (pdftotext) | Remittance |
|---|---:|---:|---:|---:|
| Gross pay | 12,000.00 | 12,000.00 | 12,000.00 | — |
| Net pay | 10,848.73 | 10,848.73 | 10,848.73 | — |
| SSS (EE) | 650.00 | 650.00 | 650.00 | 650 (ER 1,315) |
| PhilHealth | 325.00 | 325.00 | 325.00 | 325 / 325 |
| Pag-IBIG | 100.00 | 100.00 | 100.00 | 100 / 100 |
| Tax | 76.28 | 76.28 | — | — |

Composition: ₱13,000 base + ₱1,000 regular-holiday pay − ₱2,000 absent (2 unworked days) = ₱12,000 gross. Regular hours 8.00, zero late/undertime — the approved correction flowed correctly into payroll. PDF is a valid %PDF-1.7, 30 KB, shows `PAY-2026-0002`, employee name, period, and all figures above.

## D. Email Outbox & Delivery Pipeline — VERIFIED

- Release created exactly **one** `email_deliveries` intent: `payroll.payslip_released`, occurrence_key `payroll.payslip:2`, recipient **encrypted at rest**. The rejected duplicate-release produced no second intent.
- `email-deliveries:dispatch` → `SendEmailDelivery` on `emails` queue → `DONE` in ~5s (renders mailable + PDF).
- Delivery row: `status=accepted`, `attempts=1`, `dispatched_at`/`accepted_at` recorded.
- `storage/logs/laravel.log` contains the rendered email: subject *"Payslip Released"*, addressed to *P9 CASHIER*, period *Nov 16 - Nov 30, 2026*, attachment `Payslip-PAY-2026-0002.pdf` (application/pdf).
- Semantics: `accepted` = local mailer accepted the send. Provider delivery/open are **not** claimed (log driver, per approved plan).

## E. Not verified / remaining

| Item | Status |
|---|---|
| Full Playwright browser E2E | **Not run** — a worker pool on :8000–:8014+ owned by the concurrent agent blocks safe isolation; needs a dedicated frontend (Vite with `VITE_API_BASE_URL=http://127.0.0.1:8039/api`) on a free port. |
| Email retry/failure path | Intent dedup + accepted state verified; a forced-failure retry was not simulated. |
| Overnight & holiday-pay scenarios through full journey | Holiday premium appeared (₱1,000) in this run; a dedicated overnight-shift journey remains. |
| `pawesome_test` contention | Still owned by a concurrent process — full backend suite rerun still blocked. |
| Overtime approval policy, non-account corrections, `attendance_records` deprecation | Unchanged from Phase 8 — management decisions pending. |

## F. Readiness

The payroll release path — attendance → correction → compute/generate → approve → release → payslip → PDF → outbox → queue → mailer → remittance — is **verified working end-to-end at runtime** on an isolated environment, with release dedup, post-release locks, encrypted recipients, and exact payroll↔payslip↔PDF↔remittance parity.

Status remains **READY FOR INTERNAL TESTING** — pending browser E2E and test-DB contention resolution before UAT consideration.
