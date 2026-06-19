# Full E2E Manual Browser Testing Guide

Date: June 20, 2026

## Automated Playwright Full Workflow E2E Result

Status: **PASSED**

The Playwright full workflow suite was implemented and successfully executed for the Pawesome Capstone system. The automated browser test validated the main cross-role workflow using the local frontend and backend environment.

### Validation Summary

* Frontend: `http://localhost:3002`
* Backend API: `http://127.0.0.1:8000/api`
* Test command: `npm run test:e2e:full-workflow -- --reporter=list`
* Result: `8 passed`
* Duration: approximately 4.2 minutes
* Console errors detected: none
* API 404/500 errors detected: none

### Workflow Coverage

The automated E2E suite validated the following:

1. Login for Customer, Receptionist, Cashier, Inventory, Veterinary, Manager, and Admin
2. Customer creates a service request
3. Receptionist approves or schedules the request
4. Customer uploads payment proof
5. Cashier verifies the payment
6. Inventory stock/log check is performed
7. Veterinary updates appointment status
8. Manager and Admin reports are visible

### Created Test Records

```json
{
  "petId": 9,
  "serviceRequestId": 38,
  "vetAppointmentId": 2
}
```

### Evidence Screenshots

The Playwright run generated 15 automated evidence screenshots under:

```txt
browser-evidence/pawesome-full-workflow/
```

These screenshots serve as automated browser evidence for the completed full workflow test. The expanded 68-screenshot checklist remains available as a separate manual evidence checklist if additional documentation coverage is required.

### Final Automated E2E Verdict

The automated browser workflow is marked **PASSED** because the suite completed successfully, all 8 tests passed, all required Playwright evidence screenshots were generated, and no console errors or API 404/500 responses were detected during the run.

## Guide Scope

This guide is now supplemental/manual evidence guidance. The automated Playwright full workflow evidence captured 15 required screenshots. The previous 68-screenshot checklist remains the expanded manual evidence checklist, if required for documentation.

## Target Local Environment

- **Backend**: http://127.0.0.1:8000
- **Frontend**: http://localhost:3002
- **Validation**: All checks passed (592 routes, migrations ran, build successful)

## Test Accounts

| Role | Username | Password |
|------|----------|----------|
| Customer | customer@example.com | Password123! |
| Receptionist | receptionist@example.com | Password123! |
| Cashier | cashier@example.com | Password123! |
| Veterinary | vet@example.com | Password123! |
| Inventory | inventory@example.com | Password123! |
| Manager | manager@example.com | Password123! |

## Screenshot Storage

Manual screenshots should be saved to:
```
browser-evidence/full-e2e-workflow/[role]/[filename].png
```

Automated Playwright evidence is already saved to:
```
browser-evidence/pawesome-full-workflow/
```

**Total Manual Checklist Screenshots**: 68 screenshots
- Customer: 15 screenshots (10 requests + 4 payment + 1 console)
- Receptionist: 11 screenshots
- Cashier: 7 screenshots
- Veterinary: 6 screenshots
- Inventory: 6 screenshots
- Manager: 12 screenshots
- Console/Network: 9 screenshots
- Summary: 2 screenshots

## Manual Testing Instructions

### Step 1: Customer Creates Service Requests

**Login**: http://localhost:3002/login
- Use customer@example.com / Password123!

**1.1 Customer Dashboard**
- Navigate to Customer Dashboard
- Screenshot: `customer/customer-dashboard-before.png`

**1.2 Grooming Request**
- Create a grooming request for a pet
- Fill out the form with pet details, date, time
- Screenshot: `customer/customer-grooming-form.png`
- Submit the request
- Screenshot: `customer/customer-grooming-confirmation.png`
- Go to My Requests
- Screenshot: `customer/customer-my-requests-pending.png`

**1.3 Veterinary Request**
- Create a veterinary appointment request
- Fill out the form with pet details, symptoms, preferred date
- Screenshot: `customer/customer-veterinary-form.png`
- Submit the request
- Screenshot: `customer/customer-veterinary-confirmation.png`
- Go to My Requests
- Screenshot: `customer/customer-my-requests-vet-pending.png`

**1.4 Boarding Request**
- Create a boarding/hotel booking request
- Fill out the form with pet details, check-in/check-out dates
- Screenshot: `customer/customer-boarding-form.png`
- Submit the request
- Screenshot: `customer/customer-boarding-confirmation.png`
- Go to My Requests
- Screenshot: `customer/customer-my-requests-boarding-pending.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-customer-no-errors.png`

