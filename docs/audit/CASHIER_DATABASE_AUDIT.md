# Cashier Database Audit

Date: 2026-11-18 · Targets: `pawesome` (read-only) + `pawesome_cashier_audit` (mutation evidence)

## 1. Monetary precision sweep

All money columns on cashier-connected tables are `DECIMAL` — **no `FLOAT`/`DOUBLE` anywhere**:

| Table | Columns | Precision |
|---|---|---|
| sales | amount, subtotal, tax_amount, discount_amount, total_amount | decimal(10,2)/(12,2) |
| sales | cash_amount, card_amount | decimal(8,2) — caps ~₱999,999.99, see §5 |
| sale_items | unit_price, discount_amount, total_price | decimal(12,2) |
| payments | amount, change_amount | decimal(12,2) |
| invoices | subtotal, tax_amount, discount_amount, total_amount | decimal(12,2) |
| payment_settlements | amount | decimal(12,2) |
| payment_settlement_items | unit_price, total_price | decimal(12,2) |
| service_requests / boardings / appointments / groomings | price, total_amount, amount_paid, balance_due, … | decimal(10,2) |
| medical_confinements | estimated_cost, deposit_amount, daily_rate, final_amount | decimal(10,2) |
| customer_orders / _items | total_amount, price, subtotal | decimal(10,2) |
| inventory_items, services | price, cost | decimal(10,2) |

## 2. Enum conformance

- `sales.status` enum: `pending, completed, cancelled, refunded` — **the driver of three P1 defects** (code wrote `voided`, `refund`, `multi_payment`). Fixed in code; enum intentionally left unchanged (no schema migration needed).
- `sales.type` enum: `appointment, boarding, product`.
- `Sale::VALID_STATUSES`/`VALID_TYPES` (model) are supersets of the DB enums — now harmless because every write path emits DB-legal values. Noted as future hygiene (P3).
- `payment_settlements.settleable_type` observed: `boarding, grooming, medical_confinement, service_request, veterinary` — all handled in feed mapping.

## 3. Integrity checks (dev DB, read-only)

| Check | Result |
|---|---|
| `sale_items` orphans | 0 |
| `payments` orphans | 0 |
| `payment_settlement_items` orphans | 0 |
| Duplicate `payment_settlements.receipt_number` | 0 |
| Invalid `sales.status`/`sales.type` values | 0 |
| Actor-less settlements (verified_by NULL, last 30d) | 0 |

## 4. Relationships & concurrency

- `payment_settlements` ↔ `payment_settlement_items` FK'd; settlements idempotent via `idempotency_key` (probed: replay returns the same row).
- POS checkout: `sales` + `sale_items` + `payments` + `invoices` + `inventory_logs` written in one transaction (verified: exactly one of each per sale).
- Inventory: stock moves exclusively via `InventoryService` with batch allocation + dual-ledger log (`sale`/`sale_void`/`batch_restock` rows, single delta applied — verified on void: stock 56→58 exactly once).
- `inventory_logs.performed_by` is a display-name varchar by convention ("Cashier") — consistent with schema; 12 legacy NULL rows already documented by the inventory audit.
- `PaymentVerificationService` uses `lockForUpdate` on payable rows and writes booking + mirrored `service_requests` + settlements + activity logs + outbox email intents atomically.

## 5. Data-hygiene notes (non-blocking)

- `sales.cash_amount`/`card_amount` are decimal(8,2) — ~₱999,999.99 cap. Acceptable for capstone; flag for production hardening.
- Item #275 is a ₱0 sellable product — data, not code. Recommend review/discontinue.
- Historical `payment_settlements.payment_method IS NULL` rows remain from the fixed stale-read bug (pre-fix data; append-only ledger, not rewritten by design).

## 6. Verdict

Schema is financially sound (DECIMAL everywhere, append-only settlement ledger, atomic mutations, actor attribution). The only schema-adjacent defect class was code writing enum-illegal values — fixed without any migration.
