# Currency Formatting Inventory

**Date:** 2026-11-17

## Canonical formatter

`frontend/src/utils/currency.js` — `formatCurrency(value, options?)`: Intl `en-PH`/`PHP`, 2 decimals default, null/undefined/NaN-safe → `₱0.00`, option sanitization. **64 source files, 346 call sites.**

## Files remediated this phase (~40)

| File | Defect fixed |
| --- | --- |
| `veterinary/VetAppointmentBilling.jsx` | 3× `PHP {x.toFixed(2)}` → `formatCurrency` |
| `veterinary/VetEditAppointment.jsx` | local ₱ formatter → shared |
| `shared/catalog/ServiceCatalogManager.jsx` | local ₱ formatter → shared |
| `shared/ServiceBillingPanel.jsx` | `toMoney()` + inline ₱ → shared |
| `shared/ServiceBillingCashierPanel.jsx` | 11× inline `₱{x.toFixed(2)}` → shared |
| `shared/PaymentUploadModal.jsx` | inline toLocaleString → shared |
| `shared/UnifiedReportEngine.jsx` | manual `₱`+regex-commas → shared |
| `utils/reportExport.js` | `formatCurrencyForExport` delegates to shared |
| `utils/apiNormalize.js` | duplicate formatter consolidated |
| `admin/reports/{ComparativeReporting,InventoryOptimization,PredictiveAnalytics,SalesAnalysis}.jsx` | 4× local ₱ formatters → shared |
| `admin/reports/AutomatedAlerts.jsx` | `'₱' + toLocaleString()` → shared |
| `cashier/CashierPaymentVerification.jsx` | confirm dialog + stat/amount cells → shared |
| `cashier/components/PaymentApprovals.jsx` | local `fmt` + `₱{fmt(x)}` (12 sites) + bare `₱{amount}` → shared |
| `cashier/hooks/usePaymentApprovals.jsx` | confirm dialog message → shared |
| `chatbot/RoleAwareChatbot.jsx` | 3× raw `₱{room.daily_rate}` → shared |
| `customers/{GroomingForm,VetForm,HotelForm,CustomerBookingsBoard,CustomerPayments}.jsx` | inline toFixed/locals → shared |
| `inventory/{UnifiedInventory,BarcodeGenerator,InventoryDashboard}.jsx` | inline sites incl. `₱ ` spacing defect → shared |
| `landing/ServiceBookingModal.jsx` | `₱{rate.toLocaleString()}` → shared |
| `receptionist/{ReceptionistApprovals,modals/WalkInBookingModal}.jsx` | inline sites + raw `₱{price}`/`₱{daily_rate}` → shared |
| `manager/{PayrollManagement,PayrollComputation}.jsx`, `shared/MyPayroll.jsx` | payroll screens canonicalized (prior phase) |
| `manager/{GovernmentRemittanceReports,SalaryLoanManagement,ThirteenthMonthPanel}.jsx` | 3× local Intl `PHP` helpers → `formatCurrency` delegation |
| `inventory/{MonthlyAuditReport,MonthlyInventoryAudit}.jsx` | local `currency` Intl helpers → shared |
| `receptionist/{ReceptionistBookings,ReceptionistWalkIns}.jsx` | local Intl formatters → shared |
| `receptionist/utils/requestNormalization.js` | exported `formatCurrency` → re-exports shared (callers unchanged) |
| `admin/CustomerReport.jsx` | in-component Intl def → shared |
| `utils/advancedReportExport.js` | `executiveCurrency` Intl → shared |

## Intentional exceptions retained

`receiptPdf.js` (`PHP x`), `formalReportPdf.js` (`₱`→`PHP `), `escpos.js` (`₱`→`P`), chart `₱Nk` axes, POS denomination buttons/numpad echo, `(₱)` labels and `prefix="₱"` inputs, Excel `"₱"#,##0.00` cell format.
