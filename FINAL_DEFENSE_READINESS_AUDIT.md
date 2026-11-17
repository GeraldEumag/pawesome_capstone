# Final Defense-Readiness Audit — Pawesome Capstone

**Audit date:** 2026-11-17 · **Branch:** `main` @ `a7f93ca` · **Auditor:** Devin (autonomous re-audit)
**Scope:** Full live re-audit, all modules, all roles. **No application source, configuration, or schema was modified.**

---

## 1. Executive summary

Pawesome was re-audited end-to-end for live-demonstration readiness. The system is in strong shape:
986 backend tests pass, 33 frontend unit tests pass, the production build compiles, a 98-step
live defense probe covering all roles completed with **zero failures**, and every transaction
integrity control probed (idempotency, row locking, server-side pricing, FEFO stock deduction,
conflict-safe booking) behaved correctly under adversarial input.

**One confirmed application defect** was found and reproduced:

- **P1 — Date-filtered Sales report always returns empty.** `Admin\ReportsController::sales()`
  applies `whereDate('created_at')` unqualified while the query joins `users` (which also has
  `created_at`) → MySQL error 1052 → swallowed by a blanket `catch` → returns `200 success`
  with "No records found". Any panelist who makes a sale and then filters the Sales report by
  date sees an empty report — a live-demo credibility risk. Affects `/manager/reports/sales`
  and `/admin/reports/sales` (same controller method). No data is corrupted; the fix is a
  one-line column qualification plus removing the mask.

Three tooling findings (stale maintenance-gate fixtures) and three environment/deploy notes were
also recorded — none are application defects.

| Metric | Result |
| --- | --- |
| Backend suite (`pawesome_test`, MariaDB) | **986 passed / 1 skipped / 0 failed** — 4,929 assertions, 335.9 s |
| Frontend unit tests (Vitest) | **33/33 passed** (8 files) |
| Production build (Vite) | **Success** in 38.8 s (chunk-size warnings only) |
| Live defense probe | **98 steps / 0 failures** across 10 scenario groups |
| Manual report reconciliation | Payments & overview consistent with SQL; **sales report broken under date filter** |
| Route surface | 722 API routes · 693 auth-protected · 34 public · 0 frontend→backend gaps |
| Confirmed app defects | **1 (P1)** |
| NOT VERIFIED | External providers (Brevo, Telegram), MySQL 8 parity, full Playwright UI pass |

---

## 2. Architecture assessment

### Audit environment

| Component | Value |
| --- | --- |
| Isolated mutation DB | `pawesome_e2e_audit` (XAMPP MariaDB 10.4.32, 127.0.0.1:3306) |
| Read-only dev DB | `pawesome` (inspection only — verified unmutated) |
| API instances | `:8000` (gate scripts), `:8001` (probe), `:8002` (concurrency race) |
| Frontend | `:3001` → API `:8001` |
| Mail/queue | `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync` (no real email sent) |
| Test DB | `pawesome_test` for the PHPUnit suite |

### Route and middleware surface (fresh `route:list` evidence)

- **727** route definitions total; **722** API routes.
- **693** routes behind `ApiTokenAuth`; **34** intentionally public (health, login/register,
  public catalog/availability, kiosk PIN, public chatbot).
- **39** authenticated routes without an explicit role gate — all verified as legitimate
  self-service surfaces (profile, notifications, chatbot, file viewing).
- Signed/protected storage: unsigned `PUT storage/{path}` → **403**; unsigned private `GET` → **403**.
- Frontend↔backend API comparison: **0 confirmed missing endpoints** (initial 125 "misses" were
  extractor artifacts; `/reports/new` exists only in a README).

### Transaction integrity design (verified in source + live)

