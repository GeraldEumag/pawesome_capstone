# Hotel / Boarding Booking Audit

**Authoritative path:** `BoardingController` + `boardings`; modern room capacity is tracked in `boarding_rooms` and `boarding_room_reservations`. `hotel_rooms` remains a supported legacy path.

## Executed workflow evidence

- Customer online booking requires a registered owned pet, room, future/store-valid date, and a vaccination-card upload. Room rate is resolved server-side; date/holiday, species, capacity and room activity are checked. Customer `POST /api/customer/boardings` with a file created reservation 201. For a room with `total_rooms=1`, a second overlapping request returned 422. A room with capacity 5 correctly accepted a second stay, so the first overlap observation was not a defect.
- Pending online boarding cannot be approved before vaccination-card verification (422); after receptionist verification it approved (200). Duplicate boarding approval returned 422. A request on a blocked Dec 8, 2026 holiday was rejected with 422.
- Receptionist walk-in creation shares `service_requests` + `boardings` + room reservation; one live walk-in created with `booking_channel=walk_in`. Walk-in approval (without customer vaccination-card requirement) succeeded. Counter payment for the walk-in succeeded; check-in, care-log creation and checkout all succeeded via the receptionist API.
- The live walk-in room reservation was incorrectly left `pending` after checkout and room #9 remained unavailable. Root cause: the status sync searched only `source_type=service_request` whenever an SR link existed, while the walk-in reservation was `pet_hotel` keyed by boarding ID. **Fixed** `syncRoomReservationStatus()` to match both supported source conventions. Added regression test `BookingFinalAuditTest::test_walk_in_room_reservation_with_linked_request_is_released_on_checkout` (1 test, 3 assertions, PASS).
- Same-day check-in uses the store-local calendar day, not UTC. Live check-in initially rejected a booking dated 2026-11-19 while UTC was still Nov 18; fixed both boarding and request check-in guards to compare `ServiceDurationService::STORE_TIMEZONE`. Target tests pass.

## Existing coverage

`WalkInBookingTest`, `BoardingRoomAvailabilityTest`, `BoardingRoomLifecycleTest`, `ReceptionistCheckInGateTest`, `PaymentBookingChannelTest`, `CustomerBookingRulesTest`, `BookingFinalAuditTest`. Existing tests prove card gating, duplicate approval, scheduling/room assignment, check-in, care logs, checkout and reservation release.

## Limits / final status

**Verified:** capacity-one conflict rejection, holiday rejection, card gate, walk-in approval/counter payment/check-in/care log/check-out, the two fixes above via automated tests. **NOT TESTED:** two truly simultaneous live HTTP room reservations (browser spec result is in test report); refund/provider-side effects. `boarding_room_reservations.source_id` is polymorphic and intentionally has no FK.
