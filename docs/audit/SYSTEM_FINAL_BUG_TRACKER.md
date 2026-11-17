# System Final Bug Tracker

**Date:** 2026-11-17

| ID | Module | Finding | Severity | Reproduction | Root Cause | Fix | Test Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYS-001 | E2E infra | `phase4-payment-workflow.spec.js` — all 7 tests error: `'${process.env.PHP_BINARY || 'php'}' is not recognized` | P3 | Run spec on Windows | `execSync` interpolates bash `${...}` syntax; Windows cmd can't parse it | none (env/test-infra) | run output | **CLOSED — command built from JS vars + E2E_API_URL `/api` normalization; spec now 7/7** |
| SYS-002 | Reports UI | `phase12-reports-reconciliation` lifecycle test fails: CSV total (₱13,735/93 rows) ≠ API summary (₱1,850) | P3 | Run spec | `AdminLiveReport` always shows current **month** — no custom date-range control exists in the UI; spec probed API for today only. Export **does** match displayed data | none needed; date-range picker is a feature gap | CSV + spec code + component source | **OPEN — test-design mismatch + missing custom date filter (feature gap, not defect)** |
| SYS-003 | Inventory UI | `phase12-inventory-workflow` lifecycle fails on `toContainText(/discrepancy/)` after save | P3 | Run spec | Save POST **200** confirmed; `fetchAuditItems()` refetch + re-render exceeds the 5s assertion window on slow Windows host | none (timing) | error-context snapshot (row present, save 200) | **CLOSED — assertion now awaits the audit-row GET refresh; spec 3/3** |
| SYS-004 | Payroll | Unrouted legacy `PayrollController::update`/`processPayment` can write `paid` | P3 | `route:list` | dead code paths — not routed | none (documented L-01) | route:list | **OPEN — dead code, unreachable** |
| SYS-005 | Payroll | Unlinked payroll rows still trust entered totals (gated by maker-checker, not eliminated) | P3 | design review | free-text rows have no authoritative person record | Option C gate implemented | `PayrollFinalizationTest` | **ACCEPTED RISK — management may choose Option B later** |
| SYS-006 | Auth | PAT tokens are long-lived; no TTL/rotation policy | P3 | config review | default Sanctum behavior | production hardening item (R-03) | n/a | **OPEN — deployment gate** |
| SYS-007 | Reports | Exhaustive per-route policy sweep not 100% line-by-line | P3 | security audit | sampled coverage | n/a | `SECURITY_FINDINGS.md` | **OPEN — R-02 hardening item** |
| SYS-008 | Payroll | `pawesome` row PAY-2026-0001 has zero statutory deductions | P3 | read-only query | possibly intentional | business review only | reconciliation doc | **FLAG — needs business confirmation, not a code defect** |

## Previously fixed (this audit cycle — verified)

| ID | Finding | Fix | Status |
| --- | --- | --- | --- |
| F-001/002/003, M-01, M-02 | payroll defects | implemented + tested | FIXED |
| CUR-001 | `PHP {x}` displays in `VetAppointmentBilling` | `formatCurrency` | FIXED |
| CUR-002 | ~55 duplicate/inline peso formatters, `₱-500` negative form, `₱ ` stray space | consolidated to shared formatter | FIXED |

**P0: 0 · P1: 0 · P2: 0 · P3: 8 open** — every open item is test-infra/env, a documented feature gap, an accepted risk, or a production-hardening item. No confirmed application defect remains.
