# SECURITY_AUDIT.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · Scope: re-verification of prior security claims against current HEAD + revision changes. Defensive review only.

## 1. Authentication & session

| Control | Evidence | Status |
|---|---|---|
| Sanctum PAT issue/revoke | `AuthController` login/logout; token abilities | VERIFIED (code) + suite |
| Token expiry/TTL | No TTL/rotation policy on PATs | ACCEPTED_GAP C-02 (deployment hardening) |
| Inactive account | `ApiTokenAuth` rejects `!$user->is_active` on every request | VERIFIED (code) |
| Stale role normalization | `super_admin`→`admin` normalization in middleware | VERIFIED (code) |
| Email verification | `EnsureEmailIsVerified` blocks unverified customers on booking/checkout POSTs; staff exempt | VERIFIED (code) + `EmailAuthFlowTest` 33/33 |
| Password reset / enumeration | Generic "invalid or expired" responses; hashed tokens, 60-min expiry | VERIFIED (code) |
| Admin-created accounts | `AccountWelcomeMail` set-password link; plaintext creds never emailed | VERIFIED (code) |

## 2. Authorization (RBAC + resource-level)

- 7 roles + composite `super_receptionist`; `admin` all-staff, blocked from customer portal.
- Prior Phase 13 matrix: 784 probes, 0 violations — **HISTORICAL**; Phase 4 spot re-verification pending.
- Resource-level isolation evidenced by tests: `ReceiptScannerTest` (customer cannot view another's receipt), `PublicCatalogPrivacyTest`, cross-role specs.
- No permission changes made this revision.

## 3. Input validation & injection

- Form-request/`$request->validate` server-side throughout; privileged fields (`role`, `is_active`, `employee_no`) ignored on public register — regression-tested (`PublicRegistrationIntegrityTest`, fixed this revision).
- POS/checkout: client prices/totals/stock/status never trusted — server recompute inside transactions.
- Species compatibility enforced server-side (422 on crafted requests).
- Uploads: receipt scanner stores files privately; cashier-scoped proof access; `fake()->create()`-safe fixtures.

## 4. Sensitive data & secrets

- `composer audit` clean at baseline. `npm audit`: only `xlsx@0.18.5` advisories — write-only usage, risk-accepted (C-03).
- Email outbox encrypts recipients; token-bearing mailables mark queued payloads encrypted (`EmailMailableSecurityTest`).
- Payslip PDF embeds logo as data-URI (no remote fetch; Dompdf remote disabled).
- `.htaccess` denies HTTP access to repo root (protects `.env`/storage); loose PHP audit scripts removed from `backend/` (F-01 containment), utilities live outside docroot in `C:/xampp/pawesome-maintenance/`.
- No secrets committed; `.env` untouched.

## 5. Transport/config

- CORS/Sanctum statefile config present; production domains are deployment-gate items (BLOCKED — see DEPLOYMENT_READINESS_REPORT).
- CSRF: API is token-based (Sanctum PAT), cookie-session CSRF not applicable to `/api` PAT flow; verified no session-auth endpoints exposed without Sanctum stateful guards.

## 6. Revision-specific security review

- UOM endpoints: `unit` whitelisted (`piece|pack|box`), quantities validated positive, conversion server-side only — no client authority over base-unit math.
- Barcode auto-generation: server-side EAN-13 with check digit; uniqueness enforced; clients cannot inject arbitrary barcode conflicts (create path only fills when absent; update path preserves cannot-clear rule).
- Index migration: no security surface change.

## 7. Open security items

| ID | Item | Disposition |
|---|---|---|
| C-02 | PAT TTL/rotation | ACCEPTED_GAP — deployment hardening |
| C-06 | Edge HTTPS, CORS/CSRF prod domains | BLOCKED — external gate |
