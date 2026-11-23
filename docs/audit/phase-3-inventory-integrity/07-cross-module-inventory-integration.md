# Cross-Module Inventory Integration Audit

## POS

Phase 2 remains preserved. POS uses `InventoryService::deductStock()` inside the sale transaction, trusts server-side item identity/prices, uses mandatory idempotency, and serializes stock updates. The Phase 3 backend regression bundle included `PosFinancialIntegrityTest` and `PosConcurrentStockTest`; price/quantity/rollback/idempotency cases passed, as did the two-request last-unit test. `PaymentReceiptOutboxTest` also passed, preserving receipt workflows. X-15 VAT-inclusive labels/calculations were not modified.

## Veterinary, grooming, boarding

Source trace found `VeterinaryInventoryService`, `GroomingInventoryService`, and `BoardingInventoryService` delegating stock deduction to `InventoryService`; the services persist usage links and batch deductions where applicable. This supports a shared mutation architecture, but Phase 3 did not rerun a dedicated service-consumption browser workflow. The integration behavior is therefore **SOURCE-TRACED / PARTIALLY VERIFIED**, not newly browser-accepted.

## Reports and alerts

Inventory APIs expose stock summary, low/out-of-stock, movement history, monthly audit, and reports. The focused backend regression bundle included inventory dashboard/report response and reconciliation tests. Those checks do not establish every report formula/date boundary or cross-module report reconciliation.

## Scope notes

- Customer self-service product checkout remains intentionally disabled.
- No POS or service workflow was changed in Phase 3.
- No supplier purchase-order accounting, provider/device, scanner hardware, or printer integration was newly added.
- Browser verification of inventory-to-POS/service propagation was **NOT RUN** in this Phase 3 pass. Existing historical browser evidence is cited separately and is not presented as a fresh run.
