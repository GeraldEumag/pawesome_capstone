# Route and Page Inventory

**Basis:** Current React route modules and sidebar source review.  
**Status:** CODE-REVIEWED; visible behavior and labels have not been checked in a running browser.

## Public and account routes

| Route | Page/component | Source-derived purpose | Status |
|---|---|---|---|
| `/` | `LandingPage` | Public landing page | CODE-REVIEWED |
| `/login` | `Login` | Account sign-in | CODE-REVIEWED |
| `/register` | `Register` | Customer account registration | CODE-REVIEWED |
| `/verify-email` | `VerifyEmail` | Verify or resend customer email verification | CODE-REVIEWED |
| `/forgot-password` | `ForgotPassword` | Request or complete a password reset | CODE-REVIEWED |
| `/logout` | `Logout` | End the current session | CODE-REVIEWED |
| `/attendance-kiosk` | `KioskGate` | PIN-gated employee attendance kiosk | CODE-REVIEWED; runtime/PIN access not tested |
| `/dashboard` | `Dashboard` | Authenticated generic dashboard/role redirect | CODE-REVIEWED |

## Customer

Sidebar labels in `frontend/src/components/customers/CustomerSidebar.jsx`:
**Services**, **My Pets**, **Payments**, **Notifications**, **History**, **Medical**, **Reports**, **Profile**, and **Logout**.

| Route | Component or behavior | Notes |
|---|---|---|
| `/customer` | Customer dashboard; index redirects to `/customer/services` | Customer-only route guard |
| `/customer/services` | `CustomerServices` | **New Request** / **My Requests**; service cards use **Book Now** |
| `/customer/bookings` | `CustomerServices` with initial My Requests tab | Alias/page entry for request tracking |
| `/customer/booking` | Redirects to `/customer/services` | Legacy redirect |
| `/customer/requests` | Redirects to `/customer/bookings` | Legacy redirect |
| `/customer/pets` | `CustomerPets` | Add/edit/archive/restore and view medical history |
| `/customer/hotel` | `HotelForm` | Pet Hotel reservation and My Bookings |
| `/customer/grooming` | `GroomingForm` | Pet grooming booking and My Appointments |
| `/customer/vet` | `VetForm` | Veterinary appointment and My Appointments |
| `/customer/medical-confinements` | `CustomerMedicalConfinements` | Customer-facing confinement view |
| `/customer/payments` | `CustomerPayments` | Payment list and related actions where available |
| `/customer/history` | `CustomerHistory` | Customer history |
| `/customer/notifications` | `CustomerNotifications` | Notifications/preferences |
| `/customer/reports` | `CustomerReports` | Customer report view |
| `/customer/profile` | `ProfileSettings` | Customer profile settings |

No customer product browsing/cart/checkout page is registered in `CustomerRoutes.jsx`. Public inventory read APIs and customer read access to existing store orders do not establish that a customer can submit an order. The cashier POS cart is a separate staff workflow.

## Receptionist

Sidebar source: `frontend/src/components/receptionist/ReceptionistSidebar.jsx`.

Visible labels include **Booking** with **Hotel**, **Veterinary**, and **Grooming**; **Manage Services**; **Walk-ins**; **Customer Profile**; **Chatbot**; **Live Chat**; **History**; **Reports**; **My Payroll**; **Profile**; and **Logout**.

| Route | Component or behavior | Notes |
|---|---|---|
| `/receptionist` | Redirects to `/receptionist/bookings/hotel` | Authenticated receptionist module |
| `/receptionist/bookings/hotel` | `ReceptionistHotelBookings` | Hotel/boarding queue |
| `/receptionist/bookings/veterinary` | `ReceptionistVeterinaryBookings` | Veterinary booking queue |
| `/receptionist/bookings/grooming` | `ReceptionistGroomingBookings` | Grooming queue |
| `/receptionist/manage-services` | `ReceptionistManageServices` | Service and related room management |
| `/receptionist/walk-ins` | `ReceptionistWalkIns` | Walk-in booking workflow |
| `/receptionist/customer-profile` | `ReceptionistCustomersProfile` | Customer/pet profile |
| `/receptionist/customers` | Customer management | Customer directory |
| `/receptionist/chatbot`, `/live-chat`, `/history`, `/reports`, `/payroll`, `/profile` | Corresponding components | Labels are from source; runtime not confirmed |
| Legacy paths | Redirects to active booking routes | `appointments-boarding`, `dashboard`, `appointments`, `boarding-manager`, `checkin`, `checkout`, `bookings`, `approvals`, `medical-confinements`, and `orders` include redirects |

## Cashier

Sidebar labels in `frontend/src/components/cashier/CashierSidebar.jsx`:
**Dashboard**, **POS**, **Transactions**, **History**, **Reports**, **My Payroll**, **Profile**, and **Logout**. The POS contains a **Payment Approvals** tab; the payment-verification deep link opens POS on that tab.

