# Inventory Reconciliation Results

## Result

**Dry-run only; no repairs applied.**

- Ran `php artisan inventory:reconcile-stock --no-ansi` with `APP_ENV=testing` and `DB_DATABASE=pawesome_phase3_1_browser_audit`.
- The command reported **14 planned actions**, all creating `RECON` batches for isolated E2E/service fixtures whose current stock was not batch-tracked.
- No `--apply` flag was used. No batch or stock data was repaired or rewritten.
- Browser stock movement and POS tests asserted their own persisted balance and movement behavior; service tests asserted item balances, usage rows, and movement rows.

## Interpretation and limits

- These planned batches are test-fixture reconciliation gaps, not evidence of a production discrepancy.
- The isolated audit database contains intentionally seeded and generated fixtures. It is not a production-history reconciliation.
- The dry-run did not report or repair missing historical actors. The 12 pre-existing actor-less movements noted by Phase 3 remain preserved and cannot be reconstructed from this test.
- Full cross-ledger reconciliation of all POS/service/return source references and historical records remains open.
