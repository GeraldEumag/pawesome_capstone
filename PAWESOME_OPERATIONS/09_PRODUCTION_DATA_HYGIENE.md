# 09 — Production Data Hygiene

**Status:** REVIEWED — cleanup plan proposed, **awaiting owner approval** (nothing deleted)
**Date:** 2026-11-28

## Smoke-test records identified (all verified live)

All records trace to a single test identity:

| Record | Identifier | Details |
|---|---|---|
| User | id **52** | `kiezerherristpascua+smoke1795862336@gmail.com`, role `customer`, name "SMOKE TEST USER" |
| Customer | id **39** | `user_id=52`, name "SMOKE TEST USER", phone `09171234567` |
| Pets | ids **23, 24, 25** | SmokePet, SmokePetPhoto (`image=pet_photos/C4Uw…png`), SmokeRabbit — `customer_id=39` |
| Appointments | ids **30, 31** | `customer_id=39`, `pet_id=24`, service 11, status `requested`, Dec 1–2 2026 |
| Inventory item | id **846** | SKU `SMOKE-001`, "Smoke Test Item", stock **43** (was adjusted 50→45 during test, then 2 sold) |
| POS sale | id **21** | `TRX-6B0AB43C714E1`, ₱200.00, completed, `cashier_id=1`, `customer_id=NULL` (walk-in) |
| Sale items | id **155** | sale 21 → product 846 ×2 @ ₱100 |
| Email deliveries | 4 rows | `user_id=52` (verification 442, appointment.created 443/444, password_reset 445) |
| Storage files | `pet_photos/C4Uw9W9HKM6ji3oMFBRDnA9DYZTVyklXuNMEMJfT.png` (+ `smoke-payslip-test.pdf`, `test_pet.png` noted earlier) | on private disk |

## Dependency & impact analysis

- **FK web:** pets/appointments → `customers.id=39` → `users.id=52`;
  sale_items → sale 21 + product 846; appointments → service 11.
- **Financial reports:** sale 21 (₱200) and the inventory stock mutations
  (create 50 → adjust −5 → sale −2 = 43) WILL appear in sales/inventory
  reports until removed. `sales`/`sale_items`/`inventory_items` have no
  soft-delete/archive on sale; `inventory_items` supports `archived_at`.
- **Email outbox:** 4 delivery rows reference user 52 — historical record,
  safe to keep or delete with the user.
- **Appointments 30/31** are `requested` — they occupy booking slots on
  Dec 1–2 and could block real bookings for pet 24's service.
- **No payment_receipts** linked to sale 21 or customer 39 found.
- Legitimate seeded/demo data (sales 19–20 from Nov 19, other customers)
  is **NOT** part of this cleanup — untouched.

## Cleanup options

**Option A — Archive (safest, recommended):**
1. `inventory_items` 846 → set `archived_at/archived_by/archive_reason`
   (supported by schema) — removes from active inventory/reorder views.
2. `appointments` 30/31 → status `cancelled` (or delete if no FK dependents
   — check `appointment_status_rollback_map`, notifications first).
3. Keep user 52/customer 39/pets/sale as historical test data, OR
   soft-delete customer (`customers.deleted_at` supported).

**Option B — Full removal (owner approval required):**
delete in FK-safe order inside a transaction:
`sale_items(155) → sales(21) → appointments(30,31) → pets(23,24,25)
→ customers(39) → users(52) → email_deliveries(user_id=52)`
plus storage files. Requires verifying no other FK references
(`grooming_appointments`, `service_requests`, notifications, audit logs
retain `user_id`/`customer_id` references — audit logs SHOULD be kept as
history).

**Option C — Leave as-is:** records are clearly labeled "SMOKE TEST";
cosmetic noise only. Zero risk.

## Recommendation

**Option A now, Option B later if desired.** Archiving removes the only
real operational impact (inventory noise, booking-slot occupancy, sales
report pollution) without destroying audit history. Full deletion is
permanent — requires explicit per-record approval.

## Approval requested

Please choose: **A** (archive — I execute immediately), **B** (full delete
of listed records only), or **C** (leave). I will not delete anything
without your answer.
