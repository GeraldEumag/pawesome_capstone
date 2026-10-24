# Pawesome Pet Care Management System
## System User Guide for IT Professional Evaluators

**Purpose:** step-by-step orientation to the live-deployed Pawesome application for a supervised IT evaluation session.

> The evaluator will use the live deployment. This guide was drafted from the project routes and visible navigation, which may differ from the deployed build. Before the session, the facilitator must confirm the live URL, deployed version, available evaluator accounts, and actual screen labels.

The browser interface is served from Vercel and communicates with the paired Laravel API on Railway. Start from the Vercel URL supplied by the project team; do not treat a Railway API or health-check URL as the user interface.

## 1. Safety, privacy, and evaluator access

- Use only the live URL and role-specific evaluator accounts supplied directly by the project team. Credentials are intentionally not printed in this guide.
- Treat the live deployment as production data: all changes may persist and be visible to staff or customers. Default to read-only inspection.
- Perform a write only when the facilitator confirms that the account and records are isolated for evaluation, the action is explicitly approved, notifications cannot reach real people, and a safe cleanup plan is in place. If any condition is unclear, do not perform the action; ask the facilitator to demonstrate it or record it as not tested.
- Never use real personal, payment, or veterinary information. Use only fictional evaluator records prepared and approved for the live session.
- Do not initiate real payments, submit real payment proofs, send messages to customers, alter real inventory, edit live medical records, create or change live staff accounts, or approve real HR/payroll actions.
- Do not conduct penetration testing, try another person's credentials, bypass role permissions, or intentionally interrupt the service.
- Do not delete, reset, or otherwise clean up live records yourself. The project team must handle any approved cleanup.

## 2. Sign in, identify your role, and sign out

1. Open the live Vercel evaluation URL provided by the facilitator in the agreed browser. The facilitator should confirm that it is paired with the intended Railway API deployment.
2. Select **Log In** or open the `/login` page.
3. Enter the supplied login name (the test account may use its email address) and password, then submit the form.
4. Confirm that the welcome message appears and that the application opens the workspace for the assigned role. If the page redirects to a different role's home or reports an access problem, stop and ask the facilitator to verify the account.
5. When finished, use **Log Out** or **Logout** in the navigation and confirm the prompt if shown.

Customer accounts that have not completed email verification may be directed to the verification page and cannot submit protected booking actions. Ask the facilitator to prepare a verified evaluator account rather than using a personal email address. Never request that verification or password-reset email be sent to an address you do not control.

## 3. Navigation at a glance

Use the visible sidebar/menu to move between modules. On a smaller screen, open the menu control first. The routes below are references for the facilitator; evaluators should normally use the visible navigation rather than typing paths manually.

| Role | Main visible areas | Workspace path |
|---|---|---|
| Customer | Services, My Pets, Payments, Notifications, History, Medical, Reports, Profile | `/customer` |
| Receptionist | Booking (Hotel, Veterinary, Grooming), Manage Services, Walk-ins, Customer Profile, Chatbot, Live Chat, History, Reports, My Payroll, Profile | `/receptionist` |
| Cashier | Dashboard, POS, Transactions, History, Reports, My Payroll, Profile; the POS has a **Payment Approvals** tab | `/cashier` |
| Inventory | Dashboard, Stock Management, Suppliers, History, Barcode Generator, Reports, Monthly Audit, Audit Reports, Audit Analytics, My Payroll, Profile | `/inventory` |
| Veterinary | Dashboard, Appointments, Customer Profiles, Current Boarders, Services, History, Reports, My Payroll, Profile | `/veterinary` |
| Manager | Dashboard, Reports, Staff Management, Employee Directory, Attendance, Employee ID Cards, Leave, Payroll, Holidays, Salary Loans, 13th Month, Remittance Reports, DTR Report, History / Audit Trail, My Leave, My Attendance, Profile | `/manager` |
| Admin | Dashboard, Manage Users, Create User, Employee Directory, Audit History, Login History, Chatbot Logs, Live Chat, All Reports, Payroll Reports, Settings, Landing Page Editor, Profile, and Operations Hub | `/admin` |
| Super receptionist | Front Desk (booking, walk-ins, customers, services, history), Cashier, Inventory, and Account sections | `/super-receptionist` |

Role access is intentional. Admin can reach staff workspaces from the Operations Hub but does not use the customer portal. The super receptionist combines front-desk, cashier, and inventory tasks; it does not include manager, veterinary, or admin-only areas. A missing menu item may therefore be a permission boundary rather than a defect.

