# Phase 5 — Schema Debt Documentation + Dead-Endpoint Fix

**Base:** `a7ddd81` (Phase 4 + lock-order correction)
**Scope (authorized):** F-05 dual-purpose schema review, F-06 dead frontend helper, T-032 payable-construct map. Deliberately **no destructive schema changes** — the `pawesome` database must never be altered and historical data is protected; every "drop" decision below is documented with its precondition rather than executed.

---

## 1. Reference audit — what each flagged table actually is

Verified by full-repo grep (`app/`, `routes/`, `tests/`, `database/seeders`, `frontend/src/`):

| Table | Verified state | Evidence | Phase 5 resolution |
|---|---|---|---|
| `booking_requests` | **Dead** | Zero code references anywhere; only its own 2026-04-28 migration creates it. Superseded by `service_requests`. | Documented drop candidate — requires a data-archive decision before a drop migration (post-capstone ops item, needs prod row-count + export). **Not dropped.** |
| ~~`vet_appointments`~~ | **Does not exist** — not a table | `ReportsController`'s `vet_appointments` *report key* (~line 796) is a label on `appointmentsBase()`, which queries `DB::table('appointments')` — no separate table. (The AUDIT_REPORT's "vet_appointments read by legacy path" claim conflated the report key with a table name.) | No table to retain or drop; report key is label-only on the canonical `appointments` table. |
| `grooming_appointments` | **Live-legacy read** | `BookingAvailabilityService` (line ~185) counts it toward groomer blocking, guarded by `Schema::hasTable`. | Retained; documented — removing the table is safe *only* because the service guards its absence, but existing rows still block slots. |
| `attendance_records` | **Live parallel pool** | `AttendanceRecordController` (index/create/summary) + `ReportsController` (~425) + `AttendanceRecord` model. | Retained; documented as the thin legacy attendance store parallel to `attendance`(+corrections). |
| `hotel_rooms` | **Live — managed dual pool** | 7+ controllers + `BookingAvailabilityService` blocking. | See contract below. |
| `boarding_rooms` | **Live — managed dual pool** | Same availability service, separate blocking semantics. | See contract below. |
| `customers` vs `users` | **Intentional split** | Consistently joined (profile vs account). | No action — by design. |

### Dual-pool contract: `hotel_rooms` vs `boarding_rooms` (T-031)

`BookingAvailabilityService` treats the two pools as **distinct inventory**, not duplicates:

- **`hotel_rooms`** — legacy single-unit pool. One row = one physical room; blocked via `boardings.hotel_room_id`. `capacity` means pets-per-room.
- **`boarding_rooms`** — capacity pool. `total_rooms > 1` stays available until every unit is booked; blocked via `boarding_room_reservations.room_id`. Optional `customer_selectable` flag.
- Blocking counts are computed per-pool by `blockingBoardingRoomUnits($roomId, $in, $out, $pool)` — availability checks must pass the correct pool name (`isBoardingRoomAvailable(..., $pool)`).

**Contract:** a room type must live in exactly one pool; availability readers must not cross-sum the pools; new room types go to `boarding_rooms`. Documenting this (rather than consolidating) is the audit-accepted resolution — consolidation is a separate data-migration project.

## 2. Payable-construct map (T-032)

Six payable constructs coexist; reports must pick the canonical source per flow:

| Table | Role | Canonical for |
|---|---|---|
| `payments` | Base payment rows (method, status, proof refs) | Booking/service payment state + proof verification |
| `payment_settlements` (+`_items`) | Aggregated settlement documents | Cashier settlement reporting, `PaymentSettlementService` |
| `service_billing_payment_requests` (+`_items`) | Staff-created payable requests awaiting verification | Cashier verification queue (`PaymentVerificationService`) |
| `sales` (+`sale_items`) | POS/inventory sales | `SalesAnalysis`, POS receipts, revenue from merchandise |
| `invoices` | Billing documents (`Invoice` model) | Invoice-level billing views |
| `visit_invoices` (+`_lines`, `_adjustments`) | Vet visit billing with adjustment workflow | Visit billing (`VisitBilling*` tests), `VisitInvoiceController` |

Overlap is real (a visit can touch `payments` + `visit_invoices` + `service_billing_payment_requests`); this map is the reference for which construct is authoritative per flow — enforced by `PaymentVerificationService`, `ReceiptService`, and `RevenueService`.

## 3. F-06 — dead frontend helper

`frontend/src/api/inventory.jsx::adjustBatchStock` called `POST /inventory/batches/{id}/adjust` — a route that does not exist (the real endpoint is `PUT /inventory/batches/{batchId}` → `Admin\InventoryController::adjustBatch`). No component called it. **Fixed to the real route** rather than deleted — the helper is now consistent with the backend surface.

## 4. Files changed

- `frontend/src/api/inventory.jsx` — `adjustBatchStock` → `PUT /inventory/batches/{id}` (F-06/T-013)
- `frontend/src/api/inventory.test.js` — new vitest asserting URL + method + payload
- `docs/audit/PHASE5_SCHEMA_DEBT.md` — this report

No backend code changed; no schema changes; no data touched.

## 5. Verification

| Check | Result |
|---|---|
| Reference audit | `booking_requests` = 0 code refs; other flagged tables = named live consumers (table above) |
| `inventory.test.js` (new) | **1/1** — asserts `PUT /inventory/batches/{id}` + `{quantity, reason}` body |
| Vitest | **33/33** (32 + 1 new) |
| `npm run build` | clean |
| Backend suite | unchanged code — `a7ddd81` gate result stands: 984 passed / 1 skipped / 0 failed / 4,906 assertions |

## 6. Deferred (documented, not executed)

- `booking_requests` drop migration — needs production row-count + archive export first.
- Legacy-table consolidation (`grooming_appointments`, `attendance_records`) — each has live readers; removal is a data-migration project, not a cleanup commit. (`vet_appointments` was removed from this list — it is a report label, not a table.)
- Payable-construct consolidation — the six constructs each have active services; the map documents canonical sources instead.

## 7. Stop gate

Phase 5 complete. Phase 6 (manuscript/user-docs alignment with all approved descopes and security changes) remains unauthorized.
