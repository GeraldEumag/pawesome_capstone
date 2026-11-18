# Booking Test Plan

Maps the required test matrix to **existing** coverage and identified gaps.
Baseline: 96/96 booking-suite PHPUnit tests already green on `pawesome_test`
(2026-11-18, evidence in `evidence/`).

## A. Online veterinary (VET-*)

| Req | Coverage | Method |
| --- | --- | --- |
| VET-001 valid booking → visible to receptionist | `CustomerBookingRulesTest`, `EndToEndBusinessFlowTest` | PHPUnit |
| VET-002 booking without pet → validation error | `test_service_request_requires_a_registered_pet` | PHPUnit |
| VET-003 another customer's pet → reject | `test_customer_cannot_book_using_another_customers_pet`, `spoofed_pet_name` | PHPUnit |
| VET-004 unavailable slot → reject | `veterinary_availability_filters_overlapping_slots`, `legacy_customer_appointment_endpoint_rejects_overlapping` | PHPUnit + live probe |
| VET-005 duplicate submit | `duplicateExists` guard (ServiceRequestController:281) — **live probe Phase C** | API probe |
| VET-006 receptionist approve → status+notification | `ReceptionistRequestController@approve` path in `ReceptionistBatch2SystemTest`, `NotificationMatrixTest` | PHPUnit |
| VET-007 reject without reason → error | `ReceptionistReasonRequiredTest` | PHPUnit |
| VET-008 schedule persists | `BoardingRoomLifecycleTest` analog + approve tests | PHPUnit |
| VET-009 vet sees approved appointment | `VeterinaryWorkflowTest`, `VetBatch4SystemTest` | PHPUnit + E2E |
| VET-010 complete consultation persists medical data | `VeterinaryWorkflowTest`, `ConsultationWorkflow` routes | PHPUnit + E2E |

## B. Walk-in veterinary (VET-WI-*)

| Req | Coverage |
| --- | --- |
| WI-001 existing customer → saved, `walk_in` channel | `WalkInBookingTest::veterinary_walk_in_for_existing_customer` |
| WI-002 new customer → account+pet+records | `WalkInBookingTest::hotel_walk_in_for_new_customer` (hotel analog); **gap: vet new-customer variant** |
| WI-003 invalid pet → reject | validation rules — live probe |
| WI-004 unavailable slot → reject | `walk_in_requires_a_time_and_checks_capacity_within_store_hours` |
| WI-005 visible in vet dashboard | live probe + E2E `phase12-veterinary-workflow` |
| WI-006 in customer history | `roomReservation`/linked-SR visibility — live probe |

## C. Online hotel (HOT-*)

| Req | Coverage |
| --- | --- |
| HOT-001 valid reservation saved | `BoardingRoomLifecycleTest`, `EndToEndBusinessFlowTest` |
| HOT-002 invalid dates → error | validation — live probe |
| HOT-003 unavailable room → reject | `overlapping_hotel_stays_are_rejected_for_the_same_room` |
| HOT-004 overlapping → reject | same + `BoardingRoomService` overlap tests |
| HOT-005 capacity exceeded → reject | `full room causes controlled approval rejection` |
| HOT-006 customer cancel pending | `BoardingController@cancel` + `customer_can_cancel` test |
| HOT-007 receptionist assigns room | `receptionist schedule persists a boarding room id and reservation` |
| HOT-008 status visible to customer | `CustomerTrackingTest`, bookings board |
| HOT-009/010 check-in / check-out | `ReceptionistCheckInGateTest` (gates) + `BoardingRoomLifecycleTest`; **check-out availability restore → live probe** |

## D. Walk-in hotel (HOT-WI-*)

| Req | Coverage |
| --- | --- |
| WI-001 create walk-in boarding | `WalkInBookingTest::hotel_walk_in_*` (existing + new customer) |
| WI-002 unavailable room → reject | walk-in room checks — **live probe** |
| WI-003 overlapping → reject | `isAvailable` inside lock — **live probe (cross-source: online reservation vs walk-in)** |
| WI-004 occupancy visible | `boardings` + reservation row created — PHPUnit-verified |
| WI-005/006 check-in / check-out | walk-in check-in bypasses card requirement (`receptionist walk in boarding is not blocked by customer card requirement`); check-out → **live probe** |

