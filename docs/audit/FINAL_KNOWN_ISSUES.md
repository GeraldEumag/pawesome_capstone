# Final Known Issues

**Date:** 2026-11-18 (infrastructure gate pass) — open items only.

## P0 / P1 / P2
None open. Zero critical, major, or significant application defects remain.

## P3 — application/data
| ID | Item | Disposition |
|---|---|---|
| KI-01 | 7 historical paid `boardings` rows missing `receipt_number` | Legacy data hygiene; current verify path issues receipts. Optional backfill |
| KI-02 | Logical-only FKs: `appointments.service_request_id`, `service_requests.customer_id` | Schema hardening opportunity; zero orphans |
| KI-03 | Public room/add-on catalog endpoints | Accepted marketing design |
| KI-04 | Dual room tables (`boarding_rooms`/`hotel_rooms`) | Documented design |
| KI-05 | xlsx 0.18.5 advisories | Risk accepted — write-only usage verified |
| KI-06 | ~3.6 MB main JS chunk | Build warning; code-split later |

## Environment gates — PENDING (not defects)
| ID | Item | Status after this pass |
|---|---|---|
| ENV-01 | MySQL 8 compatibility | **RESOLVED** — local MySQL 8.0.44 strict mode (1128 tests, 1 skip, 0 fail) **and** GitHub Actions `mysql:8.0` run 44308050820 green on `2eb0161` |
| ENV-02 | Production env values | Structure verified; `SESSION_SECURE_COOKIE` template fixed (`false`→`true`). Deployed values pending deploy authorization |
| ENV-03 | Mail delivery | **Resolved at achievable level** — Brevo SMTP 250 acceptance, webhook auth+reconciliation+suppression verified live, **recipient delivery confirmed in Gmail Primary inbox** (test + 8 notification types; `browser-evidence/email-delivery/gmail-inbox-confirmation-20261118.png`). Remaining: `BREVO_API_KEY` for provider-side event logs (optional), custom domain for SPF/DKIM/DMARC |
| ENV-04 | Queue/scheduler supervision | Commands + schedule verified; daemons run at deploy |
| ENV-05 | Browser smoke breadth | 15/15 serial pass recorded |

## Product decision — customer-store order workflow
- **State:** 410 disabled — re-verified; preserved unchanged.
- **Decision:** remain disabled until product owner chooses retirement or approved re-enablement. No code change made.