---

### Step 2: Receptionist Approves/Schedules Requests

**Logout** from Customer account
**Login**: http://localhost:3002/login
- Use receptionist@example.com / Password123!

**2.1 Receptionist Dashboard**
- Navigate to Receptionist Dashboard
- Screenshot: `receptionist/receptionist-dashboard-pending-requests.png`
- Screenshot: `receptionist/receptionist-sidebar.png`

**2.2 Grooming Approval**
- Open Grooming Approvals/Bookings
- Screenshot: `receptionist/receptionist-grooming-approvals.png`
- Select the customer's grooming request
- Click approve
- Screenshot: `receptionist/receptionist-grooming-approve-action.png`
- Confirm approval
- Screenshot: `receptionist/receptionist-grooming-approved.png`

**2.3 Veterinary Scheduling**
- Open Veterinary Approvals/Bookings
- Screenshot: `receptionist/receptionist-veterinary-approvals.png`
- Select the customer's veterinary request
- Schedule the appointment with date/time
- Screenshot: `receptionist/receptionist-veterinary-schedule.png`
- Confirm scheduling
- Screenshot: `receptionist/receptionist-veterinary-scheduled.png`

**2.4 Boarding Approval**
- Open Boarding Approvals/Bookings
- Screenshot: `receptionist/receptionist-boarding-approvals.png`
- Select the customer's boarding request
- Click approve
- Screenshot: `receptionist/receptionist-boarding-approve-action.png`
- Confirm approval
- Screenshot: `receptionist/receptionist-boarding-approved.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-receptionist-no-errors.png`

---

### Step 3: Customer Uploads Payment Proof

**Logout** from Receptionist account
**Login**: http://localhost:3002/login
- Use customer@example.com / Password123!

**3.1 View Approved Request**
- Go to My Requests
- Open one of the approved requests (grooming, vet, or boarding)
- Screenshot: `customer/customer-approved-request.png`

**3.2 Upload Payment Proof**
- Click on payment/upload proof option
- Select a valid PNG/JPEG file (use any test image)
- Screenshot: `customer/customer-upload-payment-proof.png`
- Upload the file
- Screenshot: `customer/customer-payment-proof-uploaded.png`
- Verify status shows "Payment Pending Verification"
- Screenshot: `customer/customer-my-requests-payment-pending.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-customer-payment-no-errors.png`

---

### Step 4: Cashier Verifies Payment

**Logout** from Customer account
**Login**: http://localhost:3002/login
- Use cashier@example.com / Password123!

**4.1 Cashier Dashboard**
- Navigate to Cashier Dashboard
- Screenshot: `cashier/cashier-dashboard.png`
- Screenshot: `cashier/cashier-sidebar.png`

**4.2 Payment Verification**
- Open Pending Payments
- Screenshot: `cashier/cashier-pending-payments.png`
- Select the customer's payment with uploaded proof
- View the uploaded payment proof
- Screenshot: `cashier/cashier-payment-proof-view.png`
- Click verify payment
- Screenshot: `cashier/cashier-verify-payment.png`
- Confirm verification and receipt generation
- Screenshot: `cashier/cashier-receipt-generated.png`
- Verify payment status changed to "Paid"
- Screenshot: `cashier/cashier-payment-verified.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-cashier-no-errors.png`

---

### Step 5A: Veterinary Completes Appointment

**Logout** from Cashier account
**Login**: http://localhost:3002/login
- Use vet@example.com / Password123!

**5A.1 Veterinary Dashboard**
- Navigate to Veterinary Dashboard
- Screenshot: `veterinary/veterinary-dashboard.png`
- Screenshot: `veterinary/veterinary-sidebar.png`

**5A.2 Appointment Completion**
- Open Scheduled Appointments
- Screenshot: `veterinary/veterinary-scheduled-appointments.png`
- Select the customer's scheduled veterinary appointment
- View appointment details
- Screenshot: `veterinary/veterinary-appointment-details.png`
- Add diagnosis, treatment notes, prescription/remarks
- Mark appointment as completed
- Screenshot: `veterinary/veterinary-complete-appointment.png`
- Confirm completion
- Screenshot: `veterinary/veterinary-appointment-completed.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-veterinary-no-errors.png`

---

### Step 5B: Inventory Logs Stock Movement

**Logout** from Veterinary account
**Login**: http://localhost:3002/login
- Use inventory@example.com / Password123!

