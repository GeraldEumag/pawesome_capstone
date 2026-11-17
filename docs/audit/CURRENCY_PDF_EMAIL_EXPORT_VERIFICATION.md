# Currency PDF / Email / Export Verification

**Date:** 2026-11-17

| Surface | Mechanism | Finding |
| --- | --- | --- |
| Backend emails (payslip, receipt, notifications) | `₱` + `number_format(x, 2)` in Blade/mailables | PASS — already canonical: thousands separators, 2 decimals, ₱ |
| API payslip payload | numeric fields | PASS — correct; client formats |
| `utils/receiptPdf.js` (jsPDF) | `PHP 1,250.00` | PASS — intentional: Helvetica lacks ₱ glyph; `PHP` code is the deterministic correct form |
| `utils/formalReportPdf.js` | `₱`→`PHP ` substitution | PASS — same font limitation, documented |
| `utils/escpos.js` (thermal printer) | `₱`→`P` | PASS — hardware code-page limitation, documented |
| `utils/reportExport.js` | CSV/PDF/Excel export — `formatCurrencyForExport` now delegates to `formatCurrency` + Excel `"₱"#,##0.00` | PASS — standardized this phase |
| `UnifiedReportEngine` report tables | `format: 'currency'` → `formatCurrency` | PASS — standardized this phase |

Backend payslip/payroll PDF generation does not exist server-side (payslip print is the React `PayslipPrint` component plus the `receiptPdf`/`formalReportPdf` client libs) — verified no other PDF/email formatter paths remain uninspected.
