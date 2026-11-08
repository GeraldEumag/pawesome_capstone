# Database Integrity Audit — 2026-11-08

Status: **Isolated schema and selected invariants verified; production-data integrity not inspected.**

## Environment and safety

User approved resets only for local `pawesome_test` and creation/migration/seeding of a separate, previously absent `pawesome_e2e_audit`. Effective Laravel test DB was checked before resetting. E2E runs use separate API processes, array mail and isolated storage roots. No normal-development or production DB was reset or bulk-repaired.

Local engine: MariaDB 10.4.32. MySQL-compatible driver does not prove MySQL 8 compatibility; CI engine parity remains a separate gate.

## Actual metadata

Fresh isolated E2E migration and seed completed successfully. Read-only information_schema inspection found **93 tables**, all InnoDB; **181 migration rows** and **136 foreign-key column relationships**. This is not a count of independently verified business constraints.

Tables include users/customers/pets; requests/appointments/groomings/boardings/reservations; inventory items/batches/logs/audits; sales/items/payments/settlements/invoices; clinical records/addenda/consents/diagnostics/confinement; receipts/extractions/validations/references; payroll/attendance/leave; outbox/jobs/notifications; chatbot/live chat; settings/content. Legacy tables coexist with active structures; existence does not prove runtime use.

## Read-only checks and workflow trace

At the inspected synthetic-data snapshot: orphan pets = 0; service requests without their referenced user = 0; negative inventory stock = 0; negative batch quantities = 0. Queries used LEFT JOIN missing-parent counts and stock < 0 counts, not private-row exports.

Cross-role workflow request #1 linked to appointment #1, pet #1 and veterinarian #7; owner user #9; request approved and appointment in_consultation. Later runs create additional isolated fixtures; these IDs are synthetic local evidence, not production records.

## Concurrency evidence

Before the idempotency fix, synthetic inventory item #838 retained stock 3 from initial 5 and had 2 sale lines / 2 units sold for concurrent same-key requests. After correction, item #839 retained stock 4 with 1 sale line / 1 unit sold. Verified through `sale_items.product_id`, not the API's input `item_id` name.

## Read-only schema/reference snapshot

`backend/pawesome_schema_integrity_snapshot.php` refuses non-approved databases and writes non-overwriting evidence. On `pawesome_e2e_audit`, **136 declared foreign-key orphan checks passed, 0 failed/blocked**, and **25 direct logical-reference checks passed** for non-FK links such as service-request, room-reservation, booking-add-on, settlement, invoice and usage references. **46 `_id` columns** remain unconstrained for explicit polymorphic/legacy/system mapping review; that count is not automatically a defect.

## Remaining

Audit polymorphic/legacy references, indexes/uniqueness/status/nullable constraints, migration upgrade paths on retained data, financial and stock reconciliation across all modules, duplicates, expiry/batch drift and production-like volume. No bulk repair or destructive restore drill is authorized. A fresh-schema migration pass does not certify safe production upgrades or backup restoration.
