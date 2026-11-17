# Admin Regression Results

## PHPUnit

| Suite | DB | Result |
|-------|----|--------|
| `AdminDeepAuditTest` (33 tests / 88 assertions after REV-01) | `pawesome_test` | **33/33 PASS** |
| Full backend suite | `pawesome_test` (MySQL) | **1049 passed, 1 skipped, 0 failed** (310.5 s) |

`AdminDeepAuditTest` covers: self/last-admin lockout (toggle/update/delete),
token revocation on deactivation, role-change auditing, failed-login recording +
statistics, login/failed-login notifications (enabled/disabled/once-per-burst,
valid `info`/`warning` enum types), maintenance-mode enforcement + persistence,
settings payload surface, JSON error contract, fabricated-metrics removal,
server-side user pagination/filtering/sorting + `all=1` compatibility, and
precise booking-unavailability reasons (unaligned minute / outside shop hours /
holiday / real overlap).

## Playwright (chromium, live audit stack)

| Spec | Result |
|------|--------|
| `batch7-admin-system.spec.js` | all pass (every admin page + staff portals + customer block) |
| `admin-dashboard.spec.js` | pass |
| `admin-dashboard-revisions.spec.js` | pass |
| `admin-reports-charts.spec.js` | pass |
| `admin-responsive-audit.spec.js` | pass |
| `role-deep-links.spec.js` | **5/5 pass** |
| `phase13-route-authorization-matrix.spec.js` | **pass** (full 722-route denial matrix with `E2E_AUDIT_DATABASE`+`E2E_API_URL`, ~6.4m, 0 violations) |
| `pawesome-role-smoke-audit.spec.js` | 9/9 pass (all role dashboards) |
| `cross-role-main-workflow.spec.js` | pass (full customer→receptionist→vet→manager chain) |

Spec-side fix: `role-deep-links.spec.js` previously built `apiUrl` as
`${E2E_API_URL}/api` while `test-utils.js` treats `E2E_API_URL` as the full API
base — under the audit env it produced `/api/api`. Aligned to the `test-utils`
convention (backwards-compatible when unset). This was a **test-infra** fix, not
an app change.

## Gates (final runs — canonical scripts, `PAWESOME_API_URL=http://127.0.0.1:8001/api`, `DB_DATABASE=pawesome_e2e_audit`)

| Gate | Result |
|------|--------|
| A — cross-role E2E | **PASS — 31/0 fail, 1 warn** |
| B — security & RBAC | **PASS — 140/0 fail** / 1 high + 3 medium local dev-env notes (ADM-11) |
| C — database readiness | **PASS — 120/0 fail**, 2 warn, 4 medium design notes |
| D — report reconciliation | **PASS — 50/0 fail** |

### Gate corrections applied (canonical scripts in `C:/xampp/pawesome-maintenance/`)

- **API base:** all four gates now read `PAWESOME_API_URL` (was hardcoded `:8000`).
- **Gate B matrix:** `admin` added to staff-route allowed roles per the documented
  all-staff-access design (the 6 earlier "fails" were stale expectations);
  customer routes remain admin-free — verified.
- **Gate C:** table discovery switched from MariaDB's cross-schema `getTables()`
  to schema-scoped `SHOW TABLES` (now correctly reports 93 tables); retired
  `vet_appointments` handled via `Schema::hasTable` guards.
- **Gate D:** revenue reconciles via `RevenueService` multi-source semantics
  (POS sales + paid service/appointment + settlements — e.g. 1450 = 1000 + 450,
  not `sales`-only); `total_users` compares against active (non-soft-deleted) users.
- **Gate A:** random slot generator constrained to aligned 30-minute intervals
  within store hours, avoiding holidays (earlier "failures" were correct
  rejections of invalid fixture times).

## Post-review verification re-run (2026-11-17, canonical scripts only)

Re-run after the code-review fixes (REV-01–07). API `http://127.0.0.1:8001`,
`DB_DATABASE=pawesome_e2e_audit`; PHPUnit remains on `pawesome_test`.

| Check | Result |
|-------|--------|
| Gate A — cross-role E2E | **PASS — 31/0 fail, 1 warn** (skip note: no consumable item in fixture). Date probe selected a real bookable slot `2026-11-25 10:00` via `GET /availability/veterinary` |
| Gate B — security & RBAC | **140 pass / 0 fail** — 1 high + 3 medium are dev-`.env` findings only (`APP_DEBUG=true`, `APP_ENV=local`, empty `DB_PASSWORD`, public boarding catalog) — tracked as open ADM-11, not app defects |
| Gate C — database readiness | **PASS — 121/0 fail, 2 warn, 3 medium** — all medium/warn are documented design notes (logical-only FKs, dual boarding tables, `transactions`/`service_billings` concept checks) |
| Gate D — report reconciliation | **PASS — 50/0 fail, 0 warn** |
| REV-01 lockout (REV-14 concurrency proof) | **PASS** — `pawesome-maintenance/pawesome_lockout_concurrency_test.php`: conn2 blocked 5.78 s on the shared `FOR UPDATE` lock set until conn1 committed, then re-read the updated count (3→2); concurrent `curl_multi` toggles at the 2-active-admin boundary → exactly one 200 + one 403, 1 admin remained |
| Gate C migration count | **PASS** — `migrate:status` reports **182** ran, `migrations` table holds **182** — exact match, zero drift |
| Public endpoint throttling (REV-05) | **PASS** — `api/settings/public` returns 200 ×60 then 429; `api/landing-page` 429s (shared `api-ip` bucket, `RateLimiter::for('api')`, 60/min); `api/health` intentionally exempt |
| Route authorization matrix | **PASS** — `route_audit_analyzer`: 722 routes, 0 auth violations; `no_throttle` now contains only `api/health`; Gate B B3 denial matrix all-PASS |

### Gate-script bugs found and fixed during this re-run (script fixes, not app changes)

- **Gate A** probe used a non-existent `http` response key (script's `apiCall`
  returns `status`), so the unreachable-server bail fired on the first
  candidate; it also ran before `$report` was initialised (undefined-key
  warnings). Moved after init; key corrected.
- **Gate C** `migrate:status` output carries ANSI colour escapes
  (`\e[32;1mRan\e[22m`) whose `m` abuts `Ran` and defeated the `\bRan\b`
  word-boundary count (reported 0 vs 182). Escapes are stripped first; the
  migrations-table cross-check caught the drift.
- **Gate C** schema-export check passed a 100-byte file containing
  `"'mysqldump' is not recognized"` — size-only validation mistook the
  error text for a dump. `mysqldump` is now resolved via PATH →
  `PAWESOME_MYSQLDUMP` → `C:/xampp/mysql/bin/`, and the export must contain
  `CREATE TABLE` before it counts as a pass (real export verified: 140 KB).
- **REV-14 script** needed a `refresh()` before restoring fixture state after
  raw-SQL mutation (stale-model `save()` was a no-op); `curl_multi_getinfo`
  → `curl_getinfo`.

## Build

- `npm run build` — **PASS** (2369 modules, 23.98 s).
- `php artisan optimize:clear` — done.
