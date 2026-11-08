# Security Test Results — 2026-11-08

Status: **Verified targeted remediations; incomplete exhaustive security audit.** Final totals and raw evidence are in `SYSTEM_AUDIT_TRACKER.md` and the run's JUnit files.

| Finding | Priority | Reproduction | Correction |
| --- | --- | --- | --- |
| SEC-001 token expiration bypass | P1 | Explicitly expired and configured-lifetime tokens returned 200 instead of 401 | Custom middleware applies both Sanctum expiration boundaries; valid/revoked tokens also covered. No invented default TTL. |
| SEC-002 aggregate auth-IP bypass | P1 | Rotated submitted identity escaped an IP-wide auth cap | Keep account/IP bucket and add aggregate IP bucket using existing API rate setting; recovery and second-IP isolation tested. |
| SEC-003 concurrent keyed POS duplicate | P1 | Two independent API processes produced different sale IDs for the same actor/key/payload; stock 5 to 3 | Lock authenticated user row and encompass action/response persistence in one DB transaction; race returns one sale, stock 5 to 4. |
| SEC-004 mixed /auth/me identity | P2 | Valid bearer A plus valid cookie B returned B's profile | Header precedence now matches the authenticated middleware principal. Test explicitly enables cookies. This is not proof of arbitrary-token acquisition. |
| VET-001 tech intake contract conflict | P2 | Strict browser case got appointment/history 403s; duplicate route overrode shared access | User chose read/check-in board. Shared GET restored; tech list uses limited fields/relations; vet history and clinical writes stay forbidden; UI hides doctor controls and does not fetch forbidden history. |

## Additional checks

- Backend suite includes ownership/private-file/role tests, pricing tampering, transaction rollback, booking/payment rules, auth/email token flows, outbox suppression and receipt/chatbot guards. Consult exact final case results; this is not a blanket OWASP certification.
- Composer audit: no known advisories reported for the installed lock state.
- npm audit: existing xlsx 0.18.5 has high-severity advisories GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9; no registry fix offered. Source search found workbook export calls, not XLSX.read/readFile parsing. Exploitability is not established; dependency exception/replacement remains open. No force update or policy bypass performed.
- Global SecurityHeaders is installed, but production HTTPS/CSP/CORS/edge behavior has not been tested remotely.

## Open security evidence

Complete every-resource/verb ownership and privileged-field matrix, all sensitive limiter coverage, proxy trust, large/hostile upload cases, dependency remediation, external storage ACLs, runtime secret/debug policy, logging redaction and a deployment/staging security pass. No P0 was demonstrated; that is not proof none exists.
