# Phase 6 — Final Release Review and Merge Readiness

Date: 2026-10-11 · Reviewer: coordinated review pass · Scope: `release/revision-b-rc1` vs `main`

## 1. Verified branch and commit map

| Ref | Commit | Status |
|---|---|---|
| `main` | `38635168414460e217bab97d825e47367db5d42a` | Untouched — verified |
| `backup/revision-b-20261011` | `6ed92f860a4d47333feafd16d63a83d137264204` | Preserved snapshot |
| `release/revision-b-rc1` | `7e5c02c91722bf1e1d50ab01444fbd970f91cdaf` | Candidate HEAD |
| ├ `d95ba7e` | Implementation + Phase 2 verification fixes | |
| └ `7e5c02c` | Test-only: fixture-resilient check-in spec | |

Working tree: only regenerated `browser-evidence/*` and `test-results/.last-run.json` (uncommitted, expected). No unexplained changes.

Preservation integrity: `Pawesome_Recovery/phase3-20261011/` intact; `snapshot-vs-main.patch` SHA-256 `1dbe40b7…` matches recorded hash; `working-tree-uncommitted.patch` `20b17203…`.

## 2. Candidate diff summary

55 files, +1,862/−719 vs `main`. Backend: 14 app files + 11 test files. Frontend: 18 source files + 6 E2E specs. No migration, manifest, env, or deploy-config changes.

## 3. Findings (severity-ranked)

### Critical / High — none found.

### Medium — none found.

### Low / observations

1. **VAT applicability unresolved (business gate, not a defect).** `ReceiptBreakdown` centralizes a 12% VAT-inclusive model (`total × 12/112`); POS receipt uses persisted `tax_amount`/`subtotal`; frontend no longer computes VAT and omits the line when absent. Requires business/accountant confirmation before production billing decisions.
2. **Hardcoded wallet number** `0917 123 4567` in `PaymentUploadModal.jsx` (pre-existing, not introduced here) — confirm real GCash/Maya account details before production.
3. **Flaky test:** `cross-role-main-workflow` first attempt can fail 422 "outside shop opening hours (10AM–6PM)" depending on run time-of-day; passes on retry. Recommend a deterministic time fixture. Test-only, not an app defect.
4. **Staff grooming fallback:** `GroomingController` rejects unknown services for customers but staff-submitted grooming with an off-catalog service name still falls back to the client `amount`. Acceptable for staff trust level; noted.
5. **Legacy receipt fallback:** for pre-settlement-ledger paid records, receipts synthesize a single payment of the full total. Correct for fully-paid legacy rows; would misrepresent a hypothetical partially-paid legacy row (edge case, no such rows expected).

### Verified controls (positive confirmations)

- **Check-in ID integrity:** `BoardingController::checkIn` locks the row (`lockForUpdate`), re-validates status/paid/date gates inside the transaction, and propagates `checked_in` to the linked SR. `ReceptionistRequestController::updateStatus` delegates to the real boarding check-in when a boarding is linked, so a numeric SR id can never target an unrelated boarding. `ReceptionistCheckInForm` now loads `boarding-requests` directly and dropped the cross-table fallback. Browser-verified: POST hit the boarding id, duplicate → 409/422.
- **Foreign-pet rejection:** authenticated bookings require `pet_id` owned by the caller (422 otherwise); guests must supply `pet_name`. Server resolves `pet_name`/`pet_type` from the record, ignoring client-supplied values.
- **Cash removal (customer-facing only):** all customer proof-upload endpoints now require `gcash|maya` + reference + file. Cashier/POS cash collection paths untouched.
- **Authoritative pricing:** walk-in hotel rate comes from the `HotelRoom` record; vet/grooming prices from the services catalog; unknown services → 422. Client-supplied amounts are never trusted.
- **Vet cancellation:** predefined reason codes via `Appointment::CANCELLATION_REASONS`; `other` requires an explanation; reason always mandatory; cancellation propagates to the linked SR (completed SRs untouched).
- **Payment integrity:** order verification records a `PaymentSettlement` inside the same transaction with an idempotency key; refunds/voided rows excluded from `amount_paid`; `balance_due` never negative.
- **Tracker visibility:** terminal statuses (cancelled/rejected/no_show) render with a terminal badge for a 7-day window instead of disappearing.
- **Security:** no secrets/env/debug in diff; proofs stay on the private disk with `deleteOld: false` evidence retention; no authorization middleware weakened; no Hostinger/deploy files touched.

