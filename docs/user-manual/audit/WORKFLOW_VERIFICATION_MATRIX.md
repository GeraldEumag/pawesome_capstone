# Workflow Verification Matrix — v0.4 Audit

**Date:** 2026-10-25. **Env:** PHP 8.2.12, MySQL `pawesome_test` (empty at start), Vite dev server via `PW_START_FRONTEND=true`.
**Executed this pass:** backend feature subset (`php artisan test --filter=...`, **98 passed / 493 assertions / 74 s**) + mocked Playwright (`E2E_LIVE=false`, **10 passed / 4 stale-spec failures**).
**Carried evidence:** Revision B Phase 9 live run on the same code lineage (9/9 journeys, 18/18 correlations — `docs/PAWESOME_REVISION_AUDIT.md`) and v0.2 runtime pass 2026-10-22 (`audit/runtime-verification*.json`, `workflow-map.md`).

| # | Workflow | Segment verified & evidence | Status |
|---|---|---|---|
| W1 | Register → verify → booking allowed | `EmailAuthFlowTest` (BT): register intent, verify completion, reset, notices; unverified booking gate (v02) | VERIFIED |
| W2 | Customer books grooming/vet → receptionist approves → customer sees status | BT approve paths + P9 J1/J2 live + v02 UI chain (UM-004a/b) | VERIFIED |
| W3 | Customer uploads GCash/Maya proof → cashier verifies → receipt → customer sees Paid | BT proof/verify/channel tests + P9 J3 + v02 | VERIFIED |
| W4 | Reused payment reference on any flow → rejected | `PaymentReferenceGuard`: BT "payment reference cannot be reused" + P9 J3/J5/J9 all 4 flows → 422 | VERIFIED |
| W5 | Cashier rejects proof w/ reason → customer resubmits; rejected row leaves queue | v02 chain2 + AGENTS.md channel rules + BT "rejected online proof can settle at counter" | VERIFIED |
| W6 | Walk-in create → approve → counter cash → receipt | BT channel tests + P9 J4 + v02 | VERIFIED |
| W7 | Hotel: customer books w/ card → receptionist verifies card → approve → room reserved | BT: card-required, room persisted, auto-assign, full-room rejection, dup-approval safe + P9 J5 + v02 | VERIFIED |
| W8 | Boarding stay: check-in → care logs → ready-for-pickup → check-out | routes + `ReceptionistHotelBookings.jsx` actions (SRC); in_care detail (MT) | TESTED-ONLY (live end-to-end not rerun this pass) |
| W9 | POS sale → receipt; void | BT insufficient-cash + v02/P9 sale+void; idempotency key (SRC, uncommitted) | VERIFIED |
| W10 | Vet: approve w/ veterinarian → Start Consultation → record → Finalize & Review Bill → cashier billing → auto-close after payment | `VetConsultation.jsx` (SRC) + `VeterinaryBillingPaymentFlowTest` (BT) + v02 full cycle | VERIFIED |
| W11 | Inventory: batch receive/dispose; adjust remove/set; over-stock rejected | v02 chain3 + P9 J6 + BT | VERIFIED |
| W12 | Stock adjustment/audit variance → manager Invoice Approvals | `ManagerInvoiceApprovals.jsx` queue + routes (SRC) | CODE-REVIEWED (approval action not executed) |
| W13 | Admin creates user → welcome email set-password → user signs in | BT "admin created user receives welcome set password link" + v02 | VERIFIED (mailbox delivery BLOCKED — fake domains) |
| W14 | Staff: kiosk PIN → punch; My Attendance correction; My Leave → manager approve → balance deducts | v02 chain3/4 | TESTED-ONLY (prior runtime; not rerun) |
| W15 | Payroll: create → approve → release (paid) | v02 chain3 single-employee lifecycle | TESTED-ONLY; bulk/13th-month/loans/remittance/DTR = UNVERIFIED |
| W16 | Controlled-drug movement → register entry | `ControlledDrugRegister.jsx` + dispensation endpoints (SRC) | CODE-REVIEWED |
| W17 | Customer store checkout | `CustomerStoreController` → 410 (SRC today) | UNAVAILABLE — documented as such |
| W18 | Email mailbox delivery | intents dispatch (BT: outbox notices asserted) | BLOCKED — non-routable test domains; not claimable |

**Second pass additions (2026-10-25, live stack :8000/:3000, seeded `pawesome` dev DB):**
- 8-page capture run (`frontend/.manual-v04-capture.cjs`): all 8 target screens opened under correct roles and captured — upgrades W8, W12, W16 page-level evidence to UI-EXERCISED (screens opened, real data rendered); action-level statuses unchanged.
- Spec repairs rerun: `revision-b-confirmed-flows.spec.js` **5/5 PASS**; `customer-add-pet-modal.spec.js` **7/7 PASS** (mocked). Combined with earlier: all 4 prior failures resolved as stale-spec issues — zero app defects.

**Test-command ledger (this pass):**
- `cd backend && php artisan test --filter='PaymentBookingChannelTest|PrivatePetPhotoTest|BookingSchedulingIntegrityTest|BoardingRoomLifecycleTest|VeterinaryBillingPaymentFlowTest|AuditRegressionTest|EmailAuthFlowTest'` → exit 0, 98 passed / 493 assertions (MySQL `pawesome_test`).
- `cd frontend && E2E_LIVE=false PW_START_FRONTEND=true npx playwright test e2e/revision-b-confirmed-flows.spec.js e2e/customer-add-pet-modal.spec.js e2e/receipt-pdf-regression.spec.js --project=chromium` → 10 passed, 4 failed (all stale-spec causes — MANUAL_GAP_ANALYSIS disposition table).
- `php artisan route:list --path=api` → 731 route lines enumerated (read-only).
- Read-only MySQL probe: `pawesome_test` empty of fixtures (178 migrations).
