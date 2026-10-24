# Role-to-Feature Matrix — v0.4 Audit

**Basis:** current working tree (HEAD `3e75be0` + uncommitted changes), audited 2026-10-25.
**Status labels:** VERIFIED (code + executed evidence this pass or Revision B Phase 9 live run on same code lineage) · TESTED-ONLY (automated test/mock passed) · CODE-REVIEWED (source inspected only) · PARTIALLY VERIFIED · UNVERIFIED · UNAVAILABLE · BLOCKED.

Evidence shorthand: `BT` = today's backend run (98 tests/493 assertions), `MT` = today's mocked Playwright run, `P9` = Revision B Phase 9 live run (9/9 journeys), `SRC` = source inspection, `v02` = 2026-10-22 runtime pass.

## Customer (`/customer/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| Login/Register/Verify/Reset | Account access | public routes | register→verify→reset chain: `EmailAuthFlowTest` (BT, 15 tests) | §3.1–3.3 | VERIFIED | none |
| Services (`/customer/services`) | Browse + book | CustomerRoutes `services` | UM-002 (v02), `CustomerServices.jsx` "Book Now" | §4.2–4.3 | VERIFIED | none |
| My Pets (`/customer/pets`) | Add/edit/archive/restore pet + photo | route `pets` | `CustomerPets.jsx`: JPG/PNG/WebP, **<10 MB**; `PrivatePetPhotoTest` (BT) | §4.1 | VERIFIED | v0.3 omits photo rules |
| Grooming/vet booking | Book service | `POST /customer/requests` | UI chain (v02); approve→paid chain (P9 J1/J2) | §4.2 | VERIFIED | none |
| Pet Hotel (`/customer/hotel`) | Book boarding + vax card + room | `POST /customer/boardings` | `HotelForm.jsx` New Reservation/Stay Date; boarding+room tests (BT); P9 J5 | §4.3 | VERIFIED | none |
| My Requests (`/customer/bookings`) | Track + pay | `my-requests` API | `CustomerBookingsBoard.jsx` tabs: All/Pending/Ongoing/Pickup/Done/Cancelled; payment labels Not paid/Verifying/Paid/Partly paid/Rejected/Refunded; Pay now/Resubmit payment | §4.4 + status tables | VERIFIED | none |
| Payment proof upload | Upload GCash/Maya proof + ref | `payment-proof` routes (4 flows) | proof persists unpaid; **duplicate reference → 422** (`PaymentReferenceGuard`, BT); ≤5 MB jpg/png/pdf (`PaymentUploadModal`) | §4.4 | VERIFIED | v0.4 must add unique-reference rule |
| Payments page (`/customer/payments`) | View payment records | route exists | `CustomerPayments.jsx` receipt PDF download (MT: receipt-pdf spec) | §4.4 mention | TESTED-ONLY | none |
| Vet additional billing | Pay extra charges | `VeterinaryBillingPaymentFlowTest` (BT) | online billing GCash/Maya only → cashier proof | §4.4 note | VERIFIED | v0.3 didn't mention |
| Cancel request | Cancel own booking | `PATCH requests/{id}/cancel`, `POST boardings/{id}/cancel` | routes confirmed | §4.4 | CODE-REVIEWED | not documented in v0.3 — add |
| Notifications / History / Medical / Reports / Profile | View records | routes exist | pages render (v02); `CustomerMedicalConfinements.jsx`; initials avatar test (BT) | §4.6 | VERIFIED (pages) | none |
| Store checkout | Buy products | `store/checkout` → 410 | `CustomerStoreController.php:25` confirmed 410 today | §4.5 | UNAVAILABLE | none |

## Receptionist (`/receptionist/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| Booking queues (hotel/vet/grooming) | Review, approve, reject | sidebar + 3 list pages | approve/reject routes; confirmation dialog "Are you sure you want to approve this request?" in all 3 pages; row actions via `.row-action-popover` | §5.1 | VERIFIED | v0.4: add confirm dialog + row-actions menu |
| Vet assignment | Pick vet on approval | `veterinarians/available` route; approve w/ `veterinarian_id` | BT + P9 | §5.1 | VERIFIED | none |
| Hotel approval constraints | Vax card + room required | `verify-vaccination`, approve routes | BT: "customer boarding requires card and verification before approval", "hotel approval persists room reservation", "auto assigns compatible room", "full room → controlled rejection", "duplicate approval → no dup reservation" | §5.1 note | VERIFIED | v0.4: add room detail |
| Boarding lifecycle | Check-in, care logs, ready-for-pickup, check-out | routes + `ReceptionistHotelBookings.jsx` (Check In/Check Out/Ready for Pickup/Add Care Log btns) | routes confirmed; P9 rejection-releases-reservation | §5.1 (new subsection) | VERIFIED | **missing from v0.3** |
| Walk-ins (`/receptionist/walk-ins`) | Create walk-in + recent list | `WalkInController` GET/POST | "Recent Walk-in Bookings" list in JSX; walk-in→cash chain (P9 J4, BT) | §5.2 | VERIFIED | v0.4: add recent list |
| Customer Profile / Manage Services / Chatbot / Live Chat / History / Reports / My Payroll | Supporting pages | routes + sidebar | pages render (v02) | §5.3 | CODE-REVIEWED | none |
| Extra routes (appointments, approvals, boarding-manager, checkin/checkout, orders, medical-confinements) | Legacy/alternate pages | routes exist | not sidebar-linked; `orders` → customer-order UI (store disabled) | — | UNVERIFIED | left undocumented; orders route maps to disabled scope |

