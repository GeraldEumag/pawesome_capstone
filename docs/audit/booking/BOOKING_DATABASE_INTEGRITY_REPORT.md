# Booking Database Integrity Report

Database: `pawesome_booking_audit`, created from a single-transaction dump of `pawesome`; 94 tables. Working DB was not intentionally mutated; probe residue incident and cleanup evidence: `evidence/PAWESOME_RESIDUE_DELETION_REPORT.md`.

## Integrity results

Read-only `information_schema` and join checks:

| Check | Violations |
| --- | ---: |
| `service_requests.pet_id` → pets | 0 |
| `service_requests.customer_id` → users | 0 |
| appointments → service requests | 0 |
| groomings → service requests | 0 |
| boardings → service requests | 0 |
| pet_hotel reservations → boardings | 0 |
| service_request reservations → service_requests | 0 |

Critical link columns (`service_request_id`, room references, actor references) are indexed but several lack database FKs; zero orphans in the audit snapshot. `boarding_room_reservations.source_id` is polymorphic, so app transactions are the integrity boundary.

## Schema/status evidence

- `service_requests.status` enum: `pending, scheduled, approved, rejected, cancelled, canceled, completed, paid, confirmed, rescheduled, in_progress, checked_in, ready_for_pickup`; payment enum remains separate.
- `appointments.status` is varchar and validated by `Appointment::VALID_STATUSES` (requested, scheduled, checked_in, in_consultation, in_treatment, awaiting_results, clinical_complete, checkout, completed, cancelled, rejected, no_show).
- `groomings.status` is varchar; validation and transition graph now enforced by application code.
- `boardings.status` and `boarding_room_reservations.status` are enums. `boarding_room_reservations` overlap index is `(room_id,check_in_date,check_out_date)`.
- 210 legacy service requests have NULL `booking_channel`; new rows receive server-side online/walk-in values.
- `vet_appointments` is retired; `hotel_rooms` and `grooming_appointments` remain legacy-supported tables, not candidates for destructive merge in this audit.

## Findings

DB-001: missing FKs on central links (P3, documented; migration deferred pending orphan/rollback review). DB-002: appointment/grooming statuses lack DB constraints (P3). DB-003: legacy duplicate cancellation spellings (P3). Index coverage for observed booking queries was adequate. No data cleanup or schema migration was performed.
