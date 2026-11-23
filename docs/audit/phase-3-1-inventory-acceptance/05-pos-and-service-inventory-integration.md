# POS and Service Inventory Integration

## POS

**Partial pass.** The cashier workflow test first failed because it omitted the now-required `Idempotency-Key`; the API rejected the request before creating a sale. The E2E helper was updated to send a unique key per candidate sale and rerun.

- `frontend/e2e/cashier-inventory-workflow.spec.js`: **1 passed** (1.5 minutes).
- The test authenticated a cashier, rendered the POS page, created a product sale through the isolated API, and checked sale/stock movement/report evidence.
- No POS controller, price, VAT calculation, receipt label, or Phase 2 source code was changed.
- This did not exercise the full cashier cart/payment UI; direct API sale plus browser page rendering is not equivalent to a complete checkout interaction.

## Grooming and boarding

**API integration pass with an atomicity fix.**

- A receptionist submitted a valid consumable followed by a non-consumable to grooming. Before the fix, the endpoint returned HTTP 422 but persisted the first line: stock fell from 5 to 4, one usage and one `grooming_usage` movement were recorded. This was a confirmed partial-commit defect.
- Grooming and boarding services now roll back all line effects when any submitted line fails validation and return no processed usages.
- After the fix, mixed-line requests for both services returned HTTP 422; all four fixture item balances remained 5, with no usage or service movement for the rejected request.
- Valid-only grooming and boarding requests returned HTTP 200, created one usage/movement each, and changed stock from 5 to 4.
- `ServiceInventoryUsageAtomicityTest`: **2 passed, 18 assertions** in the isolated backend test database.

## Limitations

- Grooming/boarding were verified through authenticated API requests and database checks, not a full UI consumption form.
- Veterinary inventory consumption was source-traced but not exercised in a fresh end-to-end workflow.
- A repeated service usage request remains a separate business/idempotency question; no new deduplication policy was invented.
