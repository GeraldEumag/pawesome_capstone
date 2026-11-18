# Reports Module — Architecture Map

**Date:** 2026-11-18
**Companion to:** `REPORTS_MODULE_AUDIT.md`

## 1. Frontend → Backend flow

```
Report page (React)
  → apiRequest(path)                frontend/src/api/client.js  (Bearer Sanctum token)
  → Laravel routes/api.php          auth.api → throttle → role:<roles>
  → Controller method
  → DB::table()/Eloquent + Schema::hasColumn guards (schema-tolerant queries)
  → JSON { success, data{summary, rows, charts}, summary, filters, generated_at }
  → Page normalizes response.data | response.data.data | array
  → StandardReportLayout / StandardSummaryCards / StandardTable / charts
  → export utils (CSV/Excel/PDF/print)
```

All report routes sit under `Route::middleware(['auth.api','throttle:api','role:…'])` groups.
Admin is the all-access staff role (reaches every staff report); customer reports are a
separate `role:customer` surface and admin is denied there by design.

## 2. Endpoint → controller → table map (canonical admin set)

| Endpoint | Controller@method | Source tables |
| --- | --- | --- |
| `GET /admin/reports/summary` | `ReportsController@summary` | sales, customers, pets, appointments, services, inventory_items |
| `GET /admin/reports/overview` | `@overview` | sales + RevenueService legs (orders, service_requests, boardings, confinements, appointments, groomings, payment_settlements), inventory_items |
| `GET /admin/reports/sales` | `@sales` | sales, payments (via sale_id), users (cashier) |
| `GET /admin/reports/cashier` | `@cashier` | sales, customer_orders, boardings, medical_confinements, payment_settlements |
| `GET /admin/reports/inventory` | `@inventory` | inventory_items, inventory_logs, inventory_batches |
| `GET /admin/reports/manager` | `@manager` | users, employees, payrolls, attendance |
| `GET /admin/reports/manager-attendance` | `@managerAttendance` | attendance + users/employees |
| `GET /admin/reports/payroll` | `@managerPayroll` | PayrollComputationService → payrolls, attendance |
| `GET /admin/reports/veterinary` | `@veterinary` | appointments, medical_confinements, medical_progress_notes, services |
| `GET /admin/reports/customers` | `CustomerReportController@getCustomerReports` | customers, customer_orders, sales, payments, service_requests, pets |
| `GET /admin/reports/customers/{id}` | `…@getCustomerDetail` | same + customer_order_items |
| `GET /admin/reports/reception` | `@reception` | service_requests, appointments, boardings, customers, users |
| `GET /admin/reports/payments` | `@payments` | payments, customer_orders, boardings, medical_confinements, service_requests, payment_settlements |
| `GET /admin/reports/orders` | `@orders` | customer_orders + sales (merged unified order list) |
| `GET /admin/reports/services` | `@serviceRequests` | service_requests, groomings, appointments, boardings, medical_confinements |
| `GET /admin/reports/logistics` | `@logistics` | boardings, boarding_rooms, boarding_room_reservations, inventory movement |
| `GET /admin/reports/executive` | `@executiveOverview` | RevenueService + customers + inventory low-stock |
| `GET /admin/reports/predictive` | `@predictiveAnalytics` | sales/orders/service history → forecastSeries (least-squares + weekday seasonality) |
| `GET /admin/reports/customers/segments` | `@customerSegmentation` | customers + customer_orders (paid spend) |
| `GET /admin/reports/comparison` | `@comparativeReporting` | RevenueService legs per period |
| `GET /admin/reports/sales-analysis` | `@salesAnalysis` | sales (hourly/category), RevenueService breakdown |
| `GET /admin/reports/staff-performance` | `@staffPerformance` | users + sales(staff_id/cashier_id), attendance |
| `GET /admin/reports/inventory-optimization` | `@inventoryOptimization` | inventory_items, batches, usage logs, reorder levels |
| `GET/POST/DELETE /admin/reports/alerts[/{id}]` | `@automatedAlerts/@createAlert/@deleteAlert` | report_alerts + threshold evaluation |
| `GET /admin/reports/customers/export` | `CustomerReportController@exportCustomerReports` | CSV stream, formula-prefix sanitized |

Role-scoped equivalents exist for manager (`/manager/reports/*`, WorkflowReportController),
cashier (`/cashier/*`, DashboardController), receptionist, inventory, veterinary,
and customer (`/customer/reports/*`, own-records only). 88 report routes total.

