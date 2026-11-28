# 03 — Application Security Audit

Scope: authN/authZ, common vulnerability classes, file uploads. Builds on
`PAWESOME_REVISION_AUDIT/11_SECURITY_AND_RBAC_AUDIT.md`; this pass
re-verified the controls that matter for production and classified
residuals.

## Authentication — verified controls

| Control | Evidence | Status |
| --- | --- | --- |
| Password hashing | `Hash::make`/`Hash::check` (bcrypt, `BCRYPT_ROUNDS=12` in example) | PASS |
| Login throttling | `RateLimiter::for('auth')` — dual bucket: per-IP minute cap + per-account `security_max_login_attempts` (admin-configurable, clamped 3–10); applied to register/login/forgot/reset/verify/resend (`routes/api.php:137`) | PASS |
| Login audit trail | `LoginLog::logLogin` records success **and** failure (invalid creds, inactive); `alertAdminsOnRepeatedFailures` notifies admins | PASS |
| Inactive account enforcement | `!$user->is_active` → 403 after credential check | PASS |
| Token transport | Bearer header only — `ApiTokenAuth` explicitly rejects `?token=` to prevent log/referrer leakage | PASS |
| Token expiry | Per-token `expires_at` honored; **absolute session-token expiry is null** (`createToken` without expiresAt) — mitigated by idle timeout below | PARTIAL |
| Session idle timeout | `ApiTokenAuth` enforces `security_session_timeout` SystemSetting (default 60 min, clamped 15–480), `last_used_at` refreshed ≤1 write/min | PASS |
| Password reset | Hashed tokens in `password_reset_tokens`, expiry via `auth.passwords.users.expire`, generic responses (no enumeration) | PASS |
| Email verification | Hashed tokens, 60-min expiry, generic resend, `verified` middleware blocks unverified customers on booking/checkout POSTs | PASS |
| Password policy | Validation on register/reset/change (min length + confirmed) — verified in prior audit | PASS |

## Authorization — verified controls

- 821 API routes; protected groups carry `auth.api` + `throttle:api` +
  `role:<roles>` middleware. Role matrix matches `docs/RBAC_PERMISSION_MATRIX.md`
  (admin = all staff modules minus customer portal; `super_receptionist`
  composite; `EnsureRole` normalized server-side).
- Frontend route guards exist but are **not** the enforcement layer —
  every sensitive endpoint re-checks role server-side (verified in prior
  audit report 11; spot re-verified this pass).
- Department/object scoping: vet records restricted to assigned
  veterinarian + logged cross-access (VeterinaryWorkflow tests); cashier
  vs inventory vs manager route groups separated.
- Kiosk endpoints behind `kiosk.pin` middleware + throttle.
- Public surface: 18 unauthenticated routes, all `throttle:api` or stricter;
  Brevo webhook uses `BREVO_WEBHOOK_SECRET` shared-secret check.

## Common vulnerability classes

| Class | Result |
| --- | --- |
| SQL injection | Eloquent/Query Builder throughout; no raw-string interpolation of request input found in prior + this pass | PASS |
| XSS | React escaping by default; `dangerouslySetInnerHTML` usage reviewed in prior audit (chatbot markdown sanitized via react-markdown) | PASS |
| CSRF | API is bearer-token (not cookie-session) for app traffic → CSRF largely N/A; Sanctum stateful domains env-scoped; `SESSION_SAME_SITE=lax` | PASS |
| Broken access control / IDOR | Role middleware + ownership checks on customer portal resources (prior audit); `EnsureRole` server-side | PASS |
| Mass assignment | Models use explicit `$fillable` (User, Customer, Pet, Sale verified); no `$guarded = []` found | PASS |
| Sensitive exposure | `.env` gitignored; no secrets in repo; API errors JSON-normalized without traces when `APP_DEBUG=false`; bearer tokens never in query string | PASS |
| Rate limiting | api/auth/sensitive/chatbot/chatbot-public/kiosk limiters all defined | PASS |
| Session fixation | Token-based API auth; no PHP session fixation surface on API | PASS |

## File uploads — verified controls

- Validation everywhere checked: `image|mimes:jpg,jpeg,png,webp|max:…`
  (pet photos 5–10MB, avatars, landing/service images, documents).
- Pet photos stored on **`private` disk** (`pet_photos`, private driver) —
  not public-URL exposed; served through authorized endpoints.
- Payment proofs use private storage (per DEPLOYMENT.md requirement).
- Filenames generated server-side (no client-supplied path components);
  `ValidatePathEncoding` middleware on stack; Flysystem `throw` on private
  disk surfaces storage failures as 503 JSON (bootstrap/app.php).
- No executable-upload path: mimes whitelist excludes php/svg-scriptable
  types for user content; `svg` not in allowed lists.

## Findings register (this phase)

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| SEC-01 | **Low** | API tokens have no absolute expiry — a stolen token is valid until idle-timeout (≤60 min default) or manual revocation. Acceptable; recommend optional `expiresAt` on `createToken` for staff roles. | Documented |
| SEC-02 | **Low** | `CORS_ALLOWED_ORIGINS=*` would be reflected **with** `Access-Control-Allow-Credentials: true` by the custom Cors middleware. Production env must never set `*`. | Documented — runbook gate |
| SEC-03 | **Info** | `SESSION_ENCRYPT=false` default; session cookie payload unencrypted (httpOnly+secure+lax). Fine for capstone; enable if policy requires. | Documented |
| SEC-04 | **Info** | `TRUSTED_PROXIES=*` default trusts X-Forwarded-* from any peer — correct behind managed edge; narrow to edge CIDRs if origin is directly exposed. | Documented |
| SEC-05 | **Info** | `config/cors.php` `allowed_origins_patterns` whitelists localhost origins but is **inert** (custom `App\Http\Middleware\Cors` is registered instead). Harmless dead config; do not "fix" by enabling Laravel's HandleCors. | Documented |

**No Critical/High/Medium security defects found.** All prior-audit RBAC
and upload findings remain fixed. Security verdict: **PASS for
production** pending the deploy-time env gates above.
