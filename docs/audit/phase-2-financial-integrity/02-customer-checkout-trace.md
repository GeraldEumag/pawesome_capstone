# Customer Checkout Trace

## Scope finding

Customer self-service product ordering is intentionally disabled. The API route remains under the authenticated customer route group:

- `backend/routes/api.php:352-357` — history/read routes plus `POST store/checkout`, `POST store/orders/{id}/payment-proof`, and receipt/history routes.
- `backend/app/Http/Controllers/Customer/CustomerStoreController.php:12-29` — checkout returns HTTP 410.
- `backend/app/Http/Controllers/Customer/CustomerStoreController.php:148-151,218-221` — payment-proof upload and cancellation also return HTTP 410.
- `backend/tests/Feature/CustomerOrderingDescopeTest.php:11-19,36-57,105-114` — documents the descope and asserts disabled writes create no order.

The prompt's requested “valid customer checkout” cannot be implemented or tested without reversing the established F-02 scope decision. Phase 2 did not restore that workflow.

## Read-only historical path

`CustomerStoreController::orders`, `show`, and `receipt` retain access to prior `customer_orders` / `customer_order_items` records. Receipt access checks the authenticated user and paid status, then builds VAT/payment data from persisted order values and `PaymentSettlement`.

Fixed a historical receipt bug: the `ReceiptBreakdown::forSettleable` call and its fallback payment now receive `$totalAmount`, the persisted order total, rather than undefined `$orderTotal` (`CustomerStoreController.php`, receipt method).

## Related live customer payment path

Veterinary service billing is not product checkout. `POST /customer/billing/veterinary/{id}/online-payment` accepts GCash/Maya proof, creates a pending payment request, and tells the customer that cashier verification is required (`backend/app/Http/Controllers/Customer/VeterinaryBillingController.php:80-85,98-160`). It does not establish automated provider confirmation. Cashier verification is routed through cashier-only endpoints.

## Test status

- Existing descope test: `CustomerOrderingDescopeTest` **PASS** on the disposable test database; disabled writes remain HTTP 410.
- New historical receipt regression test: `CustomerHistoricalReceiptIntegrityTest::test_paid_historical_order_receipt_uses_persisted_total_for_breakdown` **PASS**.
- Valid customer-store checkout: **NOT APPLICABLE/BLOCKED** by the preserved product scope.