| Flow | Control | Evidence |
| --- | --- | --- |
| POS sale | `POSController` resolves prices server-side; client `unit_price`/`total` ignored | Probe: `unit_price=0.01` sent → persisted total **25.00** |
| POS duplicate submit | `Idempotency-Key` middleware + `CashierPOS.jsx` per-sale UUID | Replay returned stored response `replayed:true`; same key + different payload → **409** |
| Stock deduction | `InventoryService::deductStock()` `lockForUpdate`, expiry block, FEFO batches, movement logs | All identified callers wrap in `DB::transaction`; probe: oversell 422, stock unchanged |
| Concurrent last-unit | Row lock serializes racers | Probe: 4+4 vs stock 5 across two PHP servers → exactly **1 success**, final stock **1** |
| Slot booking | `BookingAvailabilityService` 30-min alignment + overlap check + store hours + holidays | Probe: immediate re-submit of same slot → **422** |
| Boarding capacity | `BoardingRoomService` room/reservation locks; all callers transactional | Probe: cap-1 room, 2nd overlap rejected **422** |
| Payment verification | pending→rejected(reason req.)→resubmit→paid once; receipt generated; double-verify → 422 | Probe S5–S7, all steps green incl. DB state |

### Auxiliary modules

Payroll/HR, chatbot, kiosk PIN, live chat, Telegram, and landing-page CMS routes exist in the
route inventory and are covered by backend feature tests (chatbot suite passes, payroll outbox
tests pass). Telegram and any external-provider delivery are **NOT VERIFIED** (no credentials /
no live external calls permitted in this audit).

---

## 3. Critical failure matrix (P0–P3)

| Sev | ID | Finding | Status | Evidence |
| --- | --- | --- | --- | --- |
| **P1** | F-01 | `GET /manager/reports/sales` and `/admin/reports/sales` with **any** `start_date`/`end_date`/`from`/`to` filter returns `200` with zero rows while 35 real sales exist. Root cause: `ReportsController::sales()` line ~26 uses unqualified `created_at` in `whereDate`; the `leftJoin('users as cashiers')` at ~line 47 makes it ambiguous → `SQLSTATE[23000] 1052` → blanket `catch` returns success+empty. | **CONFIRMED — not fixed (audit-only phase)** | `evidence/reconcile-results.json`; direct SQL repro of 1052; 4 live API calls (`dbg-report.mjs`) |
| **P2** | F-02 | `sales()` catches **any** `\Exception` and returns `200 success` + empty dataset + "No records found". Report failures are indistinguishable from legitimately empty data — an observability/defense risk that currently masks F-01 and will mask any future regression in this method. | CONFIRMED (design weakness) | `ReportsController.php` ~lines 85–104 |
| **P3** | F-03 | Timezone semantics: app stores UTC (`config/app.php timezone='UTC'`); MySQL session is `SYSTEM` (PHT). Reports filter `DATE(created_at)` on the stored UTC value while a browser's "today" is local — transactions made **00:00–08:00 PHT** can appear under the previous report day. Harmless in the demo unless the panel demos near local midnight. | CONFIRMED (behavior note) | `@@time_zone=SYSTEM`, `NOW()=2026-11-17` vs stored UTC `2026-11-16` |
| **P3** | F-04 | Gate A (`pawesome_cross_role_e2e_audit.php`) fixture picks `minute = 30 + seed%30` (:30–:59) but `isServiceTimeAvailable()` requires `minute % 30 === 0`; it can also pick hour 9 (before 10:00 opening) and collide with residue slots. **A clean run was eventually captured (run 47: 31 pass / 0 fail / 1 warn)** after 46 fixture-caused failures — the gate needs its fixture fixed, not the app. | CONFIRMED — tooling bug; gate green on retry | `evidence/gate-a-e2e-run*.txt` (47 runs); `BookingAvailabilityService.php:312` |
| **P3** | F-05 | Gates C and D crash at their service/booking sections on `vet_appointments` — a table retired by migration `2026_09_28_000002`. All checks executed before the crash pass. | CONFIRMED — tooling staleness | `evidence/gate-c-database.txt`, `evidence/gate-d-reconciliation.txt` |
| **P3** | F-06 | Gate B expects `admin` to be blocked from cashier/receptionist/vet routes (6 "FAILs"). Per `AGENTS.md`, admin is **intentionally all-access staff** — and admin IS verified blocked from `/customer/*` (403). Stale gate expectation, not a defect. | CONFIRMED — tooling staleness | `evidence/gate-b-rbac.txt` |

