# Phase 10B Phase 2 — Controlled Release Preparation

**Date:** 2026-10-11 · Branch `main` @ `66ff1d2` · **Nothing staged, committed, pushed, or deployed.**

## 1. Repository state (revalidated)

- HEAD `66ff1d2` = `origin/main` = `production/main`. All three in sync.
- Working tree: **56 modified + 25 untracked** (81 entries). No staged changes.
- `git diff --check`: clean (pre-existing CRLF warnings only).
- Remotes: `origin` → `GeraldEumag/pawesome_capstone`; `production` → `llanetageraldrudolph-commits/pawesome` (what Railway/Vercel deploy).
- No changes at risk of loss; nothing was fetched, pulled, stashed, or switched.

## 2. Changed-file classification

### A. Duplicate-approval fix
- `backend/app/Http/Controllers/ReceptionistRequestController.php` — idempotent guard: re-approving an `approved` SR returns early instead of inserting a second `boarding_room_reservations` row. *(File also contains channel writes — inseparable in-file; both ride in one commit.)*

### B. Payment-method preservation fix
- `backend/app/Services/PaymentVerificationService.php` — proof verification prefers the stored digital `payment_method`; explicit `cash` input can't overwrite `gcash`. Also contains channel-aware eligibility (`walk_in` OR rejected-proof counter fallback). Inseparable — one commit.

### C. Chatbot localhost fallback fix (Phase 10A)
- `frontend/src/services/chatbotService.js` — `API_BASE` now derives from shared `API_URL`.
- `frontend/tests/chatbot-api-base.test.mjs` + `frontend/tests/esm-specifier-hooks.mjs` — 9 regression tests.

### D. Booking-channel feature (the release's structural change)
- **New:** `backend/app/Support/BookingChannel.php`, `backend/app/Models/Concerns/InheritsBookingChannel.php`, `backend/database/migrations/2026_10_12_000000_add_booking_channel_to_booking_tables.php`
- **Controllers** (channel assignment at creation): `BoardingController`, `AppointmentController`, `Api/ServiceRequestController`, `Api/GroomingController`, `ChatbotWorkflowController`, `Customer/PortalController`, `Receptionist/WalkInController`, `Cashier/DashboardController` (queue gating), `ReceptionistRequestController`, `PaymentVerificationService` (eligibility)
- **Models** (fillable + inherit-on-create): `Appointment`, `Boarding`, `Grooming`, `MedicalConfinement`, `Sale` (void fields only — see below), `ServiceRequest`
- **Frontend channel consumers:** `PaymentApprovals.jsx`, `usePaymentApprovals.jsx` (walk-in/counter-fallback queue shaping), `GroomingForm.jsx`, `VetForm.jsx` (payment-upload eligibility)

### E. Void-reason audit feature (bundled with D since they share files)
- `backend/app/Models/Sale.php` — `void_reason`/`voided_by`/`voided_at` persistence
- `frontend/src/utils/alert.jsx` — `VOID_REASONS` + `showReasonPrompt`
- `frontend/src/components/cashier/CashierTransactions.jsx` — void UI + transaction detail
- `frontend/src/components/cashier/{CashierHistory.css, PaymentApprovals.css}`, `frontend/src/styles/dashboardGlobal.css`

### F. Tests
- New: `PaymentBookingChannelTest.php` (19 tests incl. both defect regressions), `booking-channel-gating.spec.js`, `phase9-capstone-b-demo.spec.js`, `tx-management-check.spec.js`, `frontend/tests/*`
- Fixture updates: `CashierQueueDedupeTest`, `ServiceBillingRemediationTest`, `TransactionAtomicityTest` (channel fields + void tests)

### G. Documentation/evidence
- `AGENTS.md`, all `PHASE*.md` reports, `docs/PHASE_10*.md`, `browser-evidence/*` (regenerated PNGs/JSON), `documentation/screenshots/phase11/`

## 3. Test results (executed this session)

