# Admin Bug Tracker

Severity: P0 critical · P1 high · P2 medium · P3 low. All P0–P2 fixed this pass.

## Fixed

### ADM-01 · P1 · Self/last-admin lockout
- **Repro:** `PATCH /admin/users/{id}/toggle` as the only admin → deactivated;
  reused token → 401. `PUT /admin/users/{id}` `{"role":"customer"}` → demoted;
  token → 403. Proven live twice on the audit DB.
- **Root cause:** no self/last-admin guards in `UserController` update/toggle/destroy.
- **Fix:** `backend/app/Http/Controllers/Admin/UserController.php` — guards on
  self-deactivation, self-role change, self-delete, last-active-admin.
- **Regression:** `AdminDeepAuditTest` (6 tests).

### ADM-02 · P1 · Failed logins not recorded
- **Repro:** wrong password → 401 but no `login_logs` row; `statistics.failed_logins`=0.
- **Root cause:** `AuthController::login` only logged success despite
  `status`/`failure_reason` schema + `Login::logLogin($status,$reason)` support.
- **Fix:** record failures (invalid credentials, unknown email, inactive).
- **Regression:** 4 tests.

### ADM-03 · P1 · Activation toggle unreachable
- **Repro:** ManageUsers had only view/edit/delete; `status` shown read-only.
- **Fix:** `ManageUsers.jsx` — activate/deactivate action + `showConfirm` +
  self-protection.

### ADM-04 · P2 · Dead settings toggles / maintenance mode no-op
- **Repro:** enable `maintenanceMode` → non-admin API calls still 200. Eight
  toggles persisted values with zero consumers.
- **Fix:** maintenance-mode enforcement in `ApiTokenAuth` (non-admin → 503, admin
  exempt); login/failed-login alert toggles now create notifications; dead
  controls removed from `AdminSettings.jsx` + settings payload.
- **Regression:** 5 tests.

### ADM-05 · P2 · HTML exceptions on `api/*` without Accept header
- **Repro:** `DELETE /admin/users/{id}` (no reason, no `Accept`) → HTML 302;
  `/api/admin/nope` → HTML 404.
- **Fix:** `bootstrap/app.php` renders JSON for `api/*` exceptions.
- **Regression:** 2 tests.

### ADM-06 · P2 · Fabricated `active_modules`
- `DashboardController::getActiveModules()` returned all-true → always 9.
- **Fix:** removed the fabricated field.
- **Regression:** 1 test.

### ADM-07 · P2 · `vet_tech` unreachable in UI
- Role missing from `CreateUser.jsx` + `ManageUsers.jsx` selects (backend accepts).
- **Fix:** added to both.

### ADM-08 · P2 · Kiosk PIN plaintext exposure
- `GET /admin/settings` returned `kioskPin` plaintext.
- **Fix:** `SystemSettingController.php` no longer exposes it.