**P0 (demo-blocking, data-corrupting, or security breach): none found.**

Environment/deploy notes (expected for local dev, must be resolved before production —
already on the release checklist): `APP_DEBUG=true`, `APP_ENV=local`, empty `DB_PASSWORD`
(Gate B HIGH/MEDIUM); boarding room/add-on catalog endpoints are public by design (Gate B
MEDIUM — acceptable for marketing, exposes catalog only).

---

## 4. Defense-scenario results (live, API + SQL verified)

Probe: `browser-evidence/final-defense-readiness/defense-probe.mjs` →
`evidence/defense-probe-results.json` — **98 steps, 0 failures.**

| Scenario | Result | Highlights |
| --- | --- | --- |
| S1 Registration + pet | ✅ 9/9 | Invalid/missing email → 422; valid → 201; duplicate → 422; **unverified customer booking → 403**; pet created + owner-linked in DB |
| S2 Grooming booking + abuse | ✅ 6/6 | Past date → 422; invalid pet → 422; valid → 201; **immediate duplicate → 422 slot-taken**; row persisted pending/unpaid; re-fetch after "refresh" finds it |
| S3 Receptionist approve | ✅ 5/5 | Pending visible; approve → 200; DB approved+price+approver; customer sees status; **double approve → safe "already approved"** |
| S4 Boarding double-book | ✅ 6/6 | Availability 200; cap-1 room approve+assign → 200; **overlapping booking on same room → rejected**; holiday dates correctly refused (Immaculate Conception, Christmas Eve) |
| S5–S7 Payment proof → reject → verify → receipt | ✅ 13/13 | `.txt` proof → 422 (allowed-type list); PNG → 200 pending+ref in DB; cashier queue sees it; reject w/o reason → 422; reject w/ reason → 200 propagated; resubmit → 200; verify → **paid + verifier + receipt**; **double-verify → 422** |
| S8–S9 POS + oversell + race | ✅ 12/12 | Sale 200 ₱100; **same-key replay → stored response, exactly 1 sale row**; key+different-payload → 409; stock deducted once + movement log; `unit_price=0.01` ignored; oversell → 422 stock intact; **concurrent last-unit → 1 winner, stock 1** |
| S10 Vet consult → record → billing | ✅ 11/11 | Request→approve→appointment→check-in→start→clinical write→finalize→complete → `checkout` + `clinical_completed_by` attribution; diagnosis persists on re-fetch |
| S11 Manager reports + exports | ⚠ 12/12 API-green, **F-01 found on manual reconcile** | All report endpoints 200 incl. empty & reversed ranges; CSV/PDF exports 200; **but see F-01: sales report empty under any date filter** |
| S12 Cross-role RBAC + IDOR | ✅ 17/17 | Customer→staff routes 403 ×5; receptionist→cashier verify 403; cashier→receptionist approve 403; inventory→POS 403; manager→stock adjust 403; vet_tech→complete consult 403; IDOR pet get/put/history → **404**; forged token → 401; **deactivated-user token → 401** |
| S13 Malformed / abuse | ✅ 7/7 | Malformed types → 422; negative qty → 422; SQLi- & XSS-flavored search → 200 benign; huge qty → 422; stock intact; **6 MB upload → 422** |

Harness artifacts corrected during the audit (not app defects): probe date choices landing on
seeded holidays, residue slot collisions, wrong verification-payload shape, wrong filter-param
names (`date` vs `date_from`), and `undefined` IDs from upstream failures.

---

## 5. Reporting accuracy audit

Known-value reconciliation on the isolated DB (probe day, app-date `2026-11-16`):

