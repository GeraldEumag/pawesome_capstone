# Phase 2 — Security Settings Enforcement (F-04)

## Original finding

F-04: the admin security settings screen persisted `security_*` keys to
`system_settings`, but nothing in the application ever read them. Password
rules were hardcoded `min:6`/`min:8` strings, the login throttle used a
hardcoded `5/min`, tokens never expired, and a two-factor-auth toggle
implied protection that does not exist.

## Root cause

Settings were write-only: `SystemSettingController::updateSecurity` stored
them and `getSettings` echoed them back, but no enforcement path consumed
the values.

## Files changed

| File | Change |
|---|---|
| `backend/app/Support/PasswordPolicy.php` | **New.** Central policy builder: `Password::min(n)` + conditional `mixedCase()`/`numbers()`/`symbols()` from stored settings. Takes a per-endpoint **floor** so config can only strengthen, never weaken, the previous hardcoded minimum |
| `backend/app/Http/Controllers/AuthController.php` | Register, change-password, and reset-password now validate against `PasswordPolicy::rules()` |
| `backend/app/Http/Controllers/Admin/UserController.php` | `store()` password field now uses `PasswordPolicy::rules()` (was `min:6`) |
| `backend/app/Providers/RouteServiceProvider.php` | `throttle:auth` per-account limit now reads `security_max_login_attempts` (bounded 3–10, fallback 5) |
| `backend/app/Http/Middleware/ApiTokenAuth.php` | Enforces inactivity timeout from `security_session_timeout`; refreshes `last_used_at` throttled to 1 write/minute |
| `backend/app/Http/Controllers/SystemSettingController.php` | `twoFactorAuth` removed from the GET payload, `updateSecurity` validation, and persistence |
| `frontend/src/components/admin/AdminSettings.jsx` | Removed the non-functional "Enable Two-Factor Authentication" toggle + state key |
| `frontend/src/components/shared/ProfileSettings.jsx` | Removed the per-user "Two-Factor Auth" toggle + state key |
| `backend/tests/Feature/SecuritySettingsEnforcementTest.php` | **New.** 15 tests / 47 assertions |

## Password entry points covered

Verified inventory — every place a password is *set*:

1. `POST /api/auth/register` (customer self-registration)
2. `POST /api/auth/change-password` (authenticated profile change — still verifies `current_password` + `confirmed`)
3. `POST /api/auth/password/reset` (forgot-password token flow — `confirmed` kept)
4. `POST /api/admin/users` (admin account creation)

Staff/receptionist-created customers (`WalkInController`, admin welcome
flow) never receive a typed password — a random 40-char secret is hashed
and the customer sets their own via `password_reset_tokens`, which lands
on entry point 3. No uncontrolled password-set path remains.

## Login attempt limit

- `throttle:auth` now uses `security_max_login_attempts` for the
  per-account+IP bucket (was hardcoded `5`).
- Bounds mirror the settings validation (3–10); missing/malformed → 5.
- Per-minute decay is preserved → lockout is temporary, never permanent.
- The `auth-ip:` IP-wide bucket is unchanged.
- The key (`login|ip`) is unchanged → no enumeration oracle, no client
  control of the limit.

## Session timeout — semantic decision

The admin UI advertises **"Idle time before automatic logout"** (15–480
min) — an **inactivity timeout**, not an absolute token lifetime. These
are different controls; treating them as interchangeable would silently
expire long-lived active sessions.

Implementation (in `ApiTokenAuth`):

- Rejects when `last_used_at ?? created_at` is older than the configured
  idle window → 401 `Unauthenticated.`
- Refreshes `last_used_at` **throttled to one write per minute** so hot
  clients do not add a DB write per request; effective granularity ≈ 1
  minute.
- Setting bounds mirror the UI (15–480); missing/malformed → 60.
- Absolute expiry (`sanctum.expiration`, `expires_at`) checks preserved —
  both controls compose correctly.

## 2FA removal

