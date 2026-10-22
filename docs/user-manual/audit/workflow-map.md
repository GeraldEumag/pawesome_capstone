# Workflow Map and Verification Record

**Test execution:** 2026-10-22, local dev stack (frontend :3000, API :8000, MySQL `pawesome`), Playwright/Chromium via `e2e/manual-verification-pass.spec.js` and `e2e/manual-e2e-chain.spec.js`. Results JSON: `runtime-verification.json`, `runtime-verification-chain.json`.

## A. Customer account and service request — VERIFIED (grooming)

```text
/login -> customer portal (/customer/services)
  -> /customer/grooming -> pet + service + date + 10:00 slot
  -> availability confirmed inline
  -> BookingReviewModal (UM-004)
  -> Confirm booking -> My Appointments (UM-004b)
  -> SR created pending/unpaid (observed: SR-270)
```

Status: **VERIFIED** (UI end-to-end). Registration/email-verify paths remain CODE-REVIEWED.

## B. Receptionist booking review — VERIFIED (approve)

```text
/receptionist/bookings/grooming queue (UM-005)
  -> POST /receptionist/requests/{id}/approve
  -> SR-270 approved; vet SR approved with veterinarian_id -> vet appointment (UM-016)
```

Constraint observed: online hotel requests cannot be approved through the generic path without the reservation flow + verified vaccination card ("Online hotel requests must use the Pet Hotel reservation flow…" — API 422).

Status: **VERIFIED** for approve + vet assignment; reject/schedule paths CODE-REVIEWED.

## C. Cashier payment review — VERIFIED (full chain)

```text
Customer: POST /customer/requests/271/payment-proof (gcash, ref E2E-MANUAL-…, png)
  -> Cashier: GET /cashier/payment-requests -> SR-271 listed pending (UM-006)
  -> Cashier: POST /cashier/payment-requests/271/verify {type: service_request}
  -> settlement + receipt SR-REC-20261022124801-271
  -> Customer: my-requests shows paid (UM-015)
```

Channel rules confirmed in source + consistent with queue contents: walk-in rows eligible for counter cash; online rows carry digital proof and are verified as proof.

**Environment defect found:** pre-migration, `GET /cashier/payment-requests` returned 500 (`service_billing_payment_requests` missing). Resolved via approved `php artisan migrate`.

Status: **VERIFIED**.

## D. Veterinary consultation — VERIFIED

```text
Vet request created (api) -> receptionist approve w/ veterinarian_id
  -> appointment visible in /veterinary/appointments (UM-016)
  -> POST /veterinary/consultations/66/start -> status=in_consultation, draft medical record 12 created
  -> POST /veterinary/medical-records/12/finalize -> finalized
  -> POST /veterinary/consultations/66/complete {diagnosis,...} -> status=awaiting_payment, billing synced
```

Status: **VERIFIED** (full clinical cycle incl. record finalize + completion, appointment 66).

## E. Inventory adjustment — VERIFIED

```text
POST /inventory/items/147/adjust-stock {type: remove, qty: 1}
  -> POST .../adjust-stock {type: set, qty: <original>}
  -> two manual_adjustment log entries; stock restored
```

Note confirmed: `add` is rejected — increases must go through batch receiving.

Status: **VERIFIED** (reversible pair on seeded test item).

## F. Walk-in / hotel / POS sale / payroll / create-user

```text
Walk-in: POST /receptionist/walk-ins (existing customer 5/pet 3, Nail Trimming)
  -> SR-272 booking_channel=walk_in -> receptionist approve
  -> cashier queue entry -> POST .../verify {payment_method: cash}
  -> paid; payment_method=cash; receipt SR-REC-20261022131509-272      [VERIFIED]

POS: POST /cashier/pos/transaction (1x Nail Trimming svc, cash 200)
  -> sale #73 + invoice + receipt data -> POST /pos/transaction/73/void -> voided   [VERIFIED]

Rejection: SR-273 proof uploaded -> POST /cashier/payment-requests/273/reject
  -> payment_status=rejected (visible in customer view)                [VERIFIED]

Hotel: POST /customer/boardings (pet 3, room 1, +vaccination card png)
  -> boarding 60 -> POST /boarding-requests/60/verify-vaccination (200)
  -> POST /boarding-requests/60/approve -> "approved and inventory deducted"
  -> boarding.created + boarding.status outbox intents queued          [VERIFIED]

Admin: POST /admin/users -> user 73 (receptionist)
  -> email_deliveries intent 401 auth.account_welcome -> accepted
     (SMTP provider accepted; mailbox delivery not provable)           [VERIFIED]
```

Payroll runs, leave approve/reject, day-off edits, and remaining HR ops stay CODE-REVIEWED (not exercised).

## G. Customer store checkout — NOT IMPLEMENTED

`CustomerStoreController::checkout()` and order write paths return HTTP 410 (source-confirmed; unchanged).

## H. Attendance kiosk — VERIFIED (gate)

`/attendance-kiosk` gate rendered (UM-013). `POST /kiosk/verify` rejects wrong PIN (401) and unlocks with the configured PIN (200). Post-unlock clock-in remains CODE-REVIEWED.

## Verification summary

- Executed: 30 Playwright tests across 5 specs — all passing on final runs (`manual-verification-pass`, `manual-e2e-chain`, `manual-e2e-chain2`, `manual-e2e-chain3`, `manual-audit-regressions`).
- Screenshots: 18 genuine captures (privacy-reviewed) in `../screenshots/`.
- Database writes performed: service requests SR-270 (grooming UI), SR-271 (vet), SR-272 (walk-in), SR-273 (reject fixture), SR-274 (consult fixture); payment proofs (2), approvals (5), verifications+receipts (2), rejection (1), inventory logs (2, net-zero), POS sales #68/#69/#73/#74 (all `cancelled` — the API reports "voided"; includes 2 strays from a failed run and 1 rerun sale), boarding 60 (+vax card +vax verify +approve), vet consultation complete on appointment 66 (+finalized record 12), admin-created users 73 and 82 (e2e-manual fixtures), registered e2e users 69–86 (e2e-reg/unverified fixtures, 18 rows across reruns), welcome/boarding/auth outbox intents, manager-filed leave 1–2 (rejected), attendance corrections 3–4 (rejected), day-off rows on user 73 ([6,0] residue — clear-to-empty rejected), supplier 4–5 (deleted), batch 24–25 (disposed), payroll 1 for user 73 (paid). Migrations applied with approval. All on the local dev DB.
