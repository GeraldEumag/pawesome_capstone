# Documentation QA Report

**Review date:** 2026-10-22 (v0.2)
**Application build:** Local dev build verified at runtime (frontend :3000, API :8000, MySQL `pawesome`)
**Overall result:** VERIFIED (substantial). All principal customer→staff→payment, booking (online + walk-in + hotel), clinical, POS, and user-provisioning chains executed and passed at runtime; remaining CODE-REVIEWED items are scoped below.

## Runtime evidence

- `npx playwright test e2e/manual-audit-regressions.spec.js --project=chromium` → **2/2 PASS** (cashier Dashboard fix; Create User role list).
- `npx playwright test e2e/manual-verification-pass.spec.js --project=chromium` → **11/11 PASS** (after one selector fix; login, kiosk, 8 role workspaces, customer nav labels exact-match, grooming booking E2E).
- `npx playwright test e2e/manual-e2e-chain.spec.js --project=chromium` → **3/3 PASS** (payment chain to receipt `SR-REC-20261022124801-271`; reversible inventory adjust; vet request→approve→appointments).
- `npx playwright test e2e/manual-e2e-chain2.spec.js --project=chromium` → **6/6 PASS** (walk-in→counter cash; POS sale+void; proof rejection; full consultation cycle; admin create-user+welcome intent; hotel boarding+vax verify+approve). Note: a later full-suite rerun hit room-occupancy 422 on the hotel POST (room 1 held by its own prior fixture boarding 60 on the same date) and previously soft-passed; the spec now falls back to verifying the prior fixture's recorded end-state or hard-fails (D-09).
- `npx playwright test e2e/manual-e2e-chain3.spec.js --project=chromium` → **8/8 PASS** (register→verify→reset→login; inactive + role gates; kiosk PIN both directions; leave file→reject; correction file→reject; day-offs set; supplier+batch roundtrips; payroll create→approve→release). Note: verify/reset completion uses planted hashed tokens — mailbox delivery unprovable.
- Machine-readable results: `audit/runtime-verification.json`, `audit/runtime-verification-chain.json`, `audit/runtime-verification-chain2.json`.
- 18 screenshots in `../screenshots/` — privacy-reviewed, test fixtures only.

## Per-section status

| Manual section | Result | Evidence / remaining work |
|---|---|---|
| §3.1 Sign in | VERIFIED | UM-001; all 8 seeded roles authenticated and routed |
| §3.2 Register / §3.3 verify+reset | VERIFIED | Register→verify→forgot→reset→login chain executed (e2e-reg user); verify/reset completion via planted hashed tokens; intent rows reached SMTP `accepted`. Mailbox delivery unprovable |
| §4.1 My Pets | VERIFIED (page) | UM-003 |
| §4.2 Grooming/vet request | VERIFIED (E2E) | UM-004/004a/004b; request created via UI confirm |
| §4.3 Hotel reservation | VERIFIED | Boarding 60: customer booked w/ vax card → receptionist verified card → approved ("inventory deducted"); outbox intents queued |
| §4.4 Payment proof + tracking | VERIFIED (E2E) | Proof upload, queue visibility, verify, paid state, receipt number; rejection path verified (SR-273) |
| §4.5 Store orders | CODE-REVIEWED (disabled) | 410-confirmed in source; scope decision is owner's |
| §4.6 Notifications/history/medical/profile | TESTED | Pages rendered incl. Medical (UM-011); preference-save not exercised |
| §5.1 Receptionist review | VERIFIED | Queue render (UM-005) + approve executed via API |
| §5.2 Walk-ins | VERIFIED | SR-272 created via walk-ins API (existing customer) → approved → settled as counter cash |
| §6.1 Payment approvals | VERIFIED | UM-006 real pending row; verify + receipt issued |
| §6.2 POS sale | VERIFIED | Sale #73 processed (service item, cash ₱200) → receipt data → voided cleanly |
| §6.3 Transactions/history | TESTED | Pages loaded |
| §7.1 Stock review | VERIFIED (page) | UM-007 |
| §7.2 Stock change | VERIFIED | remove 1 → set restore; two `manual_adjustment` logs; net-zero |
| §7.3 Suppliers/audits | TESTED | Supplier create→delete + batch receive→dispose roundtrips verified; barcode/audit pages not exercised |
| §8.1 Vet consultation | VERIFIED | Appt 66: start→in_consultation→draft record 12→finalize→complete→awaiting_payment+billing |
| §9 Manager | VERIFIED | Reports rendered (UM-009); payroll lifecycle (create→approve→release→paid) on fixture user; leave file→reject; day-offs set |
| §10 Admin | VERIFIED | Manage Users rendered (UM-010); user 73 created via API + welcome outbox intent accepted (delivery not provable) |
| §11 Super Receptionist | TESTED | Landing rendered (UM-012) |
| §12 Self-service + kiosk | VERIFIED | Kiosk PIN gate both directions; attendance-correction file→reject; manager-filed leave→reject; My Payroll rendered |
| §14 Cross-role chain | VERIFIED | Full grooming payment chain + vet assignment chain |
| Security/privacy | PASS | No credentials/PII in manual or captures |

