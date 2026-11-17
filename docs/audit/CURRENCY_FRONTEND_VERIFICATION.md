# Currency Frontend Verification

**Date:** 2026-11-17

## Executed checks

| Check | Result |
| --- | --- |
| `vitest run src/utils/currency.test.js` | **11/11 pass** — `₱0.00`, `₱150.00`, `₱1,250.00`, `₱25,000.50`, `-₱500.00`, `₱1,234,567.89`, null/undefined/NaN/empty → `₱0.00`, numeric strings, rounding, fraction overrides |
| Full unit suite `vitest run` | **9 files / 44 tests pass** |
| `npm run build` | **PASS** in 28.33s (pre-existing chunk-size warning only) |
| Source sweep for `USD`/`US$`/`currency:'USD'` | **0 hits** in `frontend/src` |
| Residual `₱`+raw-value sweep | all remaining sites are documented exceptions (labels, axes, denominations, PDF/thermal ASCII) |
| Runtime symbol check | `en-PH`/PHP renders `₱` in V8 — deterministic |

## Screens verified in-browser (Playwright, isolated stack)

Admin dashboard · Manager payroll · Cashier my-payroll · Cashier payment verification · Cashier POS · Customer payments · Admin reports — all rendered `₱`, zero `$`-money strings in DOM (asserted programmatically per screen).
