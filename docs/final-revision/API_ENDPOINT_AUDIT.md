# API_ENDPOINT_AUDIT.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · **Routes:** 748 registered (`route:list`, verified at baseline HEAD).

## 1. Surface inventory

- REST API under `/api`, Sanctum PAT auth via `ApiTokenAuth` middleware.
- Role-scoped route groups per module: auth, customer portal, receptionist, cashier/POS, inventory, veterinary, manager, admin, reports, chatbot, live chat, payroll.
- Public surface: registration, login, email verify/resend, password forgot/reset, public product/service catalog reads (internal fields excluded — verified by `PublicCatalogPrivacyTest`).

## 2. Verification performed this revision

| Check | Method | Result |
|---|---|---|
| Route/middleware inventory | `route:list` count + audit analyzer precedent | 748 routes; middleware groups intact |
| Inactive-account denial | `ApiTokenAuth` code + security suite tests | VERIFIED (code); runtime probes in Phase 4 |
| Privileged-field injection on register | `PublicRegistrationIntegrityTest` | VERIFIED after test-payload fix (commit `172dc6ce`) — `role`/`is_active`/`employee_no` injection ignored |
| Public catalog privacy | `PublicCatalogPrivacyTest` | PASSED in suite |
| Barcode lookup safety | `BarcodeLookupTest` (updated for auto-EAN13) | PASSED |
| UOM write path | `InventoryUnitOfMeasureTest` (9 tests) | PASSED |
| Role×module matrix | Prior Phase 13 matrix (784 probes, 0 violations) | HISTORICAL — spot re-verification in Phase 4 |

## 3. Changed endpoints this revision

- `POST /api/inventory/stock-in`, `POST /api/inventory/stock-out`: now accept optional `unit` (`piece|pack|box`) + quantity; server converts to base units via `pack_size`/`box_size` before `InventoryService` mutation. Validation rejects unknown units and non-positive converted quantities.
- `POST /api/inventory/items` (add product): accepts `pack_size`, `box_size`, `unit_options`; auto-generates EAN-13 barcode for sellable items lacking one.
- `GET /api/products/barcode/{code}`: unchanged contract; now resolves auto-generated codes too.

## 4. Notable non-changes / accepted gaps

- Unrouted legacy payroll `update`/`processPayment` remain dead code (C-01, ACCEPTED_GAP).
- PAT tokens: no TTL/rotation endpoint — deployment-hardening gap (C-02, ACCEPTED_GAP).
- No endpoint accepts client-computed prices/totals anywhere in POS/checkout paths (server-authoritative confirmed).
