# Security, Regression, and Test Results

## Security and authorization

- Mutation guard/write-probe suite: **9 passed**.
- Phase 12.3 workflow/authorization/tampering/concurrency suite: **3 passed**.
- Stock movement browser suite: **10 passed**, including cashier route denial and inventory-role approval denial.
- Product creation was performed as inventory role; barcode lookup returned the created product.
- The Phase 12 suite covered unauthorized customer/cashier/manager inventory operations, malformed/tampered inputs, duplicates, and insufficient stock. These are isolated-database results, not production authorization certification.

## Backend

- Focused inventory/POS/receipt/service regression bundle: **122 passed, 631 assertions**, running serially with `DB_DATABASE=pawesome_phase3_1_backend_audit`.
- `InventoryConcurrentReturnTest`: **1 passed, 9 assertions**, on the same isolated backend test database.
- A full backend suite and vaccination-card regression suite were not run in this pass.

## Frontend and build

- `npm run test:unit -- --run`: **15 files passed, 75 tests passed**.
- `npm run build`: passed; Vite emitted existing mixed-import and large-chunk warnings.
- Product/barcode browser spec: **1 passed**.
- Stock movement browser spec: **10 passed**.
- Cashier POS integration browser spec: **1 passed**.

## Changes and safety

- No database migration was added.
- The new backend test ran on a separately created, migrated database `pawesome_phase3_1_backend_audit`; the browser stack ran on `pawesome_phase3_1_browser_audit`.
- No development or production database was targeted.
- Combined backend runs: **123 passed, 640 assertions**.
