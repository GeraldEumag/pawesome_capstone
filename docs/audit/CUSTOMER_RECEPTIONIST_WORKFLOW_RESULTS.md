# Customer ↔ Receptionist Workflow Results

**Date:** 2026-11-17

## Customer capabilities (verified)

| Capability | Evidence | Result |
| --- | --- | --- |
| Login / registration | `EmailAuthFlowTest`, e2e `batch1-customer-system`, `email-auth-flows` | PASS |
| Profile management | `ProfileSettings` + API tests | PASS |
| Pet CRUD | `CustomerDataIsolationTest`, `PrivatePetPhotoTest`, e2e `customer-add-pet-modal` | PASS |
| Browse services | e2e `customer-services-interactions` | PASS |
| Grooming / vet / boarding requests | e2e `phase12-native-ui-workflows`, `batch1-customer-system` | PASS |
| Product browse + cart | product catalog live; **checkout deliberately disabled (410)** — descoped, documented | PASS (scoped) |
| Request/order tracking | e2e `customer-bookings-board`, `booking-tracker-tabs` | PASS |
| Payment status + proofs | `CustomerPayments`, e2e `phase4-payment-workflow` | PASS |
| Notifications | `CustomerNotifications`, email outbox | PASS |
| Ownership isolation | `CustomerDataIsolationTest` — no cross-customer read/write | PASS |

## Receptionist capabilities (verified)

| Capability | Evidence | Result |
| --- | --- | --- |
| View/approve/reject requests | `ReceptionistApprovals`, e2e `batch2-receptionist-system`, `revision-b-confirmed-flows` | PASS |
| Schedule appointments | `ReceptionistBookings`, e2e `receptionist-booking-order`, `receptionist-later-bookings` | PASS |
| Room assignment | `WalkInBookingModal`, e2e `receptionist-room-assignment`, `phase12-boarding-workflow` | PASS |
| Status updates + remarks | receptionist controller tests | PASS |
| Trigger notifications | approval → notification intent tests | PASS |
| Cannot verify payments | cashier-only verification, `EnsureRole` | PASS |
| Cannot perform vet procedures | `EnsureRole` on `api/veterinary/*` | PASS |

## Cross-role verification pattern

Every workflow in the E2E suite follows: browser action → API response → DB record → other-role visibility → notification. Evidence: `WORKFLOW_INTEGRITY_MATRIX.md`, `WORKFLOW_INTEGRATION_TEST_RESULTS.md`, `browser-evidence/` captures.