## Cashier (`/cashier/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| POS (`/cashier`, `/cashier/pos`) | Ring up sale | sidebar POS | `CashierPOS.jsx` tabs All Items/Accessories/Health & Meds/Pet Food/Services; Walk-in Customer default; insufficient cash rejected (BT); sale+void (v02, P9); idempotency key (uncommitted SRC) | §6.2 | VERIFIED | none |
| Payment Approvals | Verify/collect/reject | POS → Payment Approvals; `/cashier/payment-verification` | `PaymentApprovals.jsx` Verify/Collect Payment/Collect Cash/Reject + View Proof; channel rules (BT: walk-in cash ok, online-pending-proof must verify/reject, rejected-proof online → counter ok); counter GCash/Maya w/ reference allowed (BT) | §6.1 | VERIFIED | v0.4: counter-digital w/ reference |
| Transactions / History / Sales / Reports / Analytics / Dashboard | Records + summaries | routes | pages render; UM-014 | §6.3 | CODE-REVIEWED | none |

## Inventory (`/inventory/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| Stock Management | Search/filter, edit, adjust | sidebar | statuses In/Low/Out of Stock; `StockAdjustmentModal.jsx`; BT J6 (P9): over-stock decrement → 422; adjust remove/set (v02) | §7.1–7.2 | VERIFIED | none |
| Batch receiving (add stock) | Receive new stock | batch routes | receive→dispose roundtrip (v02) | §7.2 note | VERIFIED | none |
| **Controlled Drugs** (`/inventory/controlled-drugs`) | View controlled-drug register | NEW sidebar item → `ControlledDrugRegister.jsx` | register lists movements (type, Δqty, balance, witness, pet, notes); requires `item_class=controlled_drug` | **new §7.4** | CODE-REVIEWED | **missing from v0.3** |
| Suppliers / Barcode Generator / History / Reports | Supporting | sidebar | supplier roundtrip (v02); barcode gen unexercised | §7.3 | PARTIALLY VERIFIED | barcode output unverified |
| Monthly Audit / Audit Reports / Audit Analytics | Stock counts | sidebar | pages exist; submission unexercised; variances go to manager Invoice Approvals | §7.3 | PARTIALLY VERIFIED | submission flow unverified |
| Extra routes (products, management, simplified, legacy-products, analytics, monthly-audit-report) | Alternate page variants | routes exist | not sidebar-linked | — | UNVERIFIED | left undocumented |

