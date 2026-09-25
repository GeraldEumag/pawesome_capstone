# Pawesome Full Workflow Playwright E2E Report

Status: **PASSED**

Started: 2026-09-25T00:39:21.390Z
Completed: 2026-09-25T00:43:09.017Z
Frontend: http://localhost:3000
Backend API: http://127.0.0.1:8000/api

## Workflow Checks

| Check | Status | Detail |
| --- | --- | --- |
| Login for customer | PASS | customer@example.com |
| Login for receptionist | PASS | receptionist@example.com |
| Login for cashier | PASS | cashier@example.com |
| Login for inventory | PASS | inventory@example.com |
| Login for veterinary | PASS | vet@example.com |
| Login for manager | PASS | manager@example.com |
| Login for admin | PASS | admin@example.com |
| Customer creates booking/request/order | PASS | service_request #140 |
| Receptionist approves or schedules | PASS | service_request #140 |
| Customer uploads payment proof | PASS | service_request #140 |
| Cashier verifies/rejects payment | PASS | verified service_request #140 |
| Inventory stock/log check | PASS | inventory item #274 |
| Veterinary appointment status update | PASS | vet appointment #7 completed via current /vet status route |
| Manager/Admin reports visibility | PASS | manager and admin overview reports loaded |

## Evidence Screenshots

| Evidence | File |
| --- | --- |
| 01-login-customer | `browser-evidence/pawesome-full-workflow/01-login-customer.png` |
| 01-login-receptionist | `browser-evidence/pawesome-full-workflow/01-login-receptionist.png` |
| 01-login-cashier | `browser-evidence/pawesome-full-workflow/01-login-cashier.png` |
| 01-login-inventory | `browser-evidence/pawesome-full-workflow/01-login-inventory.png` |
| 01-login-veterinary | `browser-evidence/pawesome-full-workflow/01-login-veterinary.png` |
| 01-login-manager | `browser-evidence/pawesome-full-workflow/01-login-manager.png` |
| 01-login-admin | `browser-evidence/pawesome-full-workflow/01-login-admin.png` |
| 02-customer-created-request | `browser-evidence/pawesome-full-workflow/02-customer-created-request.png` |
| 03-receptionist-approved-request | `browser-evidence/pawesome-full-workflow/03-receptionist-approved-request.png` |
| 04-customer-uploaded-payment-proof | `browser-evidence/pawesome-full-workflow/04-customer-uploaded-payment-proof.png` |
| 05-cashier-verified-payment | `browser-evidence/pawesome-full-workflow/05-cashier-verified-payment.png` |
| 06-inventory-stock-log-check | `browser-evidence/pawesome-full-workflow/06-inventory-stock-log-check.png` |
| 07-veterinary-status-updated | `browser-evidence/pawesome-full-workflow/07-veterinary-status-updated.png` |
| 08-manager-reports-visible | `browser-evidence/pawesome-full-workflow/08-manager-reports-visible.png` |
| 09-admin-reports-visible | `browser-evidence/pawesome-full-workflow/09-admin-reports-visible.png` |

## Created Records

```json
{
  "petId": 90,
  "serviceRequestId": 140,
  "vetAppointmentId": 7
}
```

## Console Errors And Network 404/500s

| Kind | Status | Detail |
| --- | --- | --- |
| aborted | ERR_ABORTED | http://localhost:8000/api/veterinary/appointments |

## Run Instructions

```powershell
cd frontend
$env:E2E_BASE_URL = "http://localhost:3000"
$env:E2E_API_URL = "http://127.0.0.1:8000/api"
npx playwright test e2e/pawesome-full-workflow.spec.js --config=playwright.config.js
```
