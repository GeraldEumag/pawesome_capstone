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