## Veterinary (`/veterinary/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| Appointments | View queue, open consult | sidebar | stat cards + filters (v02); UM-008/016 | §8.1 | VERIFIED | none |
| Consultation (`appointments/:id/consult`) | Record care | `VetConsultation.jsx` | Start Consultation / Save Draft / Needs Confinement / **Finalize & Review Bill** / View Billing; visit auto-closes after payment; corrections-not-edits on finalized records | §8.1 | VERIFIED | none |
| Billing (`appointments/:id/billing`) | Send bill to cashier | route + `VeterinaryBillingPaymentFlowTest` (BT) | billing syncs to cashier; customer pays GCash/Maya or counter | §8.1 | VERIFIED | none |
| Dispensations | Record medication hand-out | `DispensationController` index/store/counsel/**void** (uncommitted) | controlled-drug register integration | — | PARTIALLY VERIFIED | not documented in v0.3 — brief mention in §8.2 |
| Vaccination recall / certificate | Recall check, cert | routes exist | — | — | UNVERIFIED | not documented |
| Current Boarders / Customer Profiles / Services / History / Reports / receipt | Supporting | routes | pages render (v02) | §8.2 | CODE-REVIEWED | none |
| Medical confinements | Manage confined patients | route + confinement endpoints incl. uncommitted `cancel` | `MedicalConfinementController` | — | CODE-REVIEWED | not documented in v0.3 — brief mention |

## Manager (`/manager/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| Dashboard / Reports | View summaries | sidebar | UM-009; report reconciliation (P9 J7) | §9.1 | VERIFIED (page) | none |
| Attendance / Day-Off Schedule / My Attendance | Staff time | routes | day-off set/clear/invalid (v02); kiosk punch (v02 chain4) | §9.2 | VERIFIED | none |
| Leave | Approve/reject leave | route | self-file→approve→deduct, reject w/ reason (v02) | §9.2 | VERIFIED | none |
| **Invoice Approvals** (`/manager/invoice-approvals`) | Approve stock adjustments + audit variances | NEW → `ManagerInvoiceApprovals.jsx` | queue shows adjustments + audit variances w/ reason, requester, amounts | **new §9.4** | CODE-REVIEWED | **missing from v0.3** |
| **Receipt Scanner** (`/manager/receipt-scanner`) | Configure receipt-scanning | NEW → `ReceiptScannerSettings.jsx` | provider patterns (GCash/Maya), accepted status texts, accuracy metrics, wallet accounts | **new §9.4** | CODE-REVIEWED | **missing from v0.3** |
| **Controlled Drugs** | View register | NEW | same register as inventory | §9.4 | CODE-REVIEWED | new |
| Payroll (incl. `payroll/computation`) | Run payroll | routes | single-employee lifecycle create→approve→release=paid (v02 chain3); bulk/computation unexercised | §9.3 | PARTIALLY VERIFIED | bulk flow unverified |
| Holidays / Salary Loans / 13th Month / Remittance / DTR | HR pages | routes | pages exist; not exercised | §9.3 | UNVERIFIED | documented w/ limitation note |
| Staff Management / Employee Directory / ID Cards / customers / reservations / inventory / payments / schedule / services | Supporting | routes exist | — | §9.3 list | UNVERIFIED | list-only coverage (honest) |

## Admin (`/admin/*`)

| Screen/feature | User task | Access evidence | Behavior evidence | Manual coverage | Status | Gap |
|---|---|---|---|---|---|---|
| Manage Users / Create User | Accounts, roles | routes `users`, `users/create` | 8 roles; welcome email w/ set-password link (BT: "admin created user receives welcome set password link"); pre-verified | §10.1 | VERIFIED | none |
| Audit History / Login History / Chatbot Logs / Live Chat | Monitoring | routes | pages render (v02) | §10.2 | CODE-REVIEWED | none |
| All Reports / Payroll Reports (+ reports/* family) | Reports | routes | render (v02) | §10.2 | CODE-REVIEWED | none |
| Settings / Landing Page Editor | Config | routes | pages exist; changes unexercised | §10.2 | UNVERIFIED | listed w/o detail |
| Operations Hub | Open staff modules | sidebar | admin reaches staff modules; customer portal blocked (v02 gates) | §10.2 | VERIFIED | none |

## Super Receptionist (`/super-receptionist/*`)

| Feature | Evidence | Coverage | Status |
|---|---|---|---|
| Front Desk + Cashier + Inventory composite | sidebar groups; login lands `/super-receptionist` (v02 UM-012) | §11 | VERIFIED (access) |
| Route family mirrors §5–§7 | routes list confirmed | §11 | CODE-REVIEWED |

## Staff self-service + kiosk

| Feature | Evidence | Coverage | Status |
|---|---|---|---|
| My Payroll / My Attendance / My Leave | `GET /api/my-payroll` caller-scoped; correction+leave file/review (v02 chain3/4, BT) | §12.1 | VERIFIED |
| Attendance kiosk | PIN gate both directions + real barcode punch (v02 chain4); `/attendance-kiosk`, manager `attendance/kiosk` | §12.2 | VERIFIED |

## Cross-cutting confirmations (today's BT)

- Payment reference uniqueness across all 4 proof flows (BT + P9 J3/J5/J9).
- Boarding update cannot set status/payment_status directly (BT).
- POS rejects insufficient cash (BT).
- Oversized idempotency key rejected (BT).
- Initials avatar fallback (BT).
- Chatbot role recheck: staff tool blocked for customer (BT).

## Not user-facing / excluded

- Deleted `InventoryDeductionService` — internal refactor.
- `docs/integration/RECONCILIATION_INVENTORY.md`, `REPOSITORY_CLEANUP_REPORT.md` — internal reports.
- Customer-order write paths — 410 disabled.
- Legacy inventory route variants — not sidebar-linked.