| Check | SQL ground truth | Report | Verdict |
| --- | --- | --- | --- |
| Completed POS sales | 21 rows / ₱4,435.00 | payments report `paid=24`, cash method 21×4,435.00 | ✅ matches (24 = 21 POS + 3 service requests) |
| Paid service requests | 3 rows / ₱1,050.00 | overview `total_revenue=5,485` = 4,435 + 1,050 | ✅ internally consistent |
| Payments table | ₱4,435.00 / 21 completed | payments report total 7,035 across all rows in range | ✅ explains (includes pending + orders) |
| Inventory movements | `sale`-type logs = 28 | Gate D: API=DB on items 853, low-stock 277, OOS 456, value ₱1,886,247 | ✅ exact |
| Sales-integrity (Gate D) | sales=35, items=42, payments=35, invoices=35 | all sales have items; all completed sales have payments | ✅ pass |
| Cashier transactions | 35 total | paginated 20/pg; `date_from`/`date_to` filters work | ✅ correct |
| **Sales report w/ date filter** | 35 sales exist | **returns 0 rows — F-01** | ❌ **defect** |

CSV export → `text/csv` 200; PDF export route → 200 (JSON-wrapped generation response). Empty
and reversed date ranges return 200 without crashing.

---

## 6. Database integrity report

- Schema current in isolated DB; all audit mutations confined to `pawesome_e2e_audit`.
- Dev `pawesome` verified untouched (read-only inspection only).
- Gate C executed 99 PASS checks (constraints, FK targets, orphan pets/customers, stock
  non-negativity, dedup keys) with 2 WARN on stale table expectations (`transactions`,
  `service_billings`), then crashed at section C8 on the retired `vet_appointments` table
  (tooling staleness — F-05).
- No negative stock observed at any point; stock remained consistent after oversell and race.
- MariaDB 10.4 limitation: local evidence does **not** substitute for MySQL 8 CI parity
  (documented in `AGENTS.md`; CI runs the suite on MySQL 8).

---

## 7. Security & RBAC report

- 693 authenticated routes; cross-role matrix probe: **17/17 expected denials enforced**.
- Role boundaries verified live: customer→staff 403; receptionist⇄cashier cross-actions 403;
  inventory→POS 403; manager→stock-adjust 403; vet_tech→clinical-complete 403.
- IDOR: foreign pet get/update/medical-history → 404 (not 403 — no existence leak confirmed
  via enumeration-safe 404).
- Token hygiene: forged token → 401; **deactivated user's token → 401** (session invalidation works).
- Uploads: type allow-list enforced (`.txt` 422), MIME/extension mismatch rejected (Gate B),
  PHP upload rejected, 5 MB cap enforced (6 MB → 422), path traversal rejected, private disk
  for sensitive proofs, unauthenticated proof view → 401.
- Signed storage URLs enforced (unsigned PUT/GET → 403).
- Password reset / resend endpoints use generic responses (no account enumeration — backend tests).
- Gate B headline: 134 PASS; the only HIGH is `APP_DEBUG=true` (expected locally); 6 "FAILs"
  are stale admin-block expectations (F-06).

---

## 8. Phased remediation roadmap (proposed — awaiting project-owner approval)

No code was changed. Approval is required before any of the following begins.

- **Phase A — P1 report fix (the only app defect).** Qualify `sales.created_at` in
  `ReportsController::sales()` (pass `'sales.created_at'` to `dateRange`), and replace the
  blanket `catch → 200+empty` with a logged error + 500 or an explicit `error` field so a
  failing report cannot masquerade as empty data. Add a feature test asserting the filtered
  sales report returns rows. ~Small diff, high demo value.
- **Phase B — Maintenance-gate refresh.** Update `pawesome-maintenance` scripts: Gate A time
  fixture → :00/:30 aligned in-hours times (or query availability first); Gates C/D → drop or
  remap the retired `vet_appointments` checks to `appointments`; Gate B → align admin-access
  expectations with documented design.