## E. Online grooming (GRM-*)

| Req | Coverage |
| --- | --- |
| GRM-001 valid booking | `CustomerBookingRulesTest`, `BookingSchedulingIntegrityTest` |
| GRM-002 missing service → error | validation — covered by store rules; probe |
| GRM-003 inactive service → reject | service catalog active flag — probe |
| GRM-004 invalid date → reject | `after_or_equal:today` + store hours tests |
| GRM-005 unavailable slot → reject | `grooming_availability_filters_overlapping_slots_and_releases_cancelled` |
| GRM-006 add-ons + server price | `BookingAddOn`/`ServiceItemUsage` — probe for add-on path on `requests` route |
| GRM-007 price manipulation → ignored | server-side price resolution — live probe (send `price:0.01`) |
| GRM-008 approve+schedule | `ReceptionistRequestController@approve` → `Grooming` row |
| GRM-009 staff starts service | `updateStatus` `in_progress` — probe + **DEF-001 transition guard gap** |
| GRM-010 completion → history | paid+billing gate in `updateStatus`/`complete` + `sendGroomingCompletionNotification` |

## F. Walk-in grooming (GRM-WI-*)

`WalkInBookingTest::grooming_walk_in_for_existing_customer` covers creation; staff-assignment concept does not exist (receptionist executes grooming ops — documented). Live probes for slot rejection + completion.

## G. Security (SEC-*)

| Req | Coverage |
| --- | --- |
| SEC-001 unauthenticated → 401 | `AuthorizationMatrixTest` + live probes |
| SEC-002 cross-customer booking access → 403/404 | `CustomerDataIsolationTest` + probes |
| SEC-003 customer changes status → rejected | role gate probes (customer→`receptionist/*` = 403) |
| SEC-004 receptionist→cashier verify → 403 | live probe |
| SEC-005 cashier→vet complete → 403 | live probe |
| SEC-006 vet→approve request → 403 | live probe |
| SEC-007 price spoof → server ignores | live probe all 3 modules |
| SEC-008 invalid room ID → 4xx | live probe |
| SEC-009 duplicate submit | `duplicateExists` + slot-conflict probes |
| SEC-010 unauthorized attachment | `PrivateCareLogPhotoTest`, `VaccinationCardOwnerAccessTest`, signed-storage probes |

## H. Concurrency

| Scenario | Coverage | Planned |
| --- | --- | --- |
| Same vet slot, parallel | `lockServiceSchedule` — **new live race probe** (2 workers) | API probe |
| Same room, overlapping dates, parallel | prior audit raced cap-1 → 1 success; **re-run on audit DB incl. cross-source (online+walk-in)** | API probe |
| Same grooming slot parallel | same lock — **live probe** | API probe |
| Double-approve / double-check-in | `duplicate boarding approval is rejected`, `second check in is rejected` | PHPUnit ✓ |
| Inventory add-on ×2 | `service_item_usages` dedupe — probe grooming inventory-usage replay | API probe |

## Browser E2E (existing specs to run on audit stack)

`phase12-boarding-workflow`, `phase12-veterinary-workflow`,
`booking-channel-gating`, `receptionist-room-assignment`,
`receptionist-booking-order`, `customer-bookings-board`, `boarding-billing`,
`phase4-payment-workflow`, `cross-role-main-workflow`,
`security-concurrency-audit`, `pawesome-full-workflow`. New specs only for
confirmed gaps.

## Explicitly OUT of scope / BLOCKED notes

- Real payment provider calls, Brevo/Telegram delivery — external, NOT TESTED.
- MySQL 8 vs XAMPP MariaDB 10.4 parity — documented limitation.
- Dedicated "groomer staff" role — does not exist in this system; grooming ops
  are receptionist-owned by design (documented, not a defect).
