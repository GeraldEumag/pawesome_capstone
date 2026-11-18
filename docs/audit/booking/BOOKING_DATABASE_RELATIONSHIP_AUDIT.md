# Booking Database Relationship Audit

Queries executed against `pawesome_booking_audit` (fresh clone, 94 tables) on
2026-11-18 via `information_schema` and direct consistency SELECTs. Live counts
below are point-in-time.

## 1. Entity map

| Table | Role in bookings | Rows (clone) |
| --- | --- | --- |
| `service_requests` | Central request/intake record for all 3 modules; `booking_channel`, `payment_status`, approval/rejection/payment metadata | ~279 |
| `appointments` | Vet booking → consultation lifecycle (`service_request_id` link) | ~69 |
| `groomings` | Grooming booking/execution (`service_request_id`, `appointment_id`) | ~163 |
| `grooming_appointments` | **Legacy** grooming table (only `GroomingController` reads/writes) | legacy |
| `boardings` | Hotel stay record (`service_request_id`, `hotel_room_id`, `room_id`) | ~51 |
| `boarding_rooms` | **Authoritative** room catalog (`is_active`, `allowed_species`, `daily_rate`, `max_capacity`) | — |
| `hotel_rooms` | **Legacy** room catalog; still FK'd from `boardings.hotel_room_id`; still has receptionist CRUD | — |
| `boarding_room_reservations` | Room-inventory block rows (`source_type` ∈ `pet_hotel|service_request|…`, `room_id`, `check_in_date/check_out_date`) | ~26 |
| `boarding_care_logs` | Per-stay care entries → `boardings` (also `confinement_id`, `logged_by`) | — |
| `pets` | `customer_id→customers`; booking pet | — |
| `services` | Service catalog (`duration_minutes`, `category`, active flag) | — |
| `payments` / `sales` / `payment_settlements` / `visit_invoices` | Revenue side; `sales.appointment_id`, `payments.sale_id` | — |
| `service_item_usages` / `booking_addons` | Inventory consumption + add-ons during service | — |
| `medical_records` + `medical_record_addenda` | Vet output (`appointment_id`, `pet_id`, `veterinarian_id`, finalize/lock actors) | — |

## 2. Foreign keys (actual, from `information_schema.KEY_COLUMN_USAGE`)

Present:

- `appointments`: `customer_id→customers`, `pet_id→pets`, `service_id→services`, `veterinarian_id→users`
- `boardings`: `customer_id→customers`, `pet_id→pets`, `hotel_room_id→hotel_rooms`
- `boarding_care_logs`: `boarding_id→boardings`, `confinement_id→medical_confinements`, `logged_by→users`
- `groomings`: `customer_id→customers`, `pet_id→pets`, `appointment_id→appointments`
- `medical_records`: `appointment_id→appointments`, `pet_id→pets`, `veterinarian_id→users`, `finalized_by/locked_by→users`
- `service_requests`: `customer_id→users`, `pet_id→pets`
- `payments.sale_id→sales`; `sales`: `appointment_id→appointments`, `cashier_id→users`, `customer_id→customers`, `product_id→inventory_items`
- `service_item_usages`: `appointment_id`, `pet_id`, `inventory_item_id`, `batch_id`, `used_by` FKs

**Missing FKs (documented, not auto-fixed — adding them requires an orphan
sweep first):**

| Column | Links to | Status |
| --- | --- | --- |
| `appointments.service_request_id` | `service_requests.id` | no FK (indexed) — DB-001 |
| `groomings.service_request_id` | `service_requests.id` | no FK (indexed) — DB-001 |
| `boardings.service_request_id` | `service_requests.id` | no FK (indexed) — DB-001 |
| `boardings.room_id` | `boarding_rooms.id` | no FK — DB-001 |
| `boarding_room_reservations.room_id` | `boarding_rooms.id` | no FK (composite-indexed) — DB-001 |
| `boarding_room_reservations.source_id` | polymorphic | un-enforceable by design — DB-001 |
| `service_requests.boarding_room_id` | `boarding_rooms.id` | no FK — DB-001 |
| `service_requests.approved_by`/`rejected_by`/`verified_by` | `users.id` | no FK — DB-001 |

## 3. Status enums (actual `COLUMN_TYPE`)