- **Phase C — Demo polish (optional).** Rehearse the "make sale → open filtered sales report"
  path after Phase A; consider a banner when a report range returns empty; document the
  UTC-vs-local midnight edge (F-03) for narrators; pre-verify the demo account's email to
  skip the verification gate live.
- **Phase D — Verification re-run.** Re-execute `defense-probe.mjs`, the sales-report
  assertions, backend suite, and Gates A–D against a freshly seeded isolated DB; confirm
  F-01/F-02 closed and gates green.
- **Phase E — Deploy-readiness items (pre-existing checklist).** `APP_DEBUG=false`,
  `APP_ENV=production`, real `DB_PASSWORD`, production `APP_KEY`, CORS allow-list, queue
  worker + scheduler, backups, private S3 for payment proofs. (Already tracked in the
  AGENTS.md release checklist — unchanged by this audit.)
- **Phase F — External verification (needs credentials/env).** Brevo end-to-end send,
  Telegram bot, live-chat delivery, MySQL 8 CI parity run, full Playwright browser pass on
  the isolated stack.

---

## 9. Readiness scorecard

| Area | Score | Basis |
| --- | --- | --- |
| Transaction integrity (orders/bookings/payments/inventory/receipts) | **Strong** | Idempotent replay, row locks, FEFO, transactional callers — all live-verified |
| Authorization & IDOR | **Strong** | 17/17 cross-role denials; IDOR→404; forged/deactivated tokens→401 |
| Input validation & abuse | **Strong** | Malformed/negative/oversize/SQLi-XSS probes all handled; uploads hardened |
| Cross-module synchronization | **Strong** | Customer→receptionist→cashier→vet status propagation verified at API+DB |
| Duplicate/concurrency safety | **Strong** | Same-key replay, 409 mismatch, double-approve/verify safe, last-unit race 1-winner |
| **Reporting accuracy** | **Weak — 1 defect** | Payments/overview/inventory reconcile exactly; **sales report broken under date filter (F-01)**; error masking hides failures (F-02) |
| Test coverage | **Strong** | 986 backend + 33 frontend tests green; 98-step live probe green |
| Audit tooling health | **Weak** | Gate A green only after 46 fixture-failed attempts (31/0 clean run 47); Gates C/D crash on retired table (F-04/F-05/F-06) |
| Deploy readiness | **NOT VERIFIED** | External providers, MySQL 8, queue/scheduler ops — credentials/env required |

**Bottom line:** ready for a live panel demonstration on the functional/integrity/security
axes, **except** that a panelist who filters the Sales report by date will see an empty report
(F-01) — recommend approving Phase A before the defense. All remediation awaits
project-owner approval; nothing was changed in this audit.

---

### Evidence index

- `browser-evidence/final-defense-readiness/defense-probe.mjs` — 98-step live probe
- `browser-evidence/final-defense-readiness/evidence/defense-probe-results.json` — full step log
- `browser-evidence/final-defense-readiness/evidence/reconcile-results.json` — SQL vs report reconciliation
- `browser-evidence/final-defense-readiness/evidence/gate-a-e2e-run*.txt` — Gate A: run 47 clean (31 pass / 0 fail); runs 1–46 fixture failures (misaligned :31–:59 minutes, hour-9 rejections, residue collisions)
- `browser-evidence/final-defense-readiness/evidence/gate-b-rbac.txt` — Gate B (134 pass)
- `browser-evidence/final-defense-readiness/evidence/gate-c-database.txt` — Gate C (99 pass + crash on retired table)
- `browser-evidence/final-defense-readiness/evidence/gate-d-reconciliation.txt` — Gate D (D1–D3 pass + same crash)
- `browser-evidence/final-defense-readiness/evidence/routes_audit_fresh.json`,
  `fe_api_endpoints.txt`, `_audit_endpoint_check.php` — static route/endpoint evidence
- Backend suite output: PHPUnit run on `pawesome_test` — 986 pass / 1 skip / 0 fail (captured in session log)