**5B.1 Inventory Dashboard**
- Navigate to Inventory Dashboard
- Screenshot: `inventory/inventory-dashboard.png`
- Screenshot: `inventory/inventory-sidebar.png`

**5B.2 Stock Movement**
- Open Stock List/Inventory
- Screenshot: `inventory/inventory-stock-list.png`
- Create a stock adjustment/log stock movement
- Select an item, adjust quantity, add reason
- Screenshot: `inventory/inventory-stock-adjustment.png`
- Submit the adjustment
- Screenshot: `inventory/inventory-stock-updated.png`
- Verify updated stock quantities
- Screenshot: `inventory/inventory-updated-stock-list.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-inventory-no-errors.png`

---

### Step 6: Manager Reports Validation

**Logout** from Inventory account
**Login**: http://localhost:3002/login
- Use manager@example.com / Password123!

**6.1 Manager Dashboard**
- Navigate to Manager Dashboard
- Screenshot: `manager/manager-dashboard-final.png`
- Screenshot: `manager/manager-sidebar.png`

**6.2 Service Report**
- Open Reports → Service Report
- Verify completed service appears
- Screenshot: `manager/manager-report-service.png`
- Click to view service details
- Screenshot: `manager/manager-report-service-details.png`

**6.3 Payment Report**
- Open Reports → Payment Report
- Verify verified payment appears
- Screenshot: `manager/manager-report-payment.png`
- Click to view payment details
- Screenshot: `manager/manager-report-payment-details.png`

**6.4 Inventory Report**
- Open Reports → Inventory Report
- Verify stock changes appear
- Screenshot: `manager/manager-report-inventory.png`
- View stock movement log
- Screenshot: `manager/manager-report-inventory-movement.png`

**6.5 Customer Report**
- Open Reports → Customer Report
- Verify customer activity appears
- Screenshot: `manager/manager-report-customer.png`
- View customer transaction history
- Screenshot: `manager/manager-report-customer-history.png`

**6.6 Revenue Report**
- Open Reports → Revenue Report
- Verify total revenue updated
- Screenshot: `manager/manager-report-revenue.png`
- View revenue breakdown by service type
- Screenshot: `manager/manager-report-revenue-breakdown.png`

**Console Check**: Open DevTools (F12), check Console tab for errors
- Screenshot: `console-network/console-manager-no-errors.png`

---

### Step 7: Network Evidence

**Network Validation**
- Keep DevTools Network tab open during one of the sessions
- Filter by "Fetch/XHR"
- Verify all API calls return 200/201/204 status
- Screenshot: `console-network/network-all-200-status.png`
- Verify no 404 or 500 errors
- Screenshot: `console-network/network-no-404-500.png`

---

### Step 8: Summary Screenshots

**8.1 Workflow Summary**
- Create a summary document or screenshot showing the complete workflow
- Screenshot: `summary/workflow-summary.png`

**8.2 Test Results Summary**
- Document the test results with pass/fail counts
- Screenshot: `summary/test-results-summary.png`

---

## Post-Testing Steps

After completing all manual browser testing, if supplemental manual evidence is requested:

1. **Update FULL_E2E_BROWSER_TEST_REPORT.md**
   - Add actual test execution date
   - Record total manual screenshots captured
   - Record pass/fail count
   - Record console error count
   - Record network 404/500 count
   - Note any known issues
   - Set final status (Browser Passed, Browser Failed, or Conditional Passed)

2. **Update FULL_E2E_SCREENSHOT_CHECKLIST.md**
   - Check off all captured screenshots
   - Add completion date

3. **Update CAPSTONE_B_FULL_WORKFLOW_EVIDENCE.md**
   - Update E2E workflow status
   - Add actual screenshot count
   - Update final readiness status

4. **Commit and Push**
   ```bash
   git status
   git add .
   git commit -m "Validate full cross-role E2E browser workflow evidence"
   git push origin main
   ```

## Important Notes

- Use the exact filenames specified in the checklist
- Save all screenshots as PNG format
- Ensure screenshots are clear and readable
- Check console for errors after each role's session
- Verify network responses are successful
- If any step fails, document the issue and continue with next steps
- The Manager reports validation is the final confirmation that the workflow worked end-to-end
- Do not describe the automated Playwright evidence as the expanded manual checklist output. The automated Playwright run captured 15 screenshots; the 68-screenshot list is optional/manual supplemental evidence.