## Defects found during the runtime pass

| ID | Defect | Disposition |
|---|---|---|
| D-01 | `GET /api/cashier/payment-requests` 500'd before migration — `service_billing_payment_requests` table missing; dev DB was ~7 migrations behind | Resolved via approved `php artisan migrate` (additive). Environments must stay migrated; not an app-code defect. |
| D-02 | Cashier sidebar "Dashboard" opened the full-screen POS | **Fixed** (`CashierSidebar.jsx` → `/cashier/dashboard`); regression spec added |
| D-03 | Create User offered a `payroll` role the backend rejects | **Fixed** (`CreateUser.jsx` option removed); regression spec added |
| D-04 | Customer nav documented as "Payments" in v0.1 | Corrected to "My Requests" (v0.2 manual) |
| D-05 | Vet/Admin nav lists omitted Dashboard; Manager list omitted Day-Off Schedule | Corrected (v0.2 manual) |
| D-06 | Docs claimed local `log` mailer; actual config is `MAIL_MAILER=smtp` — intents reach provider `accepted` | Corrected documentation (config observation, not an app defect) |
| D-07 | Day-off clear-to-empty rejected: `PUT .../day-offs {days:[]}` → 422 "days field is required" — no API way to remove all day-offs | Minor API limitation; residue [6,0] left on fixture user 73; owner may want a dedicated clear path |
| D-08 | `leave_balances` table empty for all users — employee self-filing always returns "Insufficient leave balance" | Environment/seed gap, not app defect; manager-filed leave + reject verified as fallback path |
| D-09 | chain2 hotel test recorded `BLOCKED` on booking 422 then returned early → silent pass; chain3 recorded `TESTED` on failed checks without asserting | **Spec defects (not app defects), fixed:** hotel test now falls back to verifying prior fixture (boarding 60) or hard-fails; chain3 now asserts on every conditional record (unverified-403, inactive-login, role-gates, PIN, supplier delete, batch math, payroll release) |

### Evidence-file notes

- `audit/runtime-verification.json` records only the grooming-booking result + console-error array; the 11/11 verification-pass outcome is terminal evidence (specs passed; the file does not enumerate every check). Treat as a partial artifact.
- `frontend/e2e/plant-token.php` is an E2E helper that plants hashed tokens in `email_verification_tokens`/`password_reset_tokens` for fixture accounts — used because `MAIL_MAILER=smtp` (not log) makes link tokens unrecoverable locally. It does not bypass the endpoint's hashing/expiry checks.

## Sign-off restriction (unchanged in principle)

The manual must not be labeled fully verified/submission-final until the remaining CODE-REVIEWED state-changing flows are exercised in an approved environment, email delivery is proven in a configured environment, the school template is applied, and remaining open gaps (G-02, G-03, G-10, G-12, G-15, G-16) are resolved or accepted by the project/adviser.
