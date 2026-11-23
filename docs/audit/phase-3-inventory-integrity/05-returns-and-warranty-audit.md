# Returns and Warranty Audit

## Current return lifecycle

`inventory_returns` represents customer-product returns with source type/id, inventory item, integer quantity, return reason, evidence photo, status, inspection/disposition, receiving/inspection actors, and an optional linked movement. A newly recorded return is `pending_inspection`; recording it does not increase stock. Only `restock` disposition increases sellable stock and links a movement. Quarantine, damaged, and dispose dispositions do not restore stock. Terminal returns cannot be dispositioned twice. Source-linked returns validate that the item belongs to the referenced sale/order and that cumulative returns do not exceed the original quantity; all created source-linked returns count toward that limit regardless of disposition.

This is not evidence of a supplier-return or warranty-claims workflow. No warranty duration, proof standard, eligible product rule, or refund/stock disposition policy was found.

## Confirmed defect and fix

Before Phase 3, `InventoryService::createReturn()` checked cumulative source returns and inserted a return without a transaction or row lock. Two users could race on the same final returnable quantity. The operation now runs in one DB transaction and locks the relevant `inventory_items` row before validating the source and creating the return. This serializes same-item return-cap checks; notifications commit with the return.

`StockReturnsPage` previously generated a new idempotency key on every submit attempt. It now holds one key per logical creation/disposition request, reuses it for network/5xx uncertainty, and rotates it after deterministic 4xx responses that may have been cached.

## Verification

- Return lifecycle, restock movement, terminal state, quarantine/dispose behavior, and source quantity limits passed in `StockMovementTest`.
- Same-key creation replay passed and created exactly one return.
- Two independent API workers with distinct users/keys submitted a final one-unit return concurrently: responses were 201 and 422; one return of quantity 1 persisted; stock remained unchanged.
- Frontend unit test verified idempotency-key reuse after a transport failure and rotation after 422.
- These tests ran against `pawesome_phase3_inventory_audit`, MariaDB 10.4.32. The test database was separately checked after the suite; no return rows remained after subsequent isolated `RefreshDatabase` setup.

## Policy blockers

- Warranty period, proof/eligibility, covered dispositions, and refund relationship: **POLICY BLOCKED**.
- Supplier return intake, credit notes, and vendor stock reconciliation: **NOT EVIDENCED / SCOPE TO CONFIRM**.
- Customer refund is not equivalent to inventory restocking; no coupling was added.
