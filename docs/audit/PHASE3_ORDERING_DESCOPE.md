# Phase 3 — Customer Ordering Descope (F-02)

## Original finding

F-02: the customer store/cart UI was never built, and the ordering
endpoints already returned HTTP 410 — but ~700 lines of unreachable
"dead-but-present" workflow code remained behind the early-`return 410`
guards, plus an unrouted frontend component advertising Approve/Reject/
Cancel actions, and docs that left final scope "to be confirmed".

Approved decision (Phase-0 review): **descope, do not rebuild.**

## Dependency review — what references `customer_orders`

| Asset | Status | Action |
|---|---|---|
| `customer_orders` / `customer_order_items` tables + `CustomerOrder`/`CustomerOrderItem` models | Referenced by `RevenueService`, `PaymentVerificationService`, `PaymentReferenceGuard`, cashier receipts, `PortalController::transactions`, admin/manager/receptionist reports, chatbot context — **live reads + financial evidence** | **KEPT — untouched** |
| `CustomerStoreController::orders` `show` `receipt` | Live read endpoints — `CustomerHistory`/`CustomerPayments` call them | **KEPT** |
| `CustomerStoreController::checkout` `uploadPaymentProof` `cancel` | 410 stubs with ~350 lines unreachable code | Bodies stripped to the 410 return; routes kept (explicit "retired" semantics beats 404) |
| Helpers `generateOrderNumber`/`generateReferenceNumber`/`setIfColumnExists` | Only used by dead checkout body | Removed with it |
| `ReceptionistCustomerOrderController::index` `approvalHistory` `show` | Routed, live reads (`ReceptionistHistory` consumes `index`) | **KEPT** |
| `...::pending` `approve` `reject` `cancel` | Never routed — all four mutation routes point at `workflowDisabled` | Methods + unused imports deleted |
| `frontend/.../ReceptionistCustomerOrders.jsx` + `.css` | **Not imported/routed anywhere**; contained Approve/Reject/Cancel UI against 410 endpoints | **Deleted** |
| `CustomerHistory.jsx` / `CustomerPayments.jsx` | Read-only `store/orders` + `receipt` consumers | **KEPT** |
| `OrderReports.jsx` (admin) + `ReportsController::orders` + cashier `customer-order-receipts/{id}` | Live reporting/receipt over historical orders | **KEPT** |
| Customer store/cart UI | **Does not exist** — verified: no Shop/Cart/Checkout component, no nav link | — |

## Files changed

- `backend/app/Http/Controllers/Customer/CustomerStoreController.php` —
  dead bodies + helpers + unused imports removed (682 → 223 lines);
  `orders`/`show`/`receipt` and the three 410 stubs preserved.
- `backend/app/Http/Controllers/Receptionist/CustomerOrderController.php`
  — `pending`/`approve`/`reject`/`cancel` (~430 dead lines) + unused
  imports removed (599 → 168 lines); `workflowDisabled`/`index`/
  `approvalHistory`/`show` preserved.
- `frontend/src/components/receptionist/ReceptionistCustomerOrders.jsx` —
  **deleted** (unrouted dead component).
- `frontend/src/components/receptionist/ReceptionistCustomerOrders.css` —
  **deleted**.
- `frontend/src/components/shared/ProfileSettings.jsx` — removed unused
  `faStore`/`faShoppingCart` icon imports (ordering-icon residue).
- `frontend/src/components/shared/inventorySync.js` — stale
  `CustomerStore` consumer references corrected (CashierPOS remains).
- `docs/user-manual/PAWESOME_USER_MANUAL.md` — §4.5 + §1 notice:
  "currently unavailable / confirm scope" → **"OUT OF SCOPE (approved
  descope)"**; documents that history/receipts remain readable.
- `backend/tests/Feature/CustomerOrderingDescopeTest.php` — **new**,
  9 tests / 19 assertions.

## Routes — unchanged

All `store/*` and `customer-orders/*` routes keep working exactly as
before: mutations answer **410 Gone** with
`"Customer store order workflows are disabled."`, reads return data. A
stale client gets an explicit, meaningful answer — better than 404
ambiguity.

## Tests executed

| Command | Result |
|---|---|
| `php artisan test --filter=CustomerOrderingDescopeTest` | **9/9 — 19 assertions** (410s, preserved reads, table/model preservation, no-order-created) |
| `npx vitest run` | **32/32** |
| `npm run build` | clean |
| `php artisan test` (full suite) | **976 passed / 1 skipped / 0 failed / 4,874 assertions** (~258 s) |

DB: `pawesome_test` only (`phpunit.xml`-pinned, runtime-verified).

## Remaining risks

- `orderWorkflowsDisabled()` 410s could eventually become 404 if the team
  later prefers route removal — a future one-line decision, not a defect.
- Dead `customer_orders` write paths elsewhere? Verified none: the only
  writers were the removed checkout/cancel bodies; POS writes `sales`
  tables, not `customer_orders`.
- Manuscript (.docx) scope text still says ordering may be pending —
  binary doc; aligned wording is Phase 6 work.

## Rollback

All removals are git-recoverable (`git show 8609acc~:<path>`); nothing
below the 410 guards was reachable, so behavior is unchanged.