No two-factor implementation exists anywhere in the backend. The toggle
advertised protection that cannot be delivered — removed from:

- Admin security settings UI (`AdminSettings.jsx`)
- Per-user profile settings UI (`ProfileSettings.jsx`)
- `GET /api/admin/settings` security payload
- `updateSecurity` validation + persistence (a stale client still sending
  `twoFactorAuth` is silently ignored — backward compatible)

The legacy `security_two_factor_auth` DB row (if any) is left in place —
no data deleted. 2FA is **documented as unsupported**; a real
implementation would require separately approved scope.

## Security review notes

- **Per-endpoint floors (reviewer hardening):** `PasswordPolicy::rules($floor)`
  computes `max(configured, floor)`. Register/change/reset keep their
  previous `min:8` floor (`rules()` default 8); admin creation keeps its
  `min:6` floor (`rules(6)`). An admin setting `minPasswordLength = 6`
  therefore allows 6-char passwords only at the admin-create endpoint —
  registration still demands 8. A configured 12 strengthens all endpoints.
- Policy can only add complexity requirements; disabling a flag removes a
  requirement but cannot drop below the length floor.
- Settings remain admin-only (`role:admin`); no new access granted.
- Settings reads inside `PasswordPolicy`/`ApiTokenAuth`/limiter use the
  existing `SystemSetting::get` (single-row lookup per call).

## Inactivity-timeout verification (reviewer checklist)

- `last_used_at ?? created_at` — null-safe: brand-new tokens measure
  idleness from creation; first authenticated call stamps `last_used_at`.
- Idle past window → 401 (`test_idle_token_is_rejected`, 16 min > 15).
- Active token → 200 + `last_used_at` refreshed
  (`test_active_token_is_accepted_and_activity_refreshed`).
- Write throttled: `save()` only when `last_used_at` is null or > 1 min
  stale — at most one write/minute/token.
- Absolute-expiry checks (`expires_at`, `sanctum.expiration`) untouched
  and evaluated *before* the inactivity check.
- Concurrent requests: both compute the same comparison and write
  `now()` — last-write-wins on a monotonic timestamp, no unsafe state.
- `security_session_timeout` is read via `SystemSetting::get` server-side
  only; no request input is consulted.

## Tests executed

| Command | Result |
|---|---|
| `php artisan test --filter=SecuritySettingsEnforcementTest` | **18 passed / 63 assertions** |
| `npx vitest run` (frontend) | **32 passed / 7 files** |
| `npm run build` | clean (pre-existing chunk warnings only) |
| `php artisan test` (full suite, run 1) | 963 passed / 1 skipped / **1 failed** — `DatabaseIntegrityTest` fixture used weak `password123` (enforcement working as designed); fixture updated to `Password123!` and re-verified green |
| `php artisan test` (full suite, run 2 — post-floor change) | **967 passed / 1 skipped / 0 failed / 4,855 assertions** (~284 s) |

DB identity: `phpunit.xml` pins `DB_*` to MySQL `pawesome_test`
(confirmed before any run — `pawesome` is never touched).

## Known limitations

- Inactivity granularity ≈ 1 minute (write-throttling on `last_used_at`).
- `last_used_at` is shared across all clients of a token — an attacker
  holding a leaked token keeps it alive while active; revocation remains
  the mitigation, unchanged.
- The throttle still allows distributed attempts across distinct IPs
  against one account (per-account+IP key) — the `auth-ip:` bucket plus
  the login|ip pair is the existing accepted model.

## Remaining risks

- Frontend idle UX: the SPA is not auto-logged out on timeout — it
  discovers the 401 on the next API call. A client-side idle timer is a
  UX nicety, not a security control, and is out of scope here.
- `security_session_timeout`/`max_login_attempts` apply to new requests
  immediately (no cache) — by design.

## Rollback

Revert commit `fix(security): enforce security settings`; all changes are
additive/config-driven and touch no schema or data.