## 3. Canonical revenue model (`App\Services\RevenueService`)

```
revenue = POS sales
          + paid customer_orders
          + paid service_requests   (deduped: excluded when a linked boarding/
                                     grooming/appointment carries the money)
          + paid boardings
          + paid medical_confinements  COALESCE(final_amount, estimated_cost, total_amount)
          + paid appointments          COALESCE(total_amount, price)
          + paid groomings             COALESCE(total_amount, amount, price)
          + partial payment_settlements (deduped vs fully-paid parents)

eligible sale = type  NOT IN (refund, multi_payment, appointment)
             AND status NOT IN (voided, cancelled)

paid = payment_status IN (paid, verified, completed)
```

`type='appointment'` sale rows are legacy duplicates of appointment billing —
excluded to prevent double counting. `multi_payment` rows are settlement
containers, not revenue. Date filtering is inclusive `whereDate(from..to)`.

## 4. Shared frontend primitives

- `UnifiedReportEngine.jsx` — generic engine: filters → filteredData →
  table/chart/export (exports now use `filteredData`, matching the visible set).
- `AdminLiveReport.jsx` — 8 admin live-report pages; DatePickerInput pair +
  status select + search, params sent to API + client-side second layer.
- `StandardReportLayout` — header, `lastUpdated`, print support, error boundary.
- `StandardSummaryCards`, `StandardTable`, `ReportFilters`, `ReportSkeleton`,
  `ReportErrorBoundary`.
- `utils/reportExport.js` (CSV sanitize + export), `formalReportPdf.js`,
  `advancedReportExport.js`.
- `hooks/useReportData.js` — **removed** (was dead code with a 5-min stale cache).

## 5. Data-flow per report family

| Family | Flow highlights |
| --- | --- |
| Sales/POS | `sales` + `payments` (sale_id). Voided/cancelled excluded from revenue but still listed as rows. |
| Orders | Merged list: `customer_orders` (portal/historical) + `sales` (POS walk-in). Store checkout API currently returns 410 (disabled workflow) — report covers historical + POS records. |
| Services | Unified service ledger across 5 tables with linked-record dedup (service_request → boarding/grooming/appointment). |
| Payments | Cross-source payment status ledger: orders, boardings, confinements, settlements; counts computed full-set (never from capped row slices). |
| Customers | Per-customer 360: orders (matched via `customers.user_id → customer_orders.customer_id = users.id`), POS payments (matched via `sales.customer_id = customers.id`), service requests, pets. Two different customer keyspaces — see §6. |
| Inventory | Items + batches + logs; low-stock = `lowStockCount()` canonical (active, stock ≤ reorder level, archived excluded). Stock increases only via batch receiving (adjust-stock remove/set only). |
| Staff/Payroll | manager/admin-only; payroll via `PayrollComputationService`; attendance via `attendance` rows. |
| Advanced | executive (KPI cards + revenue mix), predictive (forecast model), segmentation (RFM-lite on paid spend), comparison (period-over-period per revenue leg), sales-analysis (hourly bands, category), staff-performance, inventory-optimization, alerts CRUD + thresholds. |

## 6. Schema relationships that matter

- `sales.customer_id → customers.id` (POS attribution).
- `customer_orders.customer_id → users.id` (portal attribution — NOT customers.id).
- `payments.sale_id → sales.id` (payments has no customer/order FK).
- `pets.customer_id → customers.id`.
- Linked service chain: `service_requests.id` referenced by `boardings`/`groomings`/`appointments` — money follows the linked row, dedup the parent request.
- `boardings.room_id → boarding_rooms.id`; `boarding_room_reservations` tracks occupancy.
- Enums that gate calculations: `sales.type` (`appointment`,`boarding`,`product`), `sales.status` (`pending`,`completed`,`cancelled`,`refunded`), `boardings.payment_status` (`unpaid`,`pending`,`partial`,`paid`,`rejected`,`refunded`).

## 7. Response contract

```json
{ "success": true,
  "summary": { "<KPIs>" },              // top-level on most endpoints
  "data": { "summary": {}, "<rows>": [], "trend": [], "generated_at": "" },
  "filters": { ... },                    // echoed applied filters
  "message": null }
```

Frontend normalization accepts `response.data`, `response.data.data`, or bare
arrays; summary cards read `summary` then `data.summary` fallback.
422 shape: `{ "success": false, "message": "...", "errors": {...} }`.
