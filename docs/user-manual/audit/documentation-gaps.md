# Documentation Gaps and Open Questions

**As of:** 2026-10-22 (v0.2)

| ID | Gap / discrepancy | Status | Notes |
|---|---|---|---|
| G-01 | No running local frontend/backend during audit | **RESOLVED** | Runtime pass executed 2026-10-22 (serve :8000 + vite :3000, Chromium) |
| G-02 | No institution template found | OPEN | Formatting is standard-structure provisional; obtain official school template before submission |
| G-03 | Evaluator guide ≠ end-user manual | OPEN (unchanged) | `documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.md` kept untouched |
| G-04 | Historical screenshots unvalidated | RESOLVED | Replaced by genuine 2026-10-22 captures in `screenshots/` |
| G-05 | Store-order flows distinct/disabled | RESOLVED (documented) | Checkout/proof/cancel writes return HTTP 410; documented as disabled scope |
| G-06 | Payroll role option inconsistent | **RESOLVED (code fix)** | `CreateUser.jsx` Payroll option removed; backend never accepted it; regression-tested |
| G-07 | Email/notification delivery unexercised | PARTIAL | Intent→dispatch verified: `email_deliveries` rows reach `provider_status=accepted` via SMTP (`MAIL_MAILER=smtp`, not `log` as previously assumed). Recipient mailbox delivery unprovable (fake domains). Verify/reset completion verified via planted hashed tokens |
| G-08 | Payment workflow unexercised | **RESOLVED** | Full chain verified: proof→approve→queue→verify→receipt (`SR-REC-20261022124801-271`) |
| G-09 | Booking/status/inventory/vet source-only | RESOLVED | Chain2 spec verified walk-in→counter cash, POS sale+void, proof rejection, full consult cycle, hotel booking+approve, admin create-user; payroll/leave/day-off edits remain CODE-REVIEWED |
| G-10 | No DOCX/PDF tooling | OPEN | pandoc/soffice absent; Markdown remains the deliverable |
| G-11 | Create User Payroll submits rejected role | **RESOLVED** | Same fix as G-06 |
| G-12 | App/browser/device matrix unestablished | PARTIAL | Desktop Chromium verified; mobile viewports not exercised this pass |
| G-13 | Cashier Dashboard link → POS | **RESOLVED (code fix)** | Sidebar link now `/cashier/dashboard`; regression-tested |
| G-14 | Dev DB behind on migrations | RESOLVED | `service_billing_payment_requests` + 6 other pending migrations ran (approved); cashier queue returned 500 pre-migration — see QA report |
| G-15 | Kiosk PIN flow untested | OPEN | Gate renders (UM-013); clock-in requires configured PIN |
| G-16 | Support contact / institution owner | OPEN | Still unconfirmed |

## Evidence boundary (v0.2)

VERIFIED claims are backed by the 2026-10-22 Playwright runs (`e2e/manual-verification-pass.spec.js`, `e2e/manual-e2e-chain.spec.js`, `e2e/manual-audit-regressions.spec.js`) and dated screenshots. Everything else remains CODE-REVIEWED or is recorded as BLOCKED with the reason.
