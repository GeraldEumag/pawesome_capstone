# Pricing and Calculation Findings

## Findings

| Severity | Evidence / root cause | Action and status |
|---|---|---|
| PASS | POS product price resolves from active, unarchived, sellable `inventory_items`; request `unit_price`, subtotal, tax, discount and total are not used in persisted calculations. | Kept server-authoritative behavior; removed the unnecessary requirement that client send `unit_price` or `item_name`. |
| P1 / fixed | POS service lookup used `Service::find()` and accepted a deactivated service even though the catalog lists active services only. | Server now requires active service under row lock; feature regression test added. |
| P2 / fixed | Sale items and POS receipt-email payload persisted the client's `item_name`, allowing product/service mislabeling at the database/receipt layer. | Names now come from the same server-resolved product/service records used for pricing. |
| P2 / fixed | POS receipt UI fell back to request/cart totals and item data if an API receipt field was missing. | The UI now validates authoritative server receipt values and keeps the cart/key if the response is incomplete; a unit test covers this behavior. |
| PASS | Gross item totals are VAT-inclusive; `tax_amount = round(gross × 0.12 / 1.12, 2)` and total remains gross. | Existing business calculation preserved; line and subtotal values are rounded to two decimals. |
| POLICY ITEM | No server discount engine is used by POS; client discount amounts are ignored. A legacy `apply-discount` endpoint contains example codes but is not a verified POS discount policy. | No discount policy invented. Discount eligibility/amount policy requires owner approval. |

## Authority map

- Product: `InventoryItem.price`; row must be active, not archived, `is_sellable`, and have enough stock.
- Service: `Service.price`; row must be active and not soft-deleted.
- Quantity: positive integer; product quantity is additionally bounded by locked current stock. No arbitrary service-quantity cap was introduced.
- Discount: no client-authoritative discount is applied; sale/item discount remains zero absent an approved server policy.
- Subtotal / VAT / total: calculated in `Cashier\POSController`; customer product checkout is disabled, not an alternate calculation path.
- Payment: POS `Payment.amount` is created from backend `totalAmount`; cash received only determines eligibility/change.

## Test status

- Added product price/name/discount/totals adversarial test and active/inactive service tests: **PASS** in the 48-test focused backend run.
- X-15 receipt-label tests: **PASS** in the 73-test frontend suite; email rendering expectations also pass in the backend email suite.
