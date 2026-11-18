# Grooming Booking Audit

## Trace

- Online UI `frontend/src/components/customers/GroomingForm.jsx` submits `POST /api/customer/requests`; server resolves active catalog pricing, validates pet ownership and schedule, then atomically creates `service_requests` + `groomings`.
- Walk-in UI uses unified `POST /api/receptionist/walk-ins`; the same service schedule lock/capacity check applies and the server stamps `walk_in`.
- Receptionist approvals go through `ReceptionistRequestController@approve`; execution/status routes include `PATCH /api/receptionist/requests/{id}/status` and `PUT /api/grooming/{id}/status`. Completion requires paid status and service billing eligibility on the dedicated grooming route.
- Inventory consumption is handled by `GroomingInventoryService`/`ServiceItemUsage`; only configured inventory-linked items are consumed.

## Confirmed defect and fix

Live audit-db probes showed the dedicated grooming endpoint accepted `cancelled→approved` and `cancelled→in_progress` with HTTP 200. The primary receptionist request endpoint could also change only `service_requests.status`, leaving linked `groomings.status` stale for `in_progress`/`completed`.

Added `Grooming::STATUS_TRANSITIONS` and shared transition check. Both receptionist paths now reject invalid transitions; request status changes to `in_progress`/`completed` synchronize the linked grooming row; the dedicated route synchronizes its linked request. `BookingFinalAuditTest` tests terminal-state reopen rejection, valid execution transitions, payment-gated completion, and status synchronization.

## Test outcomes

- Online and walk-in creation: `CustomerBookingRulesTest`, `BookingSchedulingIntegrityTest`, `WalkInBookingTest`.
- Add-on/payment rules: `PaymentBookingChannelTest`, `ServiceBillingRemediationTest`.
- New hardening tests: `BookingFinalAuditTest` passes within the final targeted backend run; see exact count in `BOOKING_TEST_RESULTS.md`.
- Live online request returned 201; receptionist approval created grooming row; unpaid completion returned 422.

## Limitations

The system has no separate groomer role; grooming operations are receptionist-owned. `grooming_appointments` is a legacy table consumed by legacy `GroomingController`; the operational dashboard uses `groomings`. Full Playwright grooming UI execution was **not independently verified**; see `BOOKING_TEST_RESULTS.md`.
