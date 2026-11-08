# System Architecture Audit — 2026-11-08

Status: **Partial audit; not a complete architectural sign-off.** Run baseline: `6a38d0e`. See `SYSTEM_AUDIT_TRACKER.md` for current results and findings.

## Verified repository structure

- React 18/Vite SPA: `frontend/src/routes/*Routes.jsx`, `components/ProtectedRoute.jsx`, `context/AuthContext.jsx`, `api/client.js`, `utils/auth.js`.
- Laravel 12 API: `backend/routes/api.php`, custom `ApiTokenAuth`, `EnsureRole`, response normalization and named rate limiters in `RouteServiceProvider`.
- Laravel Sanctum personal access tokens; the custom middleware, not Sanctum's guard, is the primary bearer boundary. Expiration enforcement therefore needed a verified correction.
- MySQL-compatible persistence. Local audit engine is **MariaDB 10.4.32**, not MySQL 8. CI provisions MySQL 8; that CI environment was not executed in this run.
- Billing/payment/inventory services already use database transactions and row locks. Idempotency previously persisted only after endpoint execution; a two-server race demonstrated duplicate sales. The middleware now serializes keyed actions on the authenticated user row within one outer transaction.
- Email: transactional `email_deliveries` outbox, dispatcher/reconciliation commands, `SendEmailDelivery`, configured mail transport. This run uses the array mailer; no provider/mailbox delivery claim.
- Shared private/public file service and secure download controller. Actual remote bucket/volume permissions remain unverified.

## Modules and integration boundaries

Customer pets/bookings; receptionist scheduling and rooms; cashier POS/payment verification; inventory/batches/audits; veterinary visits, consent, diagnostics, prescriptions, vaccination and confinement; manager reporting/HR/payroll/leave; admin users/settings/logs; kiosk, live chat, chatbot and receipt scanning.

`super_receptionist` and `vet_tech` are enabled in addition to the seven primary roles. Payroll is an enabled module, not evidence of a separate payroll-manager role. Customer product-order checkout is deliberately disabled (410), not an audited active commerce flow.

Ownership must be mapped per resource: `pets.customer_id` references customer records, while `service_requests.customer_id` stores a user ID. Do not apply one blanket customer-ID assumption.

## Evidence and limitations

- Effective API route inventory: `../../browser-evidence/system-security-audit-20261108/routes-post-vet-tech.json` (722 definitions).
- Fresh isolated E2E migration/seed succeeded: 93 InnoDB tables, 181 migration rows, 136 FK-column relationships.
- Backend PHPUnit, frontend Vitest, production build and controlled Playwright runs were executed; exact final outcomes are in the tracker/JUnit artifacts.
- Full page/action-to-resource inventory, all relationship constraints, per-module query profiling, full duplicated/dead-code review and all integration failure modes remain outstanding. Historical architecture reports are references, not fresh verification.