## 4. Customer tasks

### 4.1 Review or add a test pet

1. Sign in with the customer evaluation account.
2. Open **My Pets**.
3. Review the prepared pet list and use search or the pet-type filter if needed.
4. If the facilitator has authorized a write, select **Add Pet**, complete the fields shown with fictional test data, and save. Otherwise, inspect a prepared pet only.
5. Open the pet's available details or medical-history view if included in the test. Do not enter real clinical notes.

### 4.2 Make and track a service request

1. Open **Services** and select **New Request**.
2. Choose one available service card: **Pet Hotel / Boarding**, **Grooming**, or **Veterinary**.
3. Follow the form prompts and select a registered pet belonging to the evaluation account. Booking forms require a registered pet.
4. Review the displayed details in the booking review step. Use the back option to correct information if needed.
5. On the live deployment, submit only if the facilitator has confirmed this evaluator account is isolated and the request will not enter a real operational queue. Do not initiate a real payment or upload real payment proof.
6. Return to **Services** and open **My Requests** to inspect the request and its displayed status. Depending on the service, the request may need receptionist review before progressing.
7. Use **Payments**, **Notifications**, or **History** to inspect the related information available to the customer account.

The system may present the booking review before the API submission. Reaching this review step does not itself mean that a booking has been saved.

## 5. Receptionist tasks

### 5.1 Review a prepared booking

1. Sign in with the receptionist account and expand **Booking** in the sidebar.
2. Choose **Hotel**, **Veterinary**, or **Grooming** to open the corresponding booking queue.
3. Use the visible search, status filter, or summary cards to locate the facilitator's test record.
4. Open the booking details and check the customer, pet, requested service, time/date, notes, and current status.
5. If asked to demonstrate a state change, use only the action agreed with the facilitator. Available actions vary with the service and current status and can include approval, rejection, start, or completion.
6. For a rejection or cancellation, follow the on-screen reason prompt and use a test reason. Do not alter a real customer's booking.
7. Recheck the queue or record details to see whether the status changed. If approved, the booking may continue into payment or veterinary processing.

### 5.2 Inspect walk-ins and customer information

1. Open **Walk-ins** to view the walk-in workflow. Creating a walk-in may create operational records, so do not submit without approval.
2. Open **Customer Profile** to search and inspect the prepared customer record.
3. Other available areas include **Manage Services**, **Chatbot**, **Live Chat**, **History**, and **Reports**. Use prepared records and avoid sending messages to real customers.

## 6. Cashier tasks

### 6.1 Inspect the POS

1. Sign in with the cashier account and open **POS**.
2. Browse the product categories or use the search field; inspect stock availability and displayed prices.
3. The POS cart and payment steps create financial records. On the live deployment, inspect the interface without completing a sale unless the facilitator has explicitly approved an isolated, non-real-money evaluation transaction.
4. For an approved test transaction, use only the prepared items and test payment method specified by the facilitator; verify the displayed quantity and total before proceeding.
5. Inspect the resulting on-screen receipt. Close it only after any evidence requested by the facilitator has been captured using test data.

### 6.2 Inspect payment approvals and transaction records

1. In the POS, select **Payment Approvals**. Notifications may also open the cashier workspace directly on this tab.
2. Locate a prepared payment record and review the service/order reference, amount, payment method, and proof/status information available.
3. Verify or reject only when explicitly authorized for the test record; these actions change payment state. Do not use real payment information.
4. Open **Transactions**, **History**, or **Reports** to inspect the resulting record when permitted. Compare with facilitator-provided expected values.

## 7. Inventory tasks

1. Sign in with the inventory account and open **Stock Management**.
2. Search for a prepared test item and inspect its displayed stock, status, and available item details.
3. Use **History** to review the stock activity for a test item if available.
4. **Suppliers**, **Barcode Generator**, and **Reports** are separate navigation areas; browse them with the prepared dataset.
5. **Monthly Audit**, **Audit Reports**, and **Audit Analytics** are audit-related areas. Viewing a report is different from saving an audit. Do not save an audit or apply stock adjustments to live inventory during an evaluator session.
6. Do not add, edit, archive, restore, dispose of, or adjust stock in a shared environment without explicit approval.

## 8. Veterinary tasks