| Suite | Result |
|---|---|
| `PaymentBookingChannelTest` | **19/19** pass (72 assertions, 17.1s) — includes both defect regressions |
| `TransactionAtomicityTest` + `CashierQueueDedupeTest` + `ServiceBillingRemediationTest` + `ReceptionistReasonRequiredTest` | **53/53** pass (205 assertions, 24.0s) |
| `node --test tests/chatbot-api-base.test.mjs` | **9/9** pass |
| `npm run build` | PASS (19.9s, Phase 10A) |
| Full backend suite | **542/542** pass (Phase 10, 108.7s — tree unchanged since except 10A chatbot/tests/docs) |

## 4. Migration risk assessment

`2026_10_12_000000_add_booking_channel_to_booking_tables.php`:
- Adds nullable indexed `booking_channel` (20-char) to 5 tables, **guarded by `hasTable`/`hasColumn`** — idempotent, safe on reruns.
- Backfills only boardings with `hotel_room_id` → `walk_in` (positive-detection only; ambiguous rows stay NULL = treated as `online`, strictest).
- `down()` drops index + column, guarded — clean rollback.
- **Local status:** already `Ran` (batch 12). **Production:** will execute via Railway `preDeployCommand: php artisan migrate --force`. Low risk: nullable additive column, no data rewrite of existing rows except the narrow `hotel_room_id` backfill.

## 5. Proposed commits

| # | Commit | Files |
|---|---|---|
| 1 | `feat(booking): add booking_channel to distinguish online vs walk-in` | Migration, `BookingChannel.php`, `InheritsBookingChannel.php`, 6 models, 9 controllers (channel parts), `PaymentVerificationService.php`, frontend channel consumers (PaymentApprovals, usePaymentApprovals, GroomingForm, VetForm) |
| 2 | `fix(payments): preserve stored payment method + prevent duplicate approval + void reasons` | `PaymentVerificationService.php` and `ReceptionistRequestController.php` **cannot split** — they carry both channel and fix code; this commit covers the defect-fix hunks alongside `Sale.php`, `alert.jsx`, `CashierTransactions.jsx`, cashier CSS |
| 3 | `test: booking-channel, payment, and atomicity regression coverage` | `PaymentBookingChannelTest.php`, 3 modified test files, 3 new e2e specs, `frontend/tests/` |
| 4 | `fix(chatbot): remove hardcoded localhost API fallback` | `chatbotService.js` |
| 5 | `docs: phase 9/10 reports, evidence, and release notes` | `AGENTS.md`, all `PHASE*.md`, `docs/PHASE_10*.md`, `browser-evidence/*`, `documentation/*` |

**Note:** commits 1–2 share files (`ReceptionistRequestController`, `PaymentVerificationService`) — they're staged by hunk via `git add -p` or combined into one commit if the boundary is too fragile. I'd combine them into `feat(payments): booking channel + integrity fixes` to avoid a broken intermediate state.

## 6. Deployment plan

- **Push `main` → `production` remote** → Railway auto-deploys backend (predeploy runs the channel migration), Vercel auto-deploys frontend (needs `VITE_API_BASE_URL=https://pawesome-production-c73a.up.railway.app/api` already set — verify before push).
- **Rollback:** Vercel instant-rollback; Railway redeploy previous deployment `6447fe69`; migration `down()` is guarded and safe.
- **Post-deploy checks:** `/api/health`, bundle scan for `127.0.0.1`, `migrate:status` shows channel migration, one booking → approve → verify → receipt chain, duplicate-approve returns idempotent.

## 7. Blockers / risks

- **BLOCKED (by design):** push/deploy needs your explicit approval — nothing will be staged until then.
- Vercel `VITE_API_BASE_URL` value can't be verified (no CLI auth) — must be confirmed in dashboard before push, or the built bundle falls back to same-origin `/api` which will 404 on Vercel.
- Brevo delivery evidence still unverified (env set, scheduler runs — not proof of delivery).
- Stale `pawesomezapote.vercel.app` deployment remains live — cosmetic, can confuse demos.

## 8. Gate decision: **READY FOR REVIEW**

All tests green, migration is idempotent and additive, commits are cleanly scoped. Awaiting your approval to stage + commit (locally only — push is a separate gate).
