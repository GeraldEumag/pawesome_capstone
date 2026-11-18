# Booking System Audit

This is the system-level deliverable for the final Pawesome booking audit. It assesses the existing React → Laravel API → MySQL → role-dashboard implementation; it does not propose a replacement booking system.

## Executive result

The central booking source is `service_requests`; type-specific execution is represented by `appointments`, `boardings`, and `groomings`. Online and receptionist walk-in channels use shared validation, availability, payment and reporting integrations. Live API probes plus 145 targeted PHPUnit tests (630 assertions) verify core booking rules, role gates, payment separation, and the fixes below.

Confirmed defects fixed with regressions:

1. Grooming terminal states could be reopened and linked request/grooming statuses drifted. A shared transition map now governs both status APIs and execution synchronization.
2. Walk-in hotel reservations remained `pending` after checkout when the boarding had a linked request. Reservation status synchronization now supports both `pet_hotel` and `service_request` source keys.
3. Check-in compared against UTC “today” rather than the store-local booking date. Both boarding and generic receptionist check-in use the configured store timezone.
4. The Sales date-filter P1 was already resolved in commit `21e480a`; date-filtered live manager/admin reports returned data, and `ReportsTest` passed.

See `VETERINARY_BOOKING_AUDIT.md`, `HOTEL_BOOKING_AUDIT.md`, `GROOMING_BOOKING_AUDIT.md`, `BOOKING_API_ENDPOINT_MATRIX.md`, `BOOKING_DATABASE_INTEGRITY_REPORT.md`, `BOOKING_TEST_RESULTS.md`, and `BOOKING_DEFECT_TRACKER.md` for evidence and caveats.

**Recommendation: conditional Capstone acceptance.** The backend targeted regression suite and production build pass; selected Playwright E2E coverage had 3 failures, 6 skipped, and 4 not run. Do not claim full browser acceptance until those are triaged.

Working-database incident disclosure and backup/cleanup verification: `evidence/PAWESOME_RESIDUE_DELETION_REPORT.md`.
