# Currency Playwright Evidence

**Date:** 2026-11-17 · **Stack:** frontend `:3001`, backend `:8001`, DB `pawesome_e2e_audit` (isolated)

Spec: `frontend/e2e/currency-standardization.spec.js` — each test renders the screen, asserts the DOM contains no `$/USD/US$ + digit` money patterns, then screenshots.

| # | Screen | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Admin dashboard (`/admin`) | pass | `01-admin-dashboard.png` |
| 2 | Manager payroll (`/manager/payroll`) | pass — ₱88,930.74 / ₱13,665.00 / ₱17,100.00 visible | `02-manager-payroll.png` |
| 3 | Cashier My Payroll (`/cashier/payroll`) | pass | `03-cashier-my-payroll.png` |
| 4 | Cashier payment verification (`/cashier/payment-verification`) | pass | `04-cashier-payment-verification.png` |
| 5 | Cashier POS (`/cashier/pos`) | pass — ₱0 totals render | `05-cashier-pos.png` |
| 6 | Customer payments (`/customer/payments`) | pass | `06-customer-payments.png` |
| 7 | Admin reports (`/admin/reports`) | pass | `07-admin-reports.png` |

**7/7 passed (41.3s).** Evidence dir: `browser-evidence/currency-standardization/`.

Not captured: a generated PDF document (receiptPdf is a client download — its `PHP x` output is a documented font exception) and the thermal-print path (hardware-dependent, `₱`→`P` documented).
