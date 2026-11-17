# Anticipated Panel Questions — Technically Accurate Answers

**Date:** 2026-11-17 · Every answer below is verified against code, tests, or audit evidence.

## Architecture & Design

**Q: Why Laravel + React instead of a monolith?**
A: Decoupled SPA/API lets each role get a tailored UI while the API enforces one authorization layer. 722 API routes serve all modules; Sanctum tokens + a custom `ApiTokenAuth` middleware authenticate every request.

**Q: How is authorization enforced?**
A: Two layers: `ApiTokenAuth` authenticates the token, `EnsureRole` middleware gates every role prefix (`/api/admin/*` → admin, etc.). Route sweep: all 722 API routes carry auth + throttle except 29 intentionally public endpoints (throttled auth, public catalog/availability, kiosk PIN). 34 role-less authenticated routes are self-scoped `my-*` endpoints with controller-side ownership checks. Object-level IDOR is controller-enforced and E2E-probed (route-authorization-matrix spec: every route hit with a disallowed role).

**Q: Explain the database design.**
A: 93 tables, 184 migrations, 76 Eloquent models, 136 FK relationships verified on an isolated schema. Money is stored as DECIMAL; soft deletes preserve history; durable outbox pattern for email.

**Q: What's the `super_receptionist` role?**
A: Composite of receptionist + cashier + inventory for small-staff operations. `super_admin` was merged into `admin`. `admin` reaches all staff modules but is blocked from the customer portal by design.

## Payroll (the hardest questions)

**Q: Is payroll computed client-side? Can someone tamper with totals?**
A: No — found and fixed during audit (F-002). `store()` previously trusted client totals; now linked payroll rows are always recomputed server-side in `PayrollComputationService` inside a transaction. Test proves a tampered request body produces correct server values.

**Q: How do you prevent double-charging deductions?**
A: Found and fixed (F-001): attendance deductions were subtracted in `gross_pay` AND in `total_deductions`. Now attendance stays in gross only; `total_deductions` = statutory + tax + manual + loans + advances — a true component sum (deliberately not `gross−net`, because a net=0 floor would under-report). Verified: ₱26k/mo + 1 absence previously netted ₱9,891; now correctly ₱10,891.

**Q: Can the person who creates payroll approve it?**
A: For unlinked/manual rows — no (M-02). Maker-checker: creator self-approval returns 422, release requires `approved_by` + `pending` status, stamps `approved_by/approved_at`. Linked rows keep self-approval since totals are server-derived and the actor is the manager.

**Q: What if two payrolls get the same ID?**
A: Found and fixed (F-003): generation used `count()+1`, colliding with soft-deleted rows still holding the unique index. Now takes `MAX` suffix over `withTrashed()` + `retry(3)` regenerating the ID per attempt.

**Q: PAY-2026-0001 has zero statutory deductions — why?**
A: It's a linked, paid, arithmetically consistent half-month row (₱32k monthly → ₱16k). Zero SSS/PhilHealth/Pag-IBIG/tax is flagged for management confirmation — possibly an exempt employee or early manual entry. We did not modify historical financial data without authorization. *Rehearse this answer with management's confirmed explanation before the defense.*

## Security

**Q: How are payment proofs and files secured?**
A: All uploads through `FileStorageService::storeAndPersist` — store → DB write in a transaction → cleanup on failure. Payment proofs on a private disk, served via `/api/files/payment-proofs/{type}/{id}/view` with ownership checks; replaced/rejected proofs retained as evidence.

**Q: Do API tokens expire?**
A: Currently no — `sanctum.expiration: null`. This is a documented production limitation (R-03), deliberately deferred: changing TTL before the demo could break sessions. Production plan: define TTL, rotate/revoke on login, revoke on logout, expired-token handling, all-role tests.

**Q: How do you stop brute force / enumeration?**
A: `/api/auth/*` throttled to 5/min per account; forgot/reset/resend return generic responses (no account enumeration); email verification tokens are hashed with 60-min expiry; unverified customers can't book/checkout (staff exempt).

**Q: What about email?**
A: Every customer-facing email flows through a durable `email_deliveries` outbox — intent written inside the business transaction, then dispatched to a queue. Opt-out preferences checked at intent creation AND send time. Demo uses log/sync; production needs a real mailer + SPF/DKIM/DMARC (documented requirement, not claimed as done).

## Testing & Reliability

**Q: How do you know it works?**
A: 1,007 backend tests (5,106 assertions) on `pawesome_test` MySQL — 0 failures. 44 frontend unit tests. ~40 Playwright browser specs on an isolated stack (`pawesome_e2e_audit`) — 38/39 pass; the one failure is a test-design quirk (spec probes a day, UI intentionally shows the month), not an app defect. Cross-role chains verified end-to-end in a real browser.

**Q: What happens under concurrency?**
A: E2E-verified: concurrent stock movements can't oversell (insufficient-stock rejection), room-booking race is serialized, duplicate payroll generation rejected. Transactions wrap every multi-write path (documented in `TRANSACTION_ATOMICITY.md`).

**Q: What breaks in production that works here?**
A: Honest list: `APP_DEBUG=true` locally, `QUEUE_CONNECTION=sync` (no worker), dev mailer, no real domain/auth records, no backups verified, seed accounts present, tokens don't expire. The full gate list is in `PRODUCTION_DEPLOYMENT_READINESS.md` — we claim demo-ready, not production-ready.

## Scope & Decisions

**Q: Why is there no customer product checkout?**
A: Deliberate scope decision — returns 410. Payments flow through service billing (vet/grooming/hotel/confinement) + cashier POS, which covers the business's actual revenue model.

**Q: Why `₱` symbol everywhere but `PHP` in PDFs?**
A: `formatCurrency()` uses `Intl.NumberFormat("en-PH", PHP)` for all UI/API surfaces. jsPDF's Helvetica can't render `₱` (documented exception → `PHP`), and ESC/POS thermal output converts to ASCII `P`. Database/API values were never altered — presentation only.

**Q: What would you do differently / next?**
A: Custom date-range picker for the live report UI (currently month-scoped), PAT token TTL/rotation, fully automated route-policy CI check, production queue/scheduler hardening.
