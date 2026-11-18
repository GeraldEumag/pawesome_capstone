# Customer Role — Final Readiness Verdict (Gate 4)

**Audit date:** 2026-11-18 · **Stack:** isolated `pawesome_customer_audit`, API `:8001`, frontend `:3001`
**Method:** every claim below is backed by DB-inspected rows on the audit database, live API probes with dual-customer fixtures, and the regression suites listed in CUSTOMER_REGRESSION_RESULTS.md.

## Verdict: **TECHNICALLY READY FOR FINAL VALIDATION**

Not RELEASE READY — remaining items are environment/deployment gates, not application defects (see Remaining risks).

## Evidence summary

| Gate | Result |
| --- | --- |
| 0 — Isolated stack | PASS. `pawesome_customer_audit` created/migrated/seeded; write-probe proved audit DB effective; dev `pawesome` verified untouched (0 new tokens/rows). |
| 1 — Discovery & baseline | PASS. 145 customer-relevant routes mapped (gate1-customer-routes.txt); scope docs produced; baseline backend 133 tests + e2e baseline captured. |
| 2 — Security | PASS. **0 P0 / 0 P1.** Full IDOR matrix denied (pets, requests, boardings, groomings, confinements, proofs, receipts, vacc cards, pet photos, live chat, notifications); mass-assignment of role/status/price/ownership fields all neutralized (DB-verified); staff prefixes 403 / unauth 401; verified-email gate enforced; file MIME/size/extension validation + private disk + per-owner file authorization; payment state machine unforgeable (customer cannot reach `paid`); F-02 descope boundary correct (410 ×3, reads preserved). |
| 3 — Functional + cross-role | PASS. Register→verify→book→approve→proof→cashier-verify→paid+receipt→notify, vet-assignment, boarding room reservation + check-in gates, live chat staff reply — all persisted in audit DB and visible to both customer and staff sides. Real Brevo sends: 26 deliveries `accepted`. |
| 4 — Regression | PASS. Backend customer suite **291/291** (1338 assertions); vitest **44/44**; production build green; customer e2e **all pass** (parallel run 36 + 3 skipped re-run serially 6/6 — one Windows socket flake). |

## Modified files (this audit)

- `frontend/e2e/customer-*.spec.js` — 11 files: normalized `E2E_API_URL` handling (CUST-H01, harness fix).
- `docs/audit/CUSTOMER_*.md` — 8 audit deliverables (this set).
- `docs/audit/SYSTEM_AUDIT_TRACKER.md` — tracker entry.
- `browser-evidence/customer-audit/` — probe/route/baseline evidence.
- **No application code changed** — no defects required a fix.

## Remaining risks / follow-ups

| Sev | Item |
| --- | --- |
| Low | Local runs are MariaDB 10.4.32; CI MySQL 8 remains the authoritative parity signal. |
| Low | `GET /customer/grooming/{id}` resolves to legacy `GroomingController` (GroomingAppointment) — owner-safe, frontend-unused; candidate for a future route-consolidation cleanup. |
| Low | Shared local storage across stacks (row-level isolation only on local driver). |
| Low | `CustomerReports.jsx` conditionally calls `/admin/reports/customers` when pathname starts `/admin/reports/customers` — dead path inside customer portal (customer is always under `/customer/*`); harmless but worth a cleanup ticket. |
| Env | Gate B/C/D maintenance scripts were **not executed** (they bootstrap dev-DB `.env`); equivalent coverage achieved via DB-verified probes. If required for the release record, rerun with `DB_DATABASE=pawesome_customer_audit` + independent `DB::connection()->getDatabaseName()` check first. |
| Env | One e2e flake under 2-worker load (socket exhaustion, known Windows issue); passes serially. |
| Deploy | Release checklist items remain deployment-level: queue worker for `emails` queue, SPF/DKIM/DMARC on a real sending domain, S3 private bucket, APP_DEBUG=false — per AGENTS.md release checklist. |

## What a real customer can now provably do

Register → receive Brevo verification email → verify → book vet/grooming/hotel (verified-only) → upload proof (private, validated) → see receptionist approval + schedule + room → see cashier verification + VAT receipt → track every stage → receive in-app + email notifications → chat with staff → never see another customer's data, never self-mark paid, never reach staff or store-mutation surfaces.
