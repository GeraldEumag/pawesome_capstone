# Security and Authorization Findings

## POS authorization

`backend/routes/api.php` places cashier POS routes in the `auth.api`, `throttle:api`, `role:cashier` group. Direct requests therefore pass backend authentication/role checks; frontend route guards are not the enforcement boundary. Existing `AuthorizationMatrixTest` and related role tests cover non-cashier denial and passed in the focused backend run.

## Request integrity

- POS now requires `Idempotency-Key` before the controller executes.
- Same user/key/route with the same body replays its stored response; reuse with a changed body is rejected with 409.
- The request key remains scoped by authenticated user and route; an outer transaction and user-row lock serialize keyed requests.
- Client item prices, totals, VAT and labels are not persisted as authorities.
- Product eligibility, active service status, stock, payment amount and sale records are checked/calculated on the backend.
- Payment-proof submission remains distinct from cashier verification; the store proof endpoint is disabled and veterinary proof submission remains pending until authorized cashier action.

## Remaining security evidence

- Direct API role tests in `AuthorizationMatrixTest` passed against the disposable test database; no broader live API/IDOR audit was run.
- Inventory adjustment authorization is provided by inventory/admin route groups and existing tests; no inventory permissions were changed.
- Customer-owned store history/receipt access remains scoped in the existing controller; customer order mutation remains disabled.

## Status

Source review: **PASS** for route boundary and server authority. Direct API role tests in `AuthorizationMatrixTest` passed as part of the isolated focused suite. Customer ownership is covered by the historical receipt feature test; no broader live IDOR audit was run.
