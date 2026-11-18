# Final Database Integrity

**Date:** 2026-11-18 · **Gate C:** `browser-evidence/database-readiness-audit/database-readiness-audit-20261118-131044.json` — **122 pass / 0 fail / 2 warn**. Engine verified: **MariaDB 10.4.32** (NOT MySQL 8 — see qualification below).

## Independent integrity SQL (dev DB `pawesome`) — all zero
| Check | Result |
|---|---|
| Duplicate payment numbers | 0 |
| Duplicate boarding receipts | 0 |
| Orphan `payments.sale_id` | 0 |
| Orphan `sales.customer_id` → customers | 0 |
| Orphan `customer_orders.customer_id` → users | 0 |
| Negative inventory stock | 0 |
| Negative boarding balances | 0 |
| Invalid sale statuses | 0 |
| Refunded records without payment row | 0 |
| Boarding room reservation overlaps | 0 |
| VAT mismatches (net+VAT ≠ gross) | 0 |
| Paid-but-unverified orders | 0 |

## Known exception (P3)
- **7 historical paid `boardings` rows lack `receipt_number`** — legacy/incomplete payment metadata (`verified_by`/method/`paid_at` null). Not reproducible in current workflow (verify path issues `BD-REC-*` receipts). See FINAL_KNOWN_ISSUES; scoped backfill optional, not a blocker.

## Schema notes (Gate C mediums)
- Logical-only FKs: `appointments.service_request_id`, `service_requests.customer_id` — columns exist, no enforced constraint. Data clean today; constraint migration recommended in a future schema pass.
- Dual room tables (`boarding_rooms` catalog vs `hotel_rooms` rates) — documented design.

## Revenue reconciliation (Gate D — 50/50)
Canonical `RevenueService` = API = independent SQL on both DBs: dev **₱62,225**, audit **₱5,380**. All report surfaces use identical collected-revenue semantics after the 24-defect remediation.

## Environment qualification
MariaDB 10.4.32, sql_mode `NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION` (lenient — missing `STRICT_TRANS_TABLES`). **MySQL 8 strict-mode behavior, FK/index enforcement, aggregates, locking, and migration verification remain PENDING** — CI (`.github/workflows/ci.yml`) runs MySQL 8; local pass is not equivalent proof.
