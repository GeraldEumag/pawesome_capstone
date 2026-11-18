# Customer Role — Database Persistence Verification (Gate 3)

**Audit date:** 2026-11-18 · **DB:** `pawesome_customer_audit` (MariaDB 10.4.32)
**Rule applied:** a UI/API action is only "passed" when the corresponding DB row was inspected directly. Dev DB `pawesome` verified untouched (0 audit-created tokens/rows).

## Isolation proof

- Login on `:8001` created `personal_access_tokens` row in `pawesome_customer_audit` only; `pawesome.personal_access_tokens` count for the probe window: **0**.
- All fixture rows below verified via direct `mysql` selects on `pawesome_customer_audit`.

## Persisted workflow evidence

| # | Action (API) | Persisted row(s) | Verification |
| --- | --- | --- | --- |
| 1 | Register B (`POST /auth/register`) | `users` id=10 `role=customer`, `customers` id=2, `email_verification_tokens` row, `email_deliveries` intent | `email_verified_at NULL` until verify |
| 2 | Verify email (`POST /auth/email/verify`) | `users.email_verified_at` set; token row deleted | booking unblocked after |
| 3 | Email change (`PUT /auth/profile`) | `users.email`→b2 alias, `email_verified_at`→NULL | old-email `password_reset_tokens` row deleted (hygiene) |
| 4 | Pet create (`POST /customer/pets`) | `pets` id=1 `customer_id=1` | spoofed `customer_id:2` ignored |
| 5 | Vet request (`POST /customer/requests`) | `service_requests` id=8 `pending`/`unpaid`, `customer_id=9`, server price 450.00 | spoofed paid/approved fields ignored |
| 6 | Grooming request | `service_requests` id=5 + `groomings` id=4 linked (`service_request_id=5`) | linked-record sync verified through lifecycle |
| 7 | Boarding + vacc card (`POST /customer/boardings` multipart) | `boardings` id=2 `pending`/`unpaid`, `boarding_type=dog_standard`, `total_amount=500.00`, private `vaccination_cards/*.png` path, `booking_channel=online` | species→room-type rule enforced |
| 8 | Receptionist approve SR8 | `service_requests.status=approved`, `approved_by=3`; `appointments` id=1 `service_request_id=8`, `veterinarian_id=7`, `status=scheduled`, `scheduled_at` set | transactional commit |
| 9 | Proof upload SR5 | `service_requests.payment_status=pending`, `payment_method=gcash`, `payment_reference=GCASH-REF-001`; `payment_receipts` row (private `payment-proofs/*`, `sha256`) | `verified_by` NULL until cashier |
| 10 | Cashier verify SR5 | `payment_status=paid`, `verified_by=5`, `verified_at`; receipt `SR-REC-20261118200058-5`; `groomings.status=approved` | VAT: net 133.93 + 16.07 = 150 |
| 11 | Receptionist vacc verify + approve boarding 2 (room_id=1) | `vaccination_card_verified`, `status=approved`; `boarding_room_reservations` id=2 `room_id=1`, `source_type=pet_hotel`, dates 2026-11-25 | transaction + conflict window honored |
| 12 | Boarding proof → cashier verify | `boardings.payment_status=paid`, `verified_by=5`, receipt `BD-REC-…`; `payment_receipts` id=3 | VAT: 446.43 + 53.57 = 500 |
| 13 | Live chat (`start`, `customerMessage`, staff `reply`) | `live_chat_sessions` id=1 (`status waiting→active`, `assigned_to_id=3`); `live_chat_messages` customer+staff+system rows | B cannot reach session (403) |
| 14 | Notifications | `notifications` rows: customer 9 (Payment verified, Reservation Update, Service Request Approved ×2), cashiers 4+5 (proof ready ×4), vet 7 (appointment assigned) | cross-role fan-out real |
| 15 | Email outbox | `email_deliveries` ids 1–26 all `status=accepted`, `attempts=1` — incl. `auth.email_verification` (B, C), `auth.password_reset` (B), lifecycle mails (SR5/8, appointment 1, boarding 2) | real Brevo accepts, occurrence-key deduped |

## State-machine integrity

- `service_requests.status`: pending → approved → (cancelled only from pending); `payment_status`: unpaid → pending (proof) → paid (cashier) — no direct customer path to `paid`.
- `boardings.status`: pending → approved → check-in gated by `paid` AND scheduled-date window; enum includes `checked_in…checked_out/completed/cancelled/rejected`.
- `boarding_room_reservations` overlap prevented (`room_id`+date-window conflict check under `lockForUpdate`).
- `email_deliveries` lifecycle `queued→dispatched→accepted`; `attempts`/`max_attempts`, `occurrence_key` dedup, `suppression` checks all populated.

## Cross-domain `customer_id` convention (documented for future audits)

- `service_requests.customer_id` = **users.id**
- `boardings`, `appointments`, `payment_receipts`, `boarding_room_reservations`, `customer_orders.customer_id` = **customers.id**
- `SecureFileController::recordBelongsToCustomer()` and `Customer\PortalController` reconcile both — consistent behavior verified end-to-end.

## Orphan/integrity spot-checks

- `groomings.service_request_id → service_requests.id`, `appointments.service_request_id → service_requests.id`, `boarding_room_reservations.source_id → boardings.id` — all resolved, no dangling FKs in audit fixtures.
- `payment_receipts.payable_*` polymorphic pairs resolve for service_request/boarding.
