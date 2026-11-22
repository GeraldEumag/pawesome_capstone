# Pawesome Full Workflow Playwright E2E Report

Status: **FAILED**

Started: 2026-11-22T03:18:24.300Z
Completed: 2026-11-22T03:19:47.017Z
Frontend: http://127.0.0.1:3001
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
| Customer creates booking/request/order | PASS | service_request #292 |
| customer to admin full workflow | FAIL | Error: POST /receptionist/requests/292/approve failed 401: {"message":"Unauthenticated.","success":false} |

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

## Created Records

```json
{
  "petId": 142,
  "serviceRequestId": 292
}
```

## Console Errors And Network 404/500s

| Kind | Status | Detail |
| --- | --- | --- |
| None detected |  |  |

## Run Instructions

```powershell
cd frontend
$env:E2E_BASE_URL = "http://localhost:3000"
$env:E2E_API_URL = "http://127.0.0.1:8000/api"
npx playwright test e2e/pawesome-full-workflow.spec.js --config=playwright.config.js
```
