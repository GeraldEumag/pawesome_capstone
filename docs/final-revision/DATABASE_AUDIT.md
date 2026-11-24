# DATABASE_AUDIT.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · **Engine under test:** MySQL 8.0.44 (authoritative, `phpunit.mysql8.xml` @127.0.0.1:3307); dev DB `pawesome` on XAMPP MariaDB 10.4.32.

## 1. Schema state (verified)

- 191 migrations, all `Ran` on dev DB; 98 tables.
- Suite requires MySQL — migrations use MySQL-specific syntax; sqlite is not a supported test target. `phpunit.xml` defaults to 3306 (MariaDB dev) — **authoritative runs use `phpunit.mysql8.xml` (3307)**; a default-config run against a stale MariaDB `pawesome_test` produced `employee_no`-missing failures, confirming 3307 is required.

## 2. Migrations added this revision (both additive + reversible)

| Migration | Change | Safety review |
|---|---|---|
| `2026_11_24_000001_add_uom_packaging_to_inventory_items` | `pack_size`, `box_size`, `unit_options` (JSON) columns on `inventory_items` | Nullable/defaulted; no data rewrite; `down()` drops columns |
| `2026_11_24_000002_add_report_read_path_indexes` | 8 indexes: `payments.created_at`, `service_requests.{created_at,payment_status}`, `customer_orders.created_at`, `boardings.created_at`, `medical_confinements.created_at`, `appointments.created_at`, `sales.status` | Indexes only — no column/FK changes; existence-guarded `up()`/`down()`; evidence below |

## 3. Index evidence (FR-03)

EXPLAIN on dev data **before** migration:

- `payments` report merge (`created_at BETWEEN … ORDER BY created_at DESC LIMIT 500`): `type=ALL`, filesort.
- `service_requests` same query: `type=ALL`, filesort.
- `sales` date range: already `range` via `sales_created_at_index`.
- Cashier dashboard/queue filters `service_requests.payment_status` and `sales.status='completed'`: unindexed columns.

**After** migration: both report queries show `type=range` using `payments_created_at_idx` / `service_requests_created_at_idx`. Write overhead: 8 single-column indexes on small-to-moderate tables — negligible; no duplicate/covering-index conflicts found (verified via `SHOW INDEX`).

## 4. Data integrity mechanisms (re-verified)

- Financial: server-side price/VAT recompute in POS; transactions + `lockForUpdate` on stock and payment mutations; idempotency keys on POS transactions.
- Inventory: single write path through `InventoryService`; every movement writes `InventoryLog` with actor, delta, before/after stock inside the same transaction; `inventory:reconcile-stock` dry-run/apply repair command exists.
- Email outbox: `email_deliveries` durable intents deduped by `occurrence_key`, encrypted recipients.
- No resets/truncates/deletes performed on any non-test database this revision.

## 5. Known schema debt (documented, not defects)

- `pay_period_start/end` stored as VARCHAR `YYYY-MM-DD 00:00:00` (C-07, cosmetic).
- Unrouted legacy payroll `update`/`processPayment` endpoints reference schema normally (C-01).
