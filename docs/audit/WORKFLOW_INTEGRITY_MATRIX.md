# Workflow Integrity Matrix — Capstone B (2026-10-25)

Legend: **E2E** exercised end-to-end · **AT** automated test passed · **SRC** source-verified · **PART** partial · **UNV** unverified · **N/A** not applicable/disabled

| Workflow | Key integrity checks | Status | Evidence |
|---|---|---|---|
| Booking → approve → pay → receipt | pending→approved locked transition; dup-approve 422; receipt mirrors settlement | E2E | P9 J1/J2, PaymentBookingChannelTest, UM-004a/b |
| Booking cancel | customer `PATCH requests/{id}/cancel`, `POST boardings/{id}/cancel` | SRC | routes + controller; cancel paths not E2E'd this pass |
| Boarding lifecycle | card→verify→approve→room reserve; full room 422; check-in→care-logs→ready→check-out | E2E (approve/room) / AT (lifecycle routes) | BT hotel tests, P9 J5, UM-017/018 |
| Payment proof & reference | unique per flow; pending proof must verify/reject not cash; rejected→counter ok; resubmit | E2E | PaymentReferenceGuard + BT + P9 J3/J5/J9 |
| POS sale | server pricing; cash floor; idempotency on submit; void recorded | E2E | P1 "pos ignores manipulated price", BT insufficient cash, IdempotencyKey, v02/P9 sale+void |
| Inventory | adjust remove/set only; add via batch receive; over-decrement 422; manager approval queue | AT | BT + P9 J6 + ManagerInvoiceApprovals UI |
| Boarding add-on deduction | once per approval; atomic; restored on post-approval reject | AT | P1 three tests |
| Veterinary | approve w/ vet → consult → finalize → billing → auto-close after payment; corrections-not-edits | E2E | VeterinaryBillingPaymentFlowTest + v02 cycle + UM-021 |
| Pharmacy/dispensation | dedupe window; void endpoint preserves history | AT/SRC | AuditRegressionTest dup-dispense; void route+method (uncommitted) |
| Controlled drugs | register entries auto-logged w/ running balance; weekly count needs counter+witness | SRC | ControlledDrugRegister.jsx; empty-state capture UM-024 |
| Confinement | cancel only pre-admission, locked txn, stale→422; admitted→discharge flow | AT/SRC | `MedicalConfinementController::cancel` (uncommitted) |
| User admin | create→welcome set-password link (no plaintext); role list = 8; deactivate blocks login | AT | P1 welcome test + token-deactivation tests |
| Email workflows | register/verify/reset/welcome/notice intents → outbox → dispatch | AT (dispatch) / BLOCKED (mailbox) | EmailAuthFlowTest; fake domains |
| Store checkout | disabled, creates no orders | AT | 410 in controller + P1 test |