## 4. Test evidence on the candidate

| Suite | Command / scope | Result |
|---|---|---|
| Backend | `php artisan test` on MySQL `pawesome_test` (HEAD `7e5c02c`) | **502 passed / 0 failed / 2,434 assertions, exit 0** (95.5s). 504→502 delta = 2 excluded `EmailAuthFlowTest` rollback tests (unrelated `AuthController` WIP) — verified |
| Frontend build | `npm run build` | **exit 0**, 2,162 modules, 18.9s |
| Revision spec | `revision-b-verification.spec.js` chromium | **8/8 PASS** (7 in one run + check-in re-run after fixture reseed; dynamic boarding-id assertion confirmed POST to `/boarding-requests/48/check-in`) |
| E2E matrix | cross-role, boarding-billing, phase4 payments, cashier deep-link + dashboard, 5 responsive audits, mobile-portrait ×4 projects | **153 passed, 0 failed, 1 flaky, exit 0** (9.4m) |

Flaky = cross-role first attempt (see Low #3). No production data used; fixtures provisioned via API in dev DB.

## 5. Exclusions confirmed

`AuthController.php` rollback WIP + its 2 `EmailAuthFlowTest` tests, `attendance.js` (newline-only), `HOSTINGER_MIGRATION_AUDIT.md`, `pawesome_backend_test.zip`, and generated test artifacts are **not** in the candidate. Preserved in the recovery dir for a separate review cycle.

## 6. Migration & rollback implications

No new migrations in the candidate. The `service_requests.pet_type` migration predates this revision (on `main`, additive nullable column, already applied locally). Rollback: reverting the candidate is a code-only revert; no schema changes to unwind.

## 7. Deployment readiness checklist (for the separately-authorized staging pass)

- [ ] Vercel: `VITE_API_BASE_URL` points at the Railway API origin
- [ ] Railway: `APP_DEBUG=false`, production `APP_KEY`, DB credentials, `APP_URL`/`FRONTEND_URL`
- [ ] CORS + Sanctum domains exactly match the Vercel origin
- [ ] `php artisan migrate` runs at deploy; DB backup/snapshot before first deploy
- [ ] Persistent volume or object storage for `storage/app` (public + private disks; proofs must stay private)
- [ ] Queue worker + scheduler (`emails` queue, `email-deliveries:dispatch`) or documented `sync` for demo
- [ ] Brevo/`MAIL_MAILER` configured; `MAIL_FROM_ADDRESS` a verified sender
- [ ] Smoke: auth, booking, payment submit/reject/accept, receipt VAT breakdown, notification/email behavior
- [ ] Health check + logs monitored; rollback = redeploy previous Vercel/Railway revision

## 8. Recommended next action

1. Business/accountant confirms VAT treatment and real e-wallet account details.
2. Reviewer approves the `main..7e5c02c` diff (this document).
3. Authorize merge of `release/revision-b-rc1` → `main` (standard merge; no force-push).
4. Deploy to staging-equivalent Railway/Vercel config and run the Phase 9 checklist before production sign-off.

## 9. Go / No-Go

**GO for merge review** — the candidate is verified, scoped, and clean. **NO-GO for production** until: (a) VAT applicability confirmed by business/accountant, (b) Vercel↔Railway staging verification passes, (c) merge to `main` is explicitly authorized.
