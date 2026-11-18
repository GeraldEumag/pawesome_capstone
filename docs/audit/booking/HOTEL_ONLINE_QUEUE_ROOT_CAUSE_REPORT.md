# Hotel Online Queue Root Cause Report

## Finding

**Root cause confirmed:** Eloquent serialized the boarding's store-local calendar date as a UTC instant. Midnight on 2026-11-19 in `Asia/Manila` became `2026-11-18T16:00:00Z`. The receptionist frontend deliberately extracts the leading `YYYY-MM-DD` and compares it to `store_today` (`2026-11-19`), so the booking was filtered out before the ON GOING stage filter ran.

This was a date serialization contract defect, not a missing database record, wrong workflow stage, payment gate, authorization error, pagination issue, or queue SQL filter.

## Original Evidence

The original failure context at `browser-evidence/system-security-audit-20261108/phase12/07-boarding-checkin-tab-failure-context.md` shows:

- Page: `/receptionist/bookings/hotel?tab=on_going&range=today`.
- Date preset: Today; page store date `2026-11-19`.
- The page had loaded 73 requests, but the Today/ON GOING tab count was 0.
- Search for the test pet and room returned no row; check-in was not attempted.

Read-only SQL against the isolated `pawesome_booking_audit` database showed:

| Record | Actual value |
|---|---|
| Boarding #88 | `scheduled`, `paid`, check-in/out `2026-11-19 00:00:00`, online |
| Reservation #48 | source `pet_hotel`, source ID 88, room 23, `scheduled`, date 2026-11-19 |
| Same ID in working `pawesome` | No boarding #88 |

## API-to-Frontend Trace

The verified API was started with explicit `DB_DATABASE=pawesome_booking_audit` on local port 8015; the receptionist login returned role `receptionist`.

Before the fix, the real request was:

```text
GET /api/receptionist/boarding-requests
HTTP 200
query: none
```

The response contained 73 boardings, `store_today=2026-11-19`, and boarding #88 with `workflow_stage=on_going`. Its `check_in`, `check_out`, and nested reservation dates serialized as `2026-11-18T16:00:00.000000Z`.

`BoardingController::index()` does not filter this list by date or status; it returns the boardings, eager-loads reservation/room relationships, assigns `workflow_stage`, and returns `store_today`. `ReceptionistHotelBookings` requests that endpoint, normalizes the list, then applies `matchesDatePreset()` and compares `workflow_stage`. `bookingTabs.getServiceDate()` slices the first ten characters. Thus the actual date became `2026-11-18`; the Today range was `2026-11-19` through `2026-11-19`; the booking failed the date filter.

The workflow stage was already correct: `scheduled` plus `paid` maps to `on_going`. Reservation dates showed the same UTC serialization problem. Database schema confirms legacy `boardings.check_in/check_out` are `DATETIME`, with separate time columns, while reservation dates are SQL `DATE`; both are calendar-date values for this workflow.

## Fix

- `Boarding` now serializes `check_in` and `check_out` with date-only casts (`date:Y-m-d`).
- `BoardingRoomReservation` now serializes `check_in_date` and `check_out_date` with date-only casts.
- This preserves the existing database fields, Carbon date behavior, store-local calendar semantics, status logic and receptionist filters. No date filter or authorization rule was removed.

## Regression Evidence

- Targeted PHPUnit regression: `BoardingRoomLifecycleTest::test_receptionist_queue_serializes_store_local_boarding_dates_without_utc_shift` passed, 10 assertions, with `APP_TIMEZONE=Asia/Manila`.
- Frontend unit tests: 2 targeted `bookingTabs` tests passed, including Today inclusion and exclusion of a tomorrow booking.
- Post-fix API `GET /api/receptionist/boarding-requests`: HTTP 200, 73 records; row #88 remained `scheduled`/`paid`, stage `on_going`, and boarding plus reservation dates returned as `2026-11-19`.
- Native online hotel Playwright lifecycle passed end-to-end in the controlled audit stack (1 test, 2.4 minutes), including check-in. The complete selected six-file batch was also rerun; its hotel lifecycle passed, but an unrelated customer-board filter test timed out, so the batch is not accepted as green.
- The previous screenshot/context, current lifecycle evidence and API observations are under `browser-evidence/system-security-audit-20261108/phase12/` and `phase12-boarding/`.

## Remaining Acceptance Work

The exact selected Playwright batch still needs a clean full rerun. The three walk-in browser tests currently verify creation, API approval, cashier queue visibility and customer tracking; they do not yet complete every role's operational/payment lifecycle. Full-suite backend, role, integrity and deployment gates also remain.
