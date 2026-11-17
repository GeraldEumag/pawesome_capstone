# Admin Security Audit

All probes executed live against `http://127.0.0.1:8001/api` (audit DB).

## Authentication & session

- Unauthenticated requests → 401 on all admin endpoints.
- Invalid/revoked/inactive-user tokens → 401.
- Inactive accounts → 403 on login **and** the attempt is now logged as failed (ADM-02).
- Session inactivity enforced via `last_used_at` + `security_session_timeout`.
- Logout revokes the token immediately (verified: reused token → 401).

## Authorization

- 9-identity denial matrix across representative admin endpoints — clean 401/403/200.
- Unauthorized mutations (create user, settings write, user delete, FAQ create) → 403.
- IDOR: cross-owner pet / service-request / payslip access → 404/403.
- Admin all-staff scope intentional; **customer-only routes deny admin** (403).

## Self/lockout protections (ADM-01 — fixed)

Admin can no longer deactivate itself (toggle or update), change its own role,
delete itself, or deactivate/delete the last active admin. Proven live:
pre-fix probes produced a complete lockout (token → 401/403); post-fix → 403.

## Audit trail (ADM-02 — fixed)

- Failed logins (unknown email, wrong password, inactive account) now write
  `login_logs` rows with `status='failed'` + `failure_reason`.
- `login-logs/statistics` `failed_logins` is now non-zero and correct.
- Login alerts → user `info` notification; ≥3 failed attempts → admin `warning`
  notification (once per burst) when enabled.

## Secret/config handling (ADM-08 — fixed)

`GET /admin/settings` no longer returns the kiosk PIN plaintext.

## Maintenance mode (ADM-04 — fixed)

When enabled: non-admin authenticated sessions → 503, admin retains access (to
disable it), public routes unaffected, effect is immediate.

## API contract (ADM-05 — fixed)

`api/*` exceptions render JSON regardless of `Accept` header — validation 422s and
404s no longer leak HTML/302.

## Uploads / config

- PHP executable, MIME/extension mismatch, >5 MB, path traversal → rejected (422).
- Private disk used for sensitive uploads; unauthenticated proof-view → 401.
- Env findings (local dev, expected): `APP_DEBUG=true`, `APP_ENV=local`, empty
  `DB_PASSWORD` — must be resolved for production per release checklist.
