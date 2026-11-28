# 10 — Frontend Audit

## Data-source verification (spot-checked)

- Inventory module: 43 components; 23 import `api/inventory.jsx` /
  `apiRequest` directly, the rest are presentational primitives
  (modals, badges, tables, charts). No static/mock dataset found in
  `src/components/inventory/*` or `src/components/cashier/*` — reports,
  dashboards, stock pages, and history all fetch server data.
- Cashier POS: cart math is display-only; authoritative totals/VAT come
  from the server `breakdown` payload (`ReceiptBreakdown::forSettleable`)
  rendered by `ReceiptDocument.jsx`. `TAX_RATE = 0.12` in `CashierPOS.jsx`
  is used **only** for the live estimate `subtotal * rate / (1+rate)`
  (VAT-inclusive, correct) and is never sent as authoritative.
- `CashierDashboard.jsx` has an unused `taxRate` state (dead state,
  harmless — P3 cleanup note).
- `api/pos.js::generateReceipt()` is dead code (no callers); VAT math
  corrected anyway (see `05_POS_AND_VAT_AUDIT.md`).

## States & UX conventions

- Shared primitives used per AGENTS.md: `Modal`, `StatusBadge`,
  `DatePickerInput`, `StandardTable`, `ReportFilters`,
  `DeleteConfirmModal`, `RowActionPopover`, `showAlert/showConfirm` —
  verified in inventory/cashier components (StockOutPage uses the shared
  modal + confirm dialog for submit).
- Loading/empty/error states present on data pages (e.g., StockOutPage
  `sm-empty-lines`, approval-queue empty states).
- Filters/pagination: server-side on list endpoints; tables use
  `StandardTable` conventions.

## Styling conventions

- Pink design tokens from `theme.css`; module prefixes (`sm-*`,
  `pw-*`) — no new bare generic classes introduced by this audit
  (no frontend component files were modified except `api/pos.js` math).

## Defects fixed

| ID | Severity | Defect | Fix |
| --- | --- | --- | --- |
| FE-01 | P3 | `api/pos.js::generateReceipt()` exclusive VAT math + VAT-on-top total (dead code trap) | inclusive extraction; `total = subtotal - discount` |

## Verdict

**PASS** — no hardcoded/mock business data found on audited surfaces;
server remains authoritative for money, stock, and availability.
