# Fix Policy

**Date:** 2026-11-18
**Phase:** Phase 9 — Fix Policy

---

## Fix Scope

Only the following P0/P1 defects were fixed within Receptionist scope:

### REC-01 — PATCH Hotel Approval Missing Reservation (P1)
- **Finding ID:** REC-01
- **Severity:** P1
- **Reproduction:** PATCH `status=approved` on hotel SR created Boarding but skipped `boarding_room_reservations`
- **Expected behavior:** PATCH hotel approval must create room reservation
- **Actual behavior:** PATCH hotel approval created Boarding but no reservation
- **Root cause:** PATCH hotel-approve branch did not call `createRoomReservation`
- **Files changed:** `backend/app/Http/Controllers/ReceptionistRequestController.php` (lines 626–656)
- **Database impact:** None (fix applies to new approvals only)
- **API impact:** PATCH `/requests/{id}/status` now enforces room reservation for hotel types
- **Fix details:** Added room-reservation logic to PATCH hotel-approve branch mirroring POST approve
- **Regression test:** Covered by existing `PaymentBookingChannelTest` (passed)
- **Test result:** PASS

### REC-02 — Direct Approval Prevention (P1)
- **Finding ID:** REC-02
- **Severity:** P1
- **Reproduction:** POST `/receptionist/requests` accepted client-sent `status='approved'`
- **Expected behavior:** Store must reject direct approval status
- **Actual behavior:** Store allowed direct approval without linked records/attribution
- **Root cause:** Store allowed any status without guard
- **Files changed:** `backend/app/Http/Controllers/ReceptionistRequestController.php` (lines 250–265)
- **Database impact:** None (fix prevents orphan approved SRs)
- **API impact:** POST `/receptionist/requests` now rejects `status='approved'` with 422
- **Fix details:** Added guard to reject `status='approved'` in store
- **Regression test:** `ReceptionistFixRegressionTest::test_rec02_store_rejects_direct_approval`
- **Test result:** PASS

### REC-03 — Walk-in Payment Default (P1)
- **Finding ID:** REC-03
- **Severity:** P1
- **Reproduction:** `payment_status` defaulted to `'pending'` for all requests
- **Expected behavior:** Walk-in defaults to unpaid, online to pending
- **Actual behavior:** All requests defaulted to pending
- **Root cause:** Hardcoded `'payment_status' => 'pending'` without checking channel
- **Files changed:** `backend/app/Http/Controllers/ReceptionistRequestController.php` (lines 282–295)
- **Database impact:** None (fix applies to new requests only)
- **API impact:** POST `/receptionist/requests` now defaults payment status by channel
- **Fix details:** Default to `'unpaid'` for walk-ins, `'pending'` for online
- **Regression test:** `ReceptionistFixRegressionTest::test_rec03_walk_in_defaults_to_unpaid`
- **Test result:** PASS

### REC-04 — Pet Hotel Recognition (P3)
- **Finding ID:** REC-04
- **Severity:** P3
- **Reproduction:** `requestIsHotel` only matched `hotel|boarding`
- **Expected behavior:** Recognize `pet_hotel` as hotel type
- **Actual behavior:** `pet_hotel` was not recognized
- **Root cause:** Incomplete type match list
- **Files changed:** `backend/app/Http/Controllers/ReceptionistRequestController.php` (lines 45–50)
- **Database impact:** None
- **API impact:** `pet_hotel` requests now reach hotel logic
- **Fix details:** Added `'pet_hotel'` to hotel-type match list
- **Regression test:** Covered by existing `PaymentBookingChannelTest` (passed)
- **Test result:** PASS

---

## Fixes Not Implemented

### REC-05 — Chatbot Room Grounding (P3)
- **Finding ID:** REC-05
- **Severity:** P3
- **Description:** Chatbot FAQ/status grounding reads legacy `hotel_rooms` while real bookings use `boarding_rooms`
- **Decision:** Documented as P3 follow-up; not a booking blocker
- **Reason:** Chatbot booking paths correctly use `BoardingRoomService`; only FAQ/status grounding is inaccurate
- **Action:** No fix in this phase per policy (P2/P3 enhancements not implemented)

---

## Fix Policy Adherence

✓ Only P0/P1 defects fixed within Receptionist scope
✓ No P2/P3 enhancements implemented
✓ No destructive migrations
✓ No room table merges
✓ No customer-order re-enablement
✓ No Receptionist role expansion
✓ No unrelated module rewrites
✓ No pink design system changes
✓ All fixes minimal and architecture-compatible
✓ All fixes have regression tests

---

## Conclusion

**Fix Policy Status:** **COMPLIANT**

All fixes adhere to the approved fix policy. No unauthorized changes were made.