| Route | Component or behavior |
|---|---|
| `/cashier` and `/cashier/pos` | Full-screen `CashierPOS` |
| `/cashier/payment-verification` | `CashierPOS` with Payment Approvals selected |
| `/cashier/dashboard` | `CashierDashboard` shell |
| `/cashier/transactions`, `/cashier/sales` | `CashierTransactions` |
| `/cashier/history` | `CashierHistory` |
| `/cashier/reports`, `/cashier/analytics` | `CashierReports` |
| `/cashier/payroll` | `MyPayroll` |
| `/cashier/profile` | `ProfileSettings` |

**Source discrepancy:** `CashierSidebar.jsx` labels its `/cashier` link **Dashboard**, while `CashierRoutes.jsx` maps the index route `/cashier` to `CashierPOS`; the component route `/cashier/dashboard` maps to `CashierDashboard`. Runtime behavior was not tested. Do not promise that the sidebar's Dashboard link opens the dashboard until confirmed.

## Inventory

Sidebar labels in `frontend/src/components/inventory/InventorySidebar.jsx`:
**Dashboard**, **Stock Management**, **Suppliers**, **History**, **Barcode Generator**, **Reports**, **Monthly Audit**, **Audit Reports**, **Audit Analytics**, **My Payroll**, **Profile**, and **Logout**.

| Route | Component |
|---|---|
| `/inventory` and `/inventory/stock` | `UnifiedInventory` |
| `/inventory/products`, `/simplified`, `/management`, `/legacy-products` | Compatibility aliases to `UnifiedInventory` |
| `/inventory/history` | Inventory history |
| `/inventory/reports`, `/inventory/analytics` | `InventoryReports` |
| `/inventory/monthly-audit` | `MonthlyInventoryAudit` |
| `/inventory/monthly-audit-report` | `MonthlyAuditReport` |
| `/inventory/audit-analytics` | `AuditAnalyticsDashboard` |
| `/inventory/suppliers` | Supplier page |
| `/inventory/barcodes` | `BarcodeGenerator` |
| `/inventory/payroll`, `/inventory/profile` | `MyPayroll`, `ProfileSettings` |

## Veterinary

Sidebar labels in `frontend/src/components/veterinary/VeterinarySidebar.jsx`:
**Dashboard**, **Appointments**, **Customer Profiles**, **Current Boarders**, **Services**, **History**, **Reports**, **My Payroll**, **Profile**, and **Logout**.

The route module maps `/veterinary` to appointments by default and exposes appointment edit, consultation, billing, history, customer profiles, reports, receipt, current boarders, medical confinements, payroll, and profile pages.

## Manager

Sidebar labels in `frontend/src/components/manager/ManagerSidebar.jsx`:
**Dashboard**, **Reports**, **Staff Management**, **Employee Directory**, **Attendance**, **Employee ID Cards**, **Leave**, **Payroll**, **Holidays**, **Salary Loans**, **13th Month**, **Remittance Reports**, **DTR Report**, **History / Audit Trail**, **My Leave**, **My Attendance**, **Profile**, and **Logout**.

Manager routes also expose reporting, staff, attendance, leave, payroll, holidays, loans, 13th month, remittance, DTR, history, self-service, and profile components. Many legacy routes redirect to the report or attendance pages.

## Admin

Sidebar areas/labels in `frontend/src/components/admin/AdminSidebar.jsx` include **Dashboard**, **Manage Users**, **Create User**, **Employee Directory**, **Audit History**, **Login History**, **Chatbot Logs**, **Live Chat**, **All Reports**, **Payroll Reports**, **Settings**, **Landing Page Editor**, **Profile**, and **Operations Hub**. Operations Hub links to **Front Desk**, **POS / Cashier**, **Inventory**, **HR / Manager**, and **Veterinary** staff modules.

Admin route pages include user management/create user, employee directory, system-wide reports and role-specific reports, history, chatbot/live chat, landing page content, settings, login history, payroll reports, and profile.

## Super Receptionist

The separate `/super-receptionist/*` module uses `SuperReceptionistLayout` and `SuperReceptionistSidebar`. Sidebar sections are **Front Desk**, **Cashier**, **Inventory**, and **Account**. Source labels include **Hotel Bookings**, **Vet Bookings**, **Grooming**, **Walk-ins**, **Customers**, **Manage Services**, **History**, **POS (Full Screen)**, **Transactions**, **Reports**, **Stock Management**, **Monthly Audit**, **My Payroll**, and **Profile**.

The POS link navigates to `/cashier/pos`; other composite routes are mounted under `/super-receptionist/`.

## Route/access notes

- React role guards are user-interface navigation controls only.
- Backend roles are enforced by `EnsureRole` in `backend/app/Http/Middleware/EnsureRole.php`; `admin` has staff-module access but is denied customer-only routes, while `super_receptionist` expands to receptionist, cashier, and inventory.
- Every label/path above is CODE-REVIEWED only. Actual rendering, responsive navigation, and runtime authorization remain unverified.
