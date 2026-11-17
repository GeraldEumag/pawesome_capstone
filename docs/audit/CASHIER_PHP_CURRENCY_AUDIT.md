# Cashier PHP (₱) Currency Audit

Date: 2026-11-18 · Scope: every cashier-connected frontend/backend money surface.

## 1. Canonical formatter

`frontend/src/utils/currency.js` — `formatCurrency()` uses `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })`. Unit-tested in `currency.test.js`. All live cashier surfaces (`CashierPOS`, `CashierDashboard`, `CashierTransactions`, `CashierHistory`, `CashierReports`, `PaymentApprovals`, shared receipt components, `ServiceBillingCashierPanel`, `PaymentUploadModal`) format money through it or render ₱ literals — **no hardcoded USD, `$`-prefixed amounts, or `en-US` money formatting on any live surface**.

## 2. Backend

- All storage `DECIMAL(x,2)` (see `CASHIER_DATABASE_AUDIT.md`) — no float drift.
- VAT is **inclusive 12%**: `EmailContent::vatInclusivePortion()` extracts `total × 12/112`; receipts expose `net_amount`/`vat_amount`/`vat_rate: 0.12` consistently. Verified live: ₱2,300 sale → VAT ₱246.43 (= 2300×12/112) ✓.
- Server-authoritative pricing: client-sent `unit_price=0.01` on a ₱900 product persisted at ₱900 — totals computed server-side.

## 3. Sweep results (live cashier surfaces)

| Pattern searched | Hits | Classification |
|---|---|---|
| `USD` / `dollar` / `en-US` money format | 0 | — |
| `toLocaleString("en-US")` | 1 | `CashierPaymentVerification.jsx` — **unrouted legacy file**, date-only (not money) |
| `$` literals | 0 in money context | `…${…}` template syntax only |
| Inline formatters duplicating currency.js | 0 live | `pos.js::generateReceipt` is dead code (P3, never imported) |

## 4. Sanctioned exceptions (accepted, by design)

- `escpos.js` — thermal printer charset test string `0123456789 !@#$%^…` and `P` peso glyph (ESC/POS limitation).
- `receiptPdf.js` — `PHP` text prefix where the PDF font lacks the ₱ glyph.
- Excel export number-format strings, chart `₱Nk` shorthand, `₱` input prefixes and cash denomination buttons.

## 5. Determination

## **FULLY PHP COMPLIANT**

Zero USD/`$` money rendering on any reachable cashier surface; single canonical formatter; DECIMAL persistence end-to-end.