1. Sign in with the veterinary account and open **Appointments**.
2. Locate the facilitator's assigned test appointment using the list filters or search.
3. Open the appointment details and review the pet, owner, service, notes, and status.
4. If the facilitator has authorized a consultation demonstration, open the consultation from the appointment. The consultation workflow can include **Start Consultation**, editable record sections, **Save Draft**, and a finalization/completion action.
5. Do not enter invented diagnosis, medication, treatment, or medical-history information. Only use the facilitator's explicitly supplied fictional test scenario.
6. Finalizing a consultation or completing an appointment changes the record and may interact with billing/payment status. Do not perform these actions unless the facilitator confirms an isolated evaluator record, no real billing/notifications, explicit approval, and project-team-managed cleanup.
7. Use **Customer Profiles**, **Current Boarders**, **Services**, **History**, and **Reports** to inspect other prepared veterinary views.

## 9. Manager and admin tasks

### Manager

1. Open **Reports** to review the prepared operational reporting data.
2. Use **Staff Management** or **Employee Directory** to inspect test staff information.
3. Other areas include attendance, leave, payroll, holidays, salary loans, 13th-month calculations, remittance reports, DTR reporting, and history/audit trail.
4. Treat staff, attendance, payroll, leave, and financial actions as read-only unless the facilitator has authorized a specific test. Do not change staff records or approve real leave/payroll operations.

### Admin

1. Use **Dashboard** and **All Reports** for system-wide views.
2. Use **Manage Users**, **Create User**, and **Employee Directory** only to inspect prepared data unless user creation or role changes are explicitly approved.
3. **Audit History** and **Login History** display available event records. **Settings**, **Landing Page Editor**, **Chatbot Logs**, and **Live Chat** are separate system tools.
4. The **Operations Hub** links to Front Desk, POS/Cashier, Inventory, HR/Manager, and Veterinary workspaces. Use the **Back to Admin Home** control to return when it is shown.
5. Admin has broad staff access, but customer-only pages remain restricted. Do not test or attempt to bypass that restriction.

### Super receptionist

The super receptionist sidebar combines front desk, cashier, and inventory sections. Use the visible section links. Its POS link opens the cashier POS workspace; return using the provided back/home navigation. This account does not include manager, veterinary, admin, or customer portal access.

## 10. Common questions and troubleshooting

| What you see | Suggested next step |
|---|---|
| Login fails or the role home looks wrong | Recheck the account details with the facilitator. Do not repeatedly retry a possibly locked or throttled account. |
| Customer account opens email verification | Ask the facilitator for a verified test account or the approved verification procedure. Do not substitute a personal email. |
| A queue, report, or history is empty | Ask whether test data was prepared and whether your role is expected to see it. Do not create records just to populate a shared environment. |
| A menu or page is unavailable | Check that the correct role account is active. Role-specific access is expected; report the exact page and role to the facilitator. |
| A page reports an API/network error or remains loading | Record the page and approximate time, then tell the facilitator. Do not diagnose by changing data or environment settings. |
| A status or amount does not match the test plan | Stop before taking another action; record the test reference and displayed result and ask the facilitator to verify the expected state. |

## 11. Suggested evaluator session order

For a supervised IT-professional walkthrough, this order gives a read-oriented view across the system:

1. Sign in with the role assigned for the first part of the session and confirm its landing page.
2. Inspect a customer service request and its visible review/status flow using prepared data.
3. Review the matching receptionist booking queue and inspect the details without changing state.
4. Inspect cashier payment approvals and POS product/receipt presentation without completing an unapproved sale.
5. Inspect the corresponding veterinary appointment/consultation and inventory/report views.
6. Review a manager report and, if provided, the corresponding admin audit record.
7. Sign out and record which roles, screens, and actions were actually tested.

The facilitator may split this sequence across separate accounts. Do not assume one account should see every stage.

## 12. Session notes

| Session detail | Record |
|---|---|
| Evaluation date | |
| Evaluator role / account type (not credentials) | |
| Environment name and URL supplied by project team | |
| Browser and device | |
| Roles used | |
| Screens/workflows inspected | |
| State-changing actions explicitly approved | |
| Errors, delays, or mismatches observed | |
| Test-data or deployment limitations | |

## Project references

- `docs/RBAC_PERMISSION_MATRIX.md` - role capability boundaries.
- `docs/EVALUATION_EVIDENCE.md` - recorded workflow evidence and known limitations; this is not a substitute for checking the build under evaluation.
- `frontend/src/routes/` and `frontend/src/components/*/*Sidebar.jsx` - route and visible navigation source used to prepare this guide.
- `documentation/PAWESOME_EVALUATOR_GUIDE_ISO_IEC_25010.md` - separate software-quality evaluation guidance.
