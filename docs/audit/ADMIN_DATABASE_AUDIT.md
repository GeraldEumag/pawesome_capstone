# Admin Database Audit

Live database: `pawesome_e2e_audit` (isolated copy used for all state-changing tests).
Unit-test database: `pawesome_test` (PHPUnit). Development DB `pawesome` untouched.

## Schema state (Gate C — full PASS)

- **93 tables, 182 migrations — all applied, 0 pending/failed.**
- PKs, 136 FK constraints, unique indexes (`users.email`, `users.username`,
  `personal_access_tokens.token`, `inventory_items.sku`) verified.
- Column types verified on critical tables (`users`, `inventory_items`,
  `service_requests`, `appointments`, `payrolls` — enums are stricter than varchar
  where applicable).
- Seed/reference data present: 9 role users, 30 services, 837 inventory items,
  5 customers, 3 pets.

## Integrity findings

- **Zero orphans**: pets→customers, customers→users, appointments→service_requests,
  service_requests→users, medical_records→appointments, service_item_usages→inventory_items,
  payrolls→users.
- Design notes (pre-existing, not defects): `appointments.service_request_id` and
  `service_requests.customer_id` are logical (unenforced) FKs; dual boarding-room
  tables by design (`boarding_rooms`=catalog, `hotel_rooms`=physical assignment);
  `service_item_usages` is the authoritative service-billing line-item table.
- `vet_appointments` is **retired** by migration `2026_09_28_000002` — absent in
  both DBs (Gate C's `getTables()` reported it via a MariaDB cross-schema quirk).

## Dashboard reconciliation (verified vs SQL)

| Metric | API | SQL ground truth |
|--------|-----|------------------|
| total_users | 11 | 14 rows − 3 soft-deleted = 11 ✓ |
| total_customers | 5 | 5 ✓ |
| appointments / completed | 2 / 1 | matches ✓ |
| total_revenue | 1450 | `RevenueService` multi-source: sales 1000 + paid appointment 450 = 1450 ✓ |
| low-stock items | 269 | 269 ✓ |
| active_modules | (removed) | was hardcoded 9 — fabricated; field removed (ADM-06) |

## Login/activity persistence

- `login_logs`: success + **failed** attempts now recorded with `status` and
  `failure_reason` (`invalid_credentials`, inactive account) — verified live.
- `activity_logs`: admin mutations (user update/toggle/delete) traceable.
- `notifications`: login alerts (`info`) + admin failed-login alerts (`warning`)
  created when enabled — enum-validated.
- `email_deliveries`: admin-created user welcome-email intent persisted (encrypted
  recipient/payload, `occurrence_key` dedup).

## Backup/restore

mysqldump not on PATH (env note); schema export + 182 migration files + 10 seeders
confirmed present.
