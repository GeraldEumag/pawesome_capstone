# Customer Role — Cross-Role Integration Map (Gate 3)

**Audit date:** 2026-11-18 · All transitions DB-verified on `pawesome_customer_audit`.

## Customer → Receptionist

| Customer action | Receptionist surface | Observed |
| --- | --- | --- |
| `POST /customer/requests` (vet) | `receptionist/requests` queue → `POST {id}/approve` requires `veterinarian_id` | approve creates `appointments` row atomically |
| `POST /customer/requests` (grooming) | approve → linked `groomings` synced | `groomings.status=approved` |
| `POST /customer/boardings` + vacc card | `verify-vaccination` gate → `approve` requires room | `boarding_room_reservations` transactional |
| `POST /customer/boarding-requests/{id}/payment-proof` | check-in gate | blocked unpaid + off-date |
| `chatbot/live-chat/start` | `live-chat/inbox` → `claim` → `reply` | session active, `assigned_to_id=3`, customer sees reply |

## Customer → Cashier

| Customer action | Cashier surface | Observed |
| --- | --- | --- |
| proof upload (SR/boarding) | `cashier/payment-requests` + notifications (both cashier users notified) | `Payment proof submitted`/`ready for verification` |
| — | `PUT payments/{id}/service-request/verify`, `POST boarding-payments/{id}/verify` | `paid`, `verified_by=5`, receipt `SR-REC-*`/`BD-REC-*` with 12% VAT breakdown |
| — | cash-settle of `online` booking | 422 — channel protected |
| — | verify before receptionist approval | 422 — ordering enforced |

## Customer → Veterinary

`POST /customer/requests` (vet) → approve assigns `veterinarian_id=7` → `veterinary/appointments` queue shows it → notification `New Appointment Assigned` to user 7.

## Customer → Inventory

Boarding approval decrements room/kennel capacity via `boarding_room_reservations` + "inventory deducted" response; stock transactions from other flows covered by inventory audit (this audit verified the customer-side trigger only).

## Customer → Notifications + Email outbox (all roles)

Every state transition above produced: (a) `notifications` rows for customer + responsible staff pool, (b) `email_deliveries` intents (`source_type` = service_request/appointment/boarding/user) dispatched and Brevo-`accepted` under `occurrence_key` dedup with send-time suppression checks.

## Integration gaps observed

- None blocking. `GET /customer/grooming/{id}` legacy-route ambiguity documented in SECURITY_AUDIT §8 (owner-safe; unused by frontend).
