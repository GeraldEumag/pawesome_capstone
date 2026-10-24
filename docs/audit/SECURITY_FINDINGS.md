# Security Findings — Pawesome Capstone B (2026-10-25)

## Authentication
- **Inactive account tokens rejected** — `ApiTokenAuth.php:41`; P1 tests: deactivated→rejected, reactivated→works. ✅
- **Invalid/missing tokens rejected** — P1 tests. ✅
- **Password lifecycle** — `EmailAuthFlowTest` (part of 98): reset consumes token, sends change notice, superseded verification tokens suppressed. ✅
- **Account enumeration** — generic responses on forgot/reset verified in earlier passes; login errors generic. ✅ (source-reviewed)
- **Walk-in staff-created customers** — get set-password link, never plaintext (P1 test). ✅
- Rate limiting: login throttles exist (spec comments: 5/min `/auth/login`). CODE-REVIEWED.

## Authorization / role isolation
- Role-gated API groups per route file; prior probes: inactive user 403, customer→`/admin/users` 403, cashier→`/manager/payroll` 403 (v0.2 chain3 + P9).
- Chatbot tool role recheck blocks staff tools for customer (AuditRegressionTest). ✅
- Pet photos private + owner-authorized (`PrivatePetPhotoTest`). ✅
- Payment proofs stored on private disk (`StorageLifecycleTest` family per AGENTS.md).
- Boarding update cannot set `status`/`payment_status` via mass assignment (AuditRegressionTest). ✅
- **Not fully re-audited this pass:** per-route policy coverage across all 731 routes — sampled routes enforce role middleware; a full route-by-route sweep remains open (R-02).

## Sensitive-data exposure
- No secrets in docs/screenshots (verified captures use fixtures only). .env not touched.
- Proof images auth-gated (`/api/files/payment-proofs/.../view`).

## Input validation
- POS rejects insufficient cash; oversize idempotency key rejected pre-action; pet photo type/size validated client+server; stock over-decrement → 422; invalid weekday/dup day-off → 422.
- Duplicate payment reference → 422 across all four proof flows.

## Session/token risks
- Sanctum PAT + custom middleware; no token expiry audit performed (R-03) — tokens appear long-lived; recommend documenting rotation/revocation procedure for admin.

## Remediation needed
None blocking demo. R-02 (full route sweep) and R-03 (token TTL policy) recommended before production.
