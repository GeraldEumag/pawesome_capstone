# Browser Stock-In, Stock-Out, and Adjustment Workflows

## Result

**PASS for the tested workflows.** Not a complete product-search, alert, and report acceptance.

## Evidence

- Playwright Chromium, inventory role; API/frontend directed at the Phase 3.1 isolated stack.
- `frontend/e2e/stock-movement.spec.js`: **10 passed** in 1.4 minutes.
- The suite passed browser/API/database checks for stock-in, immediate stock-out, sensitive stock-out approval, manager rejection, return restock, quarantine/release, reversal, cashier access denial, idempotent stock-in replay, and inventory-role approval denial.
- The sensitive stock-out approval/rejection workflow is not a substitute for the full manual stock-adjustment boundary matrix.
- The suite's database guard passed on each test. Test output: `frontend/test-results/phase3-1-stock/`.

## Authorization and persistence

- Inventory actions were attributed to the authenticated actor in the movement records.
- Approval/rejection behavior was exercised with inventory and manager roles.
- Cashier could not open the stock-out route; inventory could not call the manager approval endpoint.
- Failed/rejected operations did not apply the stock deduction asserted by the suite.

## Limitations

- This run did not exhaustively test all quantity boundary values, duplicate UI clicks, search/filter combinations, pagination, low-stock alert transitions, or date-filtered reporting.
- Valid manual quantity adjustment, missing adjustment reason, invalid adjustment quantity, and duplicate adjustment submission were not freshly tested through the browser.
- The reconciliation CLI was run separately in dry-run mode; see report 08. No `--apply` repair was run.