| Table.Column | Type | Values |
| --- | --- | --- |
| `service_requests.status` | enum | `pending, scheduled, approved, rejected, cancelled, canceled, completed, paid, confirmed, rescheduled, in_progress, checked_in, ready_for_pickup` — **dual cancelled/canceled spellings; `paid` appears as a status (historical)** — DB-003 |
| `service_requests.payment_status` | enum | `unpaid, pending, partial, paid, rejected, refunded` |
| `service_requests.booking_channel` | varchar(20) | app-enforced `online|walk_in`; 210 NULL legacy rows — DB-004 |
| `appointments.status` | **varchar(50)** | model-enforced: `requested, scheduled, checked_in, in_consultation, in_treatment, awaiting_results, clinical_complete, checkout, completed, cancelled, rejected, no_show` (`Appointment::VALID_STATUSES`) — DB-002 |
| `groomings.status` | **varchar(255)** | validated `in:pending,approved,rejected,in_progress,completed,cancelled` at write time only — DB-002 |
| `grooming_appointments.status` | enum | `pending, approved, rejected, completed, cancelled` (legacy) |
| `boardings.status` | enum | `pending, approved, scheduled, confirmed, checked_in, in_care, ready_for_pickup, checked_out, completed, cancelled, rejected` |
| `boardings.payment_status` | enum | same 6-value payment enum |
| `boarding_room_reservations.status` | enum | `pending, approved, scheduled, checked_in, in_stay, checked_out, cancelled, confined` |
| `hotel_rooms.status` | enum | `available, occupied, maintenance, cleaning, reserved, inactive` |

## 4. Live status distribution (clone — sanity window)

- `service_requests`: pending 49 · approved 199 · rejected 8 · cancelled 17 · checked_in 6
- `appointments`: in_consultation 34 · scheduled 19 · checkout 7 · cancelled 6 · completed 3
- `groomings`: approved 119 · pending 30 · cancelled 11 · rejected 3
- `boardings`: approved 29 · pending 10 · in_care 8 · rejected 3 · scheduled 1
- `boarding_room_reservations`: pending 19 · approved 5 · cancelled 2

Note: `appointments` live vocabulary is `in_consultation`/`checkout` — **not**
the `in_progress`/`checked_out` wording assumed in external documentation.

## 5. Index coverage (booking-relevant)

Verified present: `service_requests.customer_id/pet_id/booking_channel`;
`appointments.scheduled_at`, `(scheduled_at,status)`, `status`,
`service_request_id`, `customer_id,status`, `veterinarian_id,status`,
`booking_channel`; `groomings.(appointment_date,status)`, `service_request_id`,
`customer_id,status`, `booking_channel`; `boardings.check_in`,
`(check_in,check_out)`, `(hotel_room_id,status)`, `service_request_id`,
`(customer_id,status)`, `booking_channel`; `boarding_room_reservations`
`(room_id,check_in_date,check_out_date)` overlap index, `(source_type,source_id)`,
`(pet_id,status)`; `boarding_care_logs` FK indexes.

Coverage is adequate for the overlap/queue/status queries observed. No missing
index detected for audited access patterns.

## 6. Integrity queries executed

All returned **0 violations**:

```
sr.pet_id → pets          : 0 orphans
sr.customer_id → users    : 0 orphans
appointments.service_request_id → service_requests : 0 orphans
groomings.service_request_id → service_requests    : 0 orphans
boardings.service_request_id → service_requests    : 0 orphans
reservations(source=pet_hotel).source_id → boardings   : 0 orphans
reservations(source=service_request).source_id → service_requests : 0 orphans
```

## 7. Findings carried to defect tracker

- DB-001 (P3): `service_request_id` + room link columns lack FKs — integrity
  is currently maintained by application transactions; zero orphans today.
- DB-002 (P3): `appointments.status`/`groomings.status` are unconstrained
  varchars — typos are only caught by app validation.
- DB-003 (P3): `service_requests.status` enum carries `cancelled`+`canceled`
  and a `paid` status value (legacy vocabulary); `BookingWorkflowStage`
  normalizes both spellings.
- DB-004 (P3): 210 `service_requests` rows have NULL `booking_channel`
  (pre-migration data); code treats NULL as legacy/online — confirm report
  counting handles NULL (verified in Phase C manager-report check).
