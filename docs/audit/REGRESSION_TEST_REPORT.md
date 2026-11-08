# Regression Test Report — Capstone B (2026-10-25)

## Environment
PHP 8.2.12 (XAMPP), MySQL `pawesome_test` on 127.0.0.1:3306 — verified empty of fixtures before runs (RefreshDatabase-safe). Frontend mocked-browser runs: Vite :3000 via `PW_START_FRONTEND=true`, `E2E_LIVE=false`.

## Executed — backend

| Command | Result |
|---|---|
| `php artisan test --filter='P1SecurityIntegrityTest'` | **15 passed / 60 assertions** (~50s) — token/inactive-user, POS manipulated price, addon-deduction-once, atomic stock block, addon restore on reject, server-side pricing, checkout-410, set-password link |
| `php artisan test --filter='PaymentBookingChannelTest\|PrivatePetPhotoTest\|BookingSchedulingIntegrityTest\|BoardingRoomLifecycleTest\|VeterinaryBillingPaymentFlowTest\|AuditRegressionTest\|EmailAuthFlowTest'` | **98 passed / 493 assertions** (~74s) — channel/payment rules, reference uniqueness, photo rules, boarding room reservation rules, vet billing, misc regressions, auth-email lifecycle |

**Not run:** full 606-test suite (time-boxed; subset covers audited areas). Prior full-suite pass recorded in `docs/PAWESOME_REVISION_AUDIT.md` (606/2967).

## Executed — frontend (mocked)

| Command | Result |
|---|---|
| `npx playwright test e2e/revision-b-confirmed-flows.spec.js e2e/customer-add-pet-modal.spec.js --project=chromium` (E2E_LIVE=false) | **12/12 passed** |
| Same + `e2e/receipt-pdf-regression.spec.js` (earlier pass) | 10 passed / 4 failed — failures all stale-spec, since repaired |
| `node frontend/.manual-v04-capture.cjs` | 8/8 live UI captures (docs task) |

## Test files modified (spec repairs only, no app code)

- `e2e/revision-b-confirmed-flows.spec.js` — landing-rooms test rewritten for deliberate removal (`3e75be0`); walk-in mock URL `/receptionist/walk-ins` + `data[]` shape; `.recent-item` selector; dynamic future `check_in`.
- `e2e/customer-add-pet-modal.spec.js` — error text + 10 MB limit to match `CustomerPets.jsx`.

## Known limitations

- No new application code ⇒ no new regression tests required; coverage relies on the existing 113-test evidence above.
- Mailbox delivery, physical printer output, simultaneous-race uploads: untested (env limits).
- `pawesome_test` left in post-RefreshDatabase state (fixtures absent, as found).

## Current remediation checkpoint — 2026-11-08

The sections above are historical, not current test results. Current local engine: MariaDB 10.4.32; user-approved disposable `pawesome_test`, separate `pawesome_e2e_audit` for browsers, array mail and isolated storage roots. MySQL 8 parity remains unverified.

- Final full backend after all changes: **913 passed, 1 skipped, 4141 assertions**, 297.428s. Skip: receipt image downscaling needs local GD. `backend-final-all-junit.xml`.
- Reviewed live Chromium suite: **12/12 passed**: nine enabled-role entry points, hybrid main workflow, two-process same-key POS race and actual UI vet-tech check-in. `browser-reviewed-junit.xml`.
- Phase 11 after limiter fix: **9 PASS / 1 PARTIAL**, one browser-submitted veterinary flow, zero 429s; six transient billing `ERR_FAILED` messages and nine expected 422 probes remain documented. `phase11-after-limiter-junit.xml`.
- Frontend Vitest: **29/29 passed**, six files; production build passed with large/mixed-import chunk warnings.
- Added regressions reproduce token expiry bypass, auth identifier-rotation bypass, mixed cookie/header identity, concurrent keyed POS double execution, missing Laravel proxy/default middleware, shared-IP API throttling and vet-tech intake access/scope. Negative vet-only history/clinical controls remain covered.
- Independent SQL confirmed the browser check-in persisted for appointment #6, checked_in_by #8, visible to assigned vet #7. The hybrid main spec alone is not full UI mutation proof.
- Failed pre-fix/invalid-fixture attempts remain in the audit artifacts and are not added to the final unique test totals.

Artifacts: `browser-evidence/system-security-audit-20261108/`. See `SYSTEM_AUDIT_TRACKER.md` for scope, exact commands, severity and remaining gaps. Full all-module UI, exhaustive ownership/verb matrix, production integrations, load/restore and remote deployment evidence remain incomplete; no full readiness claim.
