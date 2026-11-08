# IDOR and Access Control Audit — 2026-11-08

Status: **Partial verification. No claim that all 722 route definitions are IDOR-safe.**

## Verified controls

- `CustomerDataIsolationTest`: Customer A cannot list/read/update Customer B's pet; query-supplied email cannot redirect request ownership; staff aliases reject customer/unauthenticated access.
- Full backend suite includes private pet/care/confinement proof, vaccination-card ownership, receipt polling isolation, veterinary billing ownership and role-matrix tests. Consult final JUnit for exact case outcomes; suite membership alone is not a pass.
- `AuthLoginTest` added a real mixed-cookie/header test using `withCredentials()`. Without that option JSON test requests do not send cookies, yielding a vacuous pass. With cookies enabled the original endpoint returned the other token's user ID. Bearer-first resolution now matches the middleware identity.

## Ownership model

Map `users.id`, `customers.id`, pet relationships and linked service requests separately. Downloads, exports, joins, eager-loaded relationships, customer medical visibility and staff care-team access require the same boundary as the parent record. Laravel scoping/middleware/services are the relevant protections; no Supabase RLS is applicable.

## Remaining tests

Complete the resource-by-verb A/B matrix, nested-parent mismatch tests, archived/deleted records, all attachment types, notification preferences/IDs, payroll self-service, legacy aliases and write-side unchanged-state assertions. Use valid foreign-owned fixtures and valid payloads; a 422 caused by malformed input does not prove authorization.

The mixed-identity defect is an identity-consistency issue requiring both valid credentials, not evidence that an arbitrary customer can obtain an administrator token. Broader privilege escalation has not been demonstrated by that test.
