# Return and Concurrency Workflows

## Result

**PARTIAL PASS.** Return dispositions, same-key backend replay, and source-linked return concurrency passed; uncertain browser retry is not freshly accepted here.

## Evidence

- In the 10-test stock movement browser suite, return intake/review/restock increased stock once; quarantine held stock out until release, which restored stock once.
- The Phase 12.3 inventory suite passed **3 tests** for lifecycle, authorization/tampering/duplicates/insufficient stock, and concurrent stock movements. It ran on the isolated browser audit database.
- The isolated backend regression `InventoryConcurrentReturnTest` was rerun: **1 passed, 9 assertions**. Two concurrent requests for the remaining sold quantity did not over-return.
- `StockMovementTest` also passed its same-idempotency-key return replay case as part of the 122-test backend bundle.

## Limitations

- The source-linked race was tested through the focused backend concurrency test, not through the browser/API worker pool in this pass.
- Same-key replay passed at the backend, but retry after an uncertain browser failure was not exercised end to end. The UI retry-key behavior is not freshly verified in a browser.
- Warranty duration, supplier-return rules, and return eligibility beyond existing source quantities remain unapproved business policy.
