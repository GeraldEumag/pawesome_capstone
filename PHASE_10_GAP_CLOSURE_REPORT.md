# Phase 10 — Production-Readiness Gap Closure & Regression Audit

Date: 2026-11-19. Baseline: `PHASE_9_E2E_VERIFICATION_REPORT.md` (all Phase 9 behaviors re-verified unchanged unless noted).
Environment unchanged: isolated `pawesome_phase9_e2e`, API on `127.0.0.1:8039`, `MAIL_MAILER=log`, database queue.

## 1. Port-Pool Ownership — RESOLVED (no processes touched)

- Ports `8000–8014+` are owned by `php-worker-pool.js` (`C:/xampp/pawesome-maintenance/`, PID 22096, node.exe) proxying `php -S` workers on `8001+` (e.g. PID 22860→:8010, 2780→:8001). This is the documented E2E infrastructure from AGENTS.md, launched by a **concurrent agent** — left running, not modified.
- This confirms the Phase 8/9 `pawesome_test` contention source is a live co-agent running its own E2E stack. `pawesome_test` remains untouched; full-suite rerun still gated on that agent finishing.
- `pawesome` was not mutated. (One failed-login audit row in `pawesome.login_logs` from the earlier port collision — read-only side effect, noted in Phase 9.)

## 2. Email Forced-Failure & Retry — VERIFIED

Using dead-SMTP (`MAIL_MAILER=smtp` → 127.0.0.1:1) against intent `payroll.payslip:3`:

| Stage | Result |
|---|---|
| Send attempt fails | `status=pending`, `failure_class=retryable`, `attempts=1`, `next_attempt_at` scheduled (+60s) — delivery not lost |
| `email-deliveries:dispatch` after backoff | `Dispatched 1 pending` |
| Retry with working mailer | `status=accepted`, `attempts=2`, `accepted_at` set |
| Intent count for `payroll.payslip:3` | **1** — retry creates no duplicate intents, no duplicate payslips |
| Rendered mail in log | `Payslip-PAY-2026-0003.pdf` present exactly once (one send) |

Verdict: outbox retry is safe — dedup held, failure is visible (`failure_class`, `next_attempt_at`), and recovery completes without duplicates.

## 3. Overnight Payroll Scenario — RUN with a real finding

Setup: synthetic night-shift employee (`users.work_start_time=22:00`, `work_end_time=06:00`), attendance 22:00→06:00(+1).

**First run — P2 defect confirmed:** payroll lateness uses `CompanySchedule`, which reads **only** `system_settings` (`shift_start`/`shift_end`). Per-user `work_start_time`/`work_end_time` are never consulted → the on-time 22:00 punch was evaluated against the 08:00 default → **₱1,750 phantom late deduction** (840 min × ₱125/hr). Unit tests never caught this because they set the company schedule.

**Second run (company schedule set to 22:00–06:00, supported single-shift model):** `compute` → late 0, undertime 0, regular 7h, `night_differential` ₱100.00 (8h × 10% × ₱125), gross ₱12,100, net ₱10,933.73 — matches the unit-verified overnight math.

## 4. NEW DEFECT — P1: `generate` never refreshes stale drafts; `release` doesn't re-validate

- `Api\PayrollController::generate` skips any existing payroll for employee+period into `$skipped` — a **draft is never recomputed** even if attendance or schedule changed.
- Consequence proven at runtime: payroll id=3 was generated under the 08:00 schedule (late ₱1,750, gross ₱10,350); after the schedule correction, `compute` reported gross ₱12,100 — but `generate` returned the stale draft, and `approve`+`release` paid it. **Released figures diverged from current computation by ₱1,750 late / ₱1,583 net.**
- Design decision needed: refresh `draft` rows on `generate`, require explicit void→regenerate, or re-validate totals at `release`. Not patched pending that decision (policy choice).

## 5. Regression vs Phase 9 baseline

| Phase 9 behavior | Status after Phase 10 |
|---|---|
| Clock-in/out → correction → approve → payroll → release → payslip → outbox → remittance | Unchanged; id=2 payroll intact, delivery id=1 `accepted` |
| Duplicate release 422, post-release approve 422 | Unchanged |
| Payslip↔payroll↔PDF↔remittance parity | Unchanged (verified for payroll 2) |
| Release dedup / encrypted recipient | Unchanged + now retry-verified |

## 6. Findings register

| ID | Sev | Finding | Action |
|---|---|---|---|
| P10-1 | P1 | `generate` skips existing drafts; stale figures releasable | Decide: refresh drafts / void-regenerate / release-time recompute |
| P10-2 | P2 | Per-user `work_start_time`/`work_end_time` ignored by payroll; night-shift employees get false lateness unless company schedule is set | Honor per-user shift or remove/document the fields |
| P10-3 | — | Ports 8000–8014 belong to concurrent agent's worker pool | Resolved — documented, not touched |

## 7. Remaining gaps

- Playwright browser E2E still not run (needs dedicated Vite port + confirmation the co-agent's pool can share the machine).
- `pawesome_test` ownership/contention unresolved — full backend suite still blocked.
- The released payroll id=3 in the isolated DB intentionally retains wrong figures as evidence of P10-1.
- Company schedule on the isolated DB left at 22:00–06:00 (documented; disposable DB).

**Readiness: READY FOR INTERNAL TESTING** — unchanged; P10-1 (stale-draft release) should be fixed before payroll is trusted in UAT.