### ADM-09 · P3 → FIXED · Misleading booking-unavailable 422
- `BookingAvailabilityService` now exposes `serviceTimeUnavailableReason()`
  returning precise causes: unaligned slot ("Times are available in
  30-minute intervals."), outside hours ("Selected time is outside shop
  opening hours. Please choose between 10:00 AM – 6:00 PM."), holiday
  closure, and real overlap. `ServiceRequestController` (customer + staff
  booking paths) and other user-facing call sites now surface the real
  reason instead of a blanket "overlaps an existing booking".
- Verified live on :8001 (unaligned minute and holiday cases) + 4 new
  regression tests.

### ADM-10 · P3 → FIXED · `GET /admin/users` unpaginated
- `Admin\UserController::index` now supports server-driven `search`,
  `role`, `status`, `sort`, `page`, `per_page`, plus `stats` aggregates;
  `?all=1` preserves the legacy array shape for callers needing the full
  list.
- `ManageUsers.jsx` rewritten to server-driven queries; `StandardTable.jsx`
  gained a controlled `serverPagination` mode.
- Verified live: `per_page=5` → `meta.current_page=1, last_page=3,
  total=11`; `stats` match; `all=1` unchanged shape.

### ADM-12 · P3 → FIXED · Gate-script artifacts
- Canonical scripts in `C:/xampp/pawesome-maintenance/` patched:
  - All four gates accept `PAWESOME_API_URL` env (no more hardcoded `:8000`).
  - Gate B matrix adds `admin` to staff-route allowed roles (documented
    all-staff-access design); customer routes still admin-free.
  - Gate C table discovery is schema-scoped (`SHOW TABLES`), tolerates
    retired `vet_appointments`.
  - Gate D reconciles revenue via `RevenueService` multi-source semantics
    and `total_users` against active (non-soft-deleted) users.
  - Gate A fixture generator uses aligned 30-minute slots within store
    hours and avoids holidays.
- Final canonical-script runs vs `pawesome_e2e_audit`: **A 31/0, B 140/0,
  C 120/0, D 50/0** — all PASS, zero failures.

### REV-01 · P2 → FIXED · Admin lockout TOCTOU race
- `UserController::update`, `toggle`, and `destroy` ran the active-admin
  count check outside a transaction — two concurrent admin requests could
  each observe count=2, both remove an admin, and leave zero active admins.
- **Fix:** the count check now runs `lockForUpdate()` inside a
  `DB::transaction` shared with the mutation, so concurrent removals
  serialise on the locked active-admin row set.
- **Regression:** new test
  `test_last_active_admin_cannot_be_removed_by_legacy_super_admin`
  exercises the otherwise-unreachable "last admin is another user" branch
  (`super_admin` callers pass `EnsureRole` but are not counted by
  `role='admin'`). `AdminDeepAuditTest` 33/33 PASS.

### REV-02 · P2 → FIXED · Gate A fixture date flakiness
- The seeded fixture date could land on a closed weekday or holiday even
  after the time was aligned to 30-minute store slots.
- **Fix:** `pawesome_cross_role_e2e_audit.php` now probes
  `GET /availability/veterinary?date=` for the next 60 days and uses the
  first real available slot; a `blocker` finding is recorded if none is
  found. Unreachable-API probes bail out immediately instead of sweeping
  61 dates.
- **Live verification:** probe selected `2026-11-25 10:00`; full 31-check
  workflow PASS. Two further script bugs found and fixed in the same run:
  the probe read a non-existent `http` key (apiCall returns `status`) and
  ran before `$report` was initialised.

### REV-03 · P2 → FIXED · Gate C migration double-count
- `substr_count('[1] Ran') + substr_count('] Ran')` matched every ran row
  twice (the second pattern is a substring of the first).
- **Fix:** single `\bRan\b` count on ANSI-stripped output, cross-verified
  against the authoritative `migrations` table row count (warn on drift).
- **Live verification:** 182 reported = 182 in `migrations` table, no drift.

### REV-04 · P3 → FIXED · Gate C `mysqldump --user` passed the host
- First backup attempt used `--user=$dbHost` and only succeeded via the
  fallback. Now a single attempt with the configured user, plus a
  conditional `--password=` arg (omitted for empty dev passwords so no
  interactive prompt).
- **Live verification:** additionally found the export check accepted a
  100-byte file containing the shell's "not recognized" error text — the
  script now resolves `mysqldump` via PATH → `PAWESOME_MYSQLDUMP` →
  `C:/xampp/mysql/bin/` and requires real `CREATE TABLE` DDL in the output
  (verified: 140 KB export).

### REV-05 · P3 → FIXED · Public settings/landing-page unthrottled
- `GET /api/settings/public` and `GET /api/landing-page` are DB-backed
  public reads; both now carry `throttle:api` like the other public
  catalog routes. `/api/health` remains unthrottled for probes.

### REV-06 · P3 → FIXED · `update()` accepted unvalidated fields
- `first_name`/`last_name` were in `$updatable` with no validation rules,
  and `middle_name` was missing entirely. All three now have
  `sometimes|nullable|string|max:255` rules and are updatable.

### REV-07 · P3 → FIXED · Stale pagination claim in `ADMIN_API_AUDIT.md`
- Notes section still described `User::all()`/client-side pagination after
  ADM-10 shipped server-side pagination. Updated to describe the shipped
  contract.

## Open — P3 documented (hardening, not defects)

| ID | Item | Note |
|----|------|------|
| REV-08 | `SystemSetting::get` ×2 per request | `security_session_timeout` + `general_maintenance_mode` are read per authenticated request; cache with invalidation in `set()`. Must preserve maintenance-mode fail behaviour when settings read fails |
| REV-09 | Gate D `$r` shadowing + unguarded `grooming_appointments` count | Collect responses in a named array for the demo-pattern scan; wrap the grooming table count in `Schema::hasTable` |
| REV-10 | ManageUsers edge cases | `setPage(1)` inside `setDebouncedSearch` updater; export uses `debouncedSearch` (stale within 400ms); empty filtered page > 1 shows no pagination to navigate back |
| REV-11 | `role-deep-links.spec.js` unused imports | `apiLogin` helper and `execSync`/`fs` imports unused |
| REV-12 | Login-notification volume | One notification row per successful login; consider dedupe window |
| REV-13 | Route snapshot naming/location | Filename date ≠ `generated_at`; `no_auth` group includes KioskPinAuth routes; large generated artifact under `backend/` |

### REV-14 · P3 → FIXED · True-concurrency test for REV-01
- `pawesome-maintenance/pawesome_lockout_concurrency_test.php` provides the
  two-connection proof: a second PDO connection **blocked 5.78 s** on the
  shared `FOR UPDATE` lock set (past its 4 s `innodb_lock_wait_timeout`),
  then re-read the updated count (3→2) after conn1 committed — confirming
  `lockForUpdate()` genuinely serialises the guard on InnoDB.
- HTTP phase: concurrent `curl_multi` toggles on the only two active admin
  fixtures → exactly one 200 and one 403, 1 active admin remained.
- Live evidence: `docs/audit/ADMIN_REGRESSION_RESULTS.md` post-review
  re-run section.

## Open (deployment-time, not code defects)

| ID | Item | Note | Action |
|----|------|------|--------|
| ADM-11 | Env config (dev) | `APP_DEBUG=true`, `APP_ENV=local`, empty `DB_PASSWORD` in local `.env` | Set production values per release checklist before deployment; this is configuration, not an application defect |
