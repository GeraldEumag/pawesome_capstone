# Currency Audit Baseline — Pawesome

**Date:** 2026-11-17 · **Scope:** Full repository (frontend React, backend Laravel, DB/API surface, exports, PDFs, emails, tests)

## Standard

| Property | Value |
| --- | --- |
| Currency code | PHP |
| Symbol | ₱ (U+20B1) |
| Locale | en-PH |
| Format | `₱1,250.00` (Intl en-PH/PHP, 2 decimals, thousands separators) |
| Canonical formatter | `frontend/src/utils/currency.js` → `formatCurrency(value, options?)` |

## Method

- Grepped `frontend/src` and `backend/` for: `$` literals, `USD`, `US$`, `currency: 'USD'`, `Intl.NumberFormat`, `toLocaleString`, `toFixed`, `number_format`, `NumberFormatter`, hardcoded currency symbols, price helpers.
- Verified runtime rendering: `Intl.NumberFormat("en-PH", {style:"currency", currency:"PHP"})` in Node/V8 (same engine as Chromium) renders `₱` — including `-₱500.00` and `₱1,234,567.89`.
- Enumerated every money display site and classified each as: already-canonical / defect / intentional exception.

## Baseline Findings

| Category | Count |
| --- | --- |
| USD / `$` money formatting in source | **0** |
| `PHP {amount}` text displays (wrong presentation) | **3 sites**, 1 file (`VetAppointmentBilling.jsx`) |
| Inline `₱{x.toFixed(2)}` (no thousands separators) | ~30 sites |
| Local/duplicate peso formatters | 12 files |
| `₱{x.toLocaleString()}` without decimals / raw `₱{var}` values | ~15 sites |
| Intentional exceptions (kept) | 7 categories |

### Intentional exceptions (documented, not defects)

1. `utils/receiptPdf.js` — `PHP 1,250.00` text: jsPDF built-in Helvetica lacks the ₱ glyph; deterministic ASCII-safe code is correct for PDF output.
2. `utils/formalReportPdf.js` — replaces `₱` → `PHP ` for the same font reason.
3. `utils/escpos.js` — strips `₱` → `P`: thermal printer code pages lack ₱/ñ.
4. Chart axes `₱${v/1000}k` — compact tick labels, correct symbol.
5. POS bill-preset buttons (`₱{a.toLocaleString()}`, `₱{b.toLocaleString()}`) and numpad echo — denomination buttons/typing echo, intentionally integer.
6. `(₱)` field labels, `prefix="₱"` NumberInputs, `Revenue Drop (₱)` option — labels, not values.
7. `reportExport.js` Excel format `"₱"#,##0.00` — correct native Excel currency format.

## Baseline DB/API state

- No monetary schema changes needed; all money columns are numeric decimals.
- `pawesome` dev DB: 1 payroll row (₱16,000 gross/net) — untouched.
- No currency conversion exists anywhere in the codebase — none was added.
