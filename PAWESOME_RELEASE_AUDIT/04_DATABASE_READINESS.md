# 04 — Database Production Readiness

## Schema posture (verified)

- **195 migration files**, chronological `YYYY_MM_DD_*` naming, all
  committed; dev DB `pawesome` reports **all migrations Ran, 0 pending**.
- Composition: predominantly additive — `create_*` tables and
  `add_*`/`extend_*` columns. ~40 migrations touch `decimal` columns
  (financial precision), 4 use `softDeletes`, FKs widespread
  (`foreignId`/`foreign` across ~176 files incl. cascade rules).
- `phpunit.xml` pins the suite to MySQL `pawesome_test`; CI runs the
  full suite on a MySQL 8.0 service — migrations are exercised against
  MySQL 8 in CI, not just sqlite.
- Money columns use decimal; VAT-inclusive convention enforced at the
  service layer (prior audit); stock movements are append-only ledger
  rows (`2026_11_22_000001_stock_movement_system`).
- Historical-data protections exist: snapshot fields
  (`add_snapshot_fields_for_historical_data`), identity tombstones
  (`add_identity_tombstones_to_users_and_customers`), soft deletes on
  customers/pets, email suppression list, idempotency-key table.

## Migration-by-migration risk assessment (categorized — all 195 reviewed by pattern; representative risks below)

### Category A — Safe additive (≈180 migrations)

`create_*` tables, nullable/defaulted `add_*` columns, new indexes
(`add_report_read_path_indexes`), new enums on new tables. Run in order
on an empty production DB exactly as in dev. **Risk: none.**
`preDeployCommand: php artisan migrate --force` handles them.

### Category B — Guarded/duplicate-safe

- `2026_04_27_220017` + `2026_04_28_000000` both create
  `service_requests` — second is guarded by `Schema::hasTable`. Safe.
- `2026_05_05_072709` + `092104` both `add_profile_fields_to_pets` —
  additive columns; verified Ran on dev.

### Category C — ENUM modifications (table rebuild on MySQL)

- `2026_11_18_000001_add_ready_for_pickup_to_service_request_status_enum`
  — raw `ALTER TABLE ... MODIFY COLUMN status ENUM(...)` **twice**
  (up adds `ready_for_pickup`, down removes it). ENUM changes rebuild the
  table on MySQL; `service_requests` is a moderate-size table — brief
  lock acceptable at capstone scale, but **run in low-traffic window**.
- `2026_11_19_000001_update_philippine_holiday_calendar` —
  `->change()` on `holidays.type` enum (rebuild, tiny table) **plus a
  data upsert** of 2026/2027 holiday calendars and cache invalidation.
  Idempotent upsert — safe to re-run.

### Category D — Data-mutating migrations (require awareness, already applied)

- `2026_09_28_000002_retire_vet_appointments` — retires legacy vet
  appointment rows (data migration).
- `2026_11_14_000001_add_identity_tombstones` — tombstones PII on
  deletion (privacy feature).
- `2026_11_19_000000_seed_ward_beds` — **seeds reference data inside a
  migration** (ward bed rows). Acceptable for reference data; note it
  runs on every fresh deploy.
- `2026_11_19_000001` holiday upsert (above).

### Category E — Irreversible drops (intentional feature removals)

- `2026_10_27_000000_drop_visit_estimates_and_dispensations`
- `2026_10_29_000000_remove_triage_workflow`
- `2026_10_31_000000_drop_controlled_drug_tables` — reclassifies
  `item_class='controlled_drug'`→`'medicine'` before dropping (data
  preserved semantically).
- `2026_09_28_100002_drop_work_schedules_table`

All have no-op or lossy `down()`. **These already ran** on dev/test; on a
fresh production DB they run once in sequence — correct. On an
*existing* production DB they are one-way; take a backup first (report 05).

## Migration safety verdict

- Fresh production deploy (`migrate --force` on empty DB): **SAFE** —
  order is chronological, guards present, CI proves the chain on MySQL 8.
- Existing-database upgrade path: **SAFE WITH CAVEATS** — enum rebuilds
  (Category C) lock briefly; data migrations (D) mutate rows; drops (E)
  are irreversible. All require a pre-migration backup.
- No migration assumes an empty DB except seeders (which are NOT run by
  `migrate`); demo seeders must be excluded from production.
- `migrate:rollback` is **not** a safe recovery path (several `down()`
  are lossy/no-op) — rollback = code revert + backup restore. Documented
  in runbook.

## Data integrity spot-checks (dev DB)

- FK constraints present across financial/inventory/booking tables;
  cascade rules reviewed in prior audit (report 09).
- Stock movement ledger + batch tracking verified; reconcile command
  `inventory:reconcile-stock` exists for drift detection.
- Decimal precision on money columns verified in prior audit.
- Soft-delete + tombstone pattern preserves referential history.

## Manual production actions required

1. Pre-migration backup (report 05 procedure).
2. Run `php artisan migrate --force` in a low-traffic window (enum rebuilds).
3. Do **NOT** run demo seeders (`DemoDataSeeder`, `PawesomeLiveDemoSeeder`,
   `BitposItemsSeeder` unless product catalog import is intended).
4. Do **NOT** use `migrate:fresh`/`db:wipe`/`migrate:refresh` — ever.

**Status: PASS (with documented migration-window caveat).**
