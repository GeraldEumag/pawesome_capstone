# Currency Standardization Implementation

**Date:** 2026-11-17

## What was done

1. **Single formatter enforced** — `frontend/src/utils/currency.js` `formatCurrency()` is the only canonical money formatter. `apiNormalize.js` had a duplicate implementation; consolidated.
2. **Defect fix** — `VetAppointmentBilling.jsx` rendered literal `PHP {amount.toFixed(2)}` for total bill, amount paid, balance due → `formatCurrency()` (₱).
3. **Mass consolidation** — ~40 files migrated from inline `₱{x.toFixed(2)}`, `₱{x.toLocaleString()}`, local `formatCurrency`/`formatPeso`/`fmt`/`toMoney`/`formatPrice` helpers to the shared formatter. Gains: thousands separators everywhere, uniform 2-decimal output, null-safe.
4. **Real defect corrected** — `PaymentApprovals.jsx` rendered discounts as `₱-500.00` (symbol before minus); `formatCurrency` produces `-₱500.00`.
5. **BarcodeGenerator** emitted `₱ 1,234.00` (stray space after symbol) → canonical.
6. **Tests added** — `src/utils/currency.test.js` (11 cases: spec matrix, null/NaN/numeric-strings, rounding, overrides).
7. **E2E spec added** — `e2e/currency-standardization.spec.js`: 7 screens, asserts no `$N`/`USD` text in rendered DOM + captures screenshots.

## What was NOT done (by design)

- No currency conversion — none exists in requirements.
- No API/schema changes — money stays numeric end-to-end.
- Exceptions kept where the glyph is unsupported (jsPDF Helvetica, thermal code pages) — deterministic `PHP`/`P` substitution is the correct engineering choice there.
- Bill-preset buttons/numpad echo keep integer `₱` display (denominations are whole pesos).
- No new components, endpoints, roles, or UI restructuring — display-only changes.
