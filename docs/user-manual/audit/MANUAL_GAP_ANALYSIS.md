# Manual Gap Analysis — v0.3 claims vs. current system

**Audited document:** `PAWESOME_USER_MANUAL_v0.3.md`
**Against:** working tree HEAD `3e75be0` + uncommitted changes, audited 2026-10-25
**Classification:** correct · incomplete · outdated · incorrect · ambiguous · unverified

| § | Manual claim | Evidence | Status | Required action | Priority | Disposition |
|---|---|---|---|---|---|---|
| 3.1 | Sign in routes to role workspace; unverified → verification page | `ApiTokenAuth`, role landing routes; BT gates | correct | none | — | keep |
| 3.2 | Register: Personal Information → Account Setup → Emergency Contact → terms → verification email | `Register.jsx`, `EmailAuthFlowTest` (BT) | correct | none | — | keep |
| 3.3 | Email verify link 60 min; Forgot Password flow; no account-enumeration | `EmailAuthFlowTest` (BT) incl. token suppression + notices | correct | none | — | keep |
| 4 | Sidebar: Services, My Pets, My Requests, Notifications, History, Medical, Reports, Profile, Log Out | `CustomerSidebar.jsx` — exact match today | correct | none | — | keep |
| 4 | Status tables (booking + payment) | `utils/bookingTabs.js` + `PAYMENT_LABELS` — exact match | correct | none | — | keep |
| 4.1 | Add/Edit/Archive/Restore, All Pet Types filter, archived pets unbookable | `CustomerPets.jsx` — all confirmed | incomplete | Add pet-photo rule (JPG/PNG/WebP, <10 MB, error text verified in source) | Medium | revise |
| 4.2 | Services → Book Now → pet/service/date/time → review → Confirm booking → My Requests | `CustomerServices.jsx`, `BookingReviewModal.jsx`; P9 J1 | correct | none | — | keep |
| 4.3 | Pet Hotel → New Reservation → Stay Date → room → Notes → Vaccination Card → Submit Boarding Request | `HotelForm.jsx` labels confirmed; BT room-reservation tests | incomplete | Add: same-day stay, room can auto-assign at approval, full room → pick another (BT) | Medium | revise |
| 4.4 | Pay now → GCash/Maya + reference + proof ≤5 MB → Verifying → Paid/receipt; rejected → Resubmit | `CustomerBookingsBoard.jsx`, `PaymentUploadModal`, BT | incomplete | Add: **reference must be unique** (reuse → rejection, BT + P9); add: cancel own request (routes exist); add: vet extra-billing pays same way (BT) | High | revise |
| 4.5 | Store checkout unavailable | `CustomerStoreController.php:25` → 410, confirmed today | correct | none | — | keep |
| 4.6 | Notifications/History/Medical/Reports/Profile summaries | routes + pages | correct | Add receipt PDF download on Payments page (MT) | Low | revise |
| 5 | Receptionist sidebar list | routes + sidebar — match | correct | none | — | keep |
| 5.1 | Booking → queue → details → Approve/Reject (reason) | all 3 booking pages | incomplete | Add: action lives in the row's actions menu; **confirmation dialog** "Are you sure you want to approve this request?" appears; double-approve is safely rejected (BT) | High | revise |
| 5.1 | Hotel: verify vaccination card before approval | BT hotel tests | correct | Add: approval assigns/keeps room; full room blocks approval | Medium | revise |
| — | Boarding lifecycle (Check In / Ready for Pickup / Check Out / Care Logs) | `ReceptionistHotelBookings.jsx` buttons + routes | **missing** | New subsection §5.2 | High | add |
| 5.2 | Walk-ins: create + approve → cashier cash | `WalkInController`, P9 J4 | incomplete | Add: "Recent Walk-in Bookings" list + "Open … list" links | Medium | revise |
| 6 | Cashier sidebar | `CashierSidebar.jsx` — match | correct | none | — | keep |
| 6.1 | Verify / Collect Payment / Collect Cash / Reject + View Proof; cash only walk-in or rejected-proof online | `PaymentApprovals.jsx:622`, BT channel tests | incomplete | Add: counter collection may record GCash/Maya with reference (BT); add: rejected proof leaves queue until resubmitted (AGENTS.md) | Medium | revise |
| 6.2 | POS tabs, Walk-in Customer, complete sale → receipt | `CashierPOS.jsx`, BT insufficient-cash, v02 sale+void | correct | Add: insufficient cash blocked before submit (BT); receipt has clinic logo (Revision B) | Low | revise |
| 7 | Inventory sidebar incl. **Controlled Drugs** | `InventorySidebar.jsx:33` | outdated | Add Controlled Drugs to list + new §7.4 | High | revise |
| 7.1 | Search/filter incl. In/Low/Out of Stock; View Info; History | `UnifiedInventory.jsx` | correct | none | — | keep |
| 7.2 | Adjust Stock can't add — use batch receiving | adjust tests (v02), P9 J6 (over-stock → 422) | correct | Add: adjustments above set limits go to **manager approval** (Invoice Approvals) | Medium | revise |
| 7.3 | Suppliers/Barcode/Audits | routes/pages | correct | Add: audit variances go to manager approval (SRC) | Low | revise |
| 8 | Vet sidebar | `VeterinarySidebar.jsx` — match | correct | none | — | keep |
| 8.1 | Start Consultation → record → Save Draft / Finalize & Review Bill → auto-close after payment | `VetConsultation.jsx` confirmed + BT billing flow | correct | Add: finalized record takes dated corrections (source comment) | Low | keep + minor |
| — | Dispensations, confinements, vaccination certificate/recall | routes + `DispensationController` | **missing** | Brief mention in §8.2 | Low | add |
| 9 | Manager sidebar | `ManagerSidebar.jsx` | outdated | Add **Invoice Approvals, Receipt Scanner, Controlled Drugs** | High | revise |
| 9.2 | Attendance/day-offs/leave review | v02 chain3/4 | correct | none | — | keep |
| 9.3 | Payroll create/calculate/review/release; other HR pages listed | payroll lifecycle (v02); computation route exists | correct | Keep "some pages under preparation" honesty note | — | keep |
| — | Invoice Approvals detail | `ManagerInvoiceApprovals.jsx` | **missing** | New §9.4: approve stock adjustments + audit variances | High | add |
| 10 | Admin sidebar incl. Operations Hub | `AdminSidebar.jsx` — match | correct | none | — | keep |
| 10.1 | Manage/Create User, 8 roles, welcome email set-password link | `Admin/UserController` + BT welcome test | correct | none | — | keep |
| 11 | SR composite, mirrors §5–§7 | sidebar + routes | correct | none | — | keep |
| 12.1 | My Payroll/My Attendance/My Leave | v02 + BT | correct | none | — | keep |
| 12.2 | Kiosk PIN → punch; completed day blocks more | v02 chain4 | correct | none | — | keep |
| 13 | No Payroll role | CreateUser 8 roles; backend validation | correct | none | — | keep |
| 14 | Booking flow narrative | BT + P9 | correct | Add boarding lifecycle + unique-reference beats | Low | revise |
| 15 | Troubleshooting table | — | incomplete | Add rows: reused payment reference rejected; oversized/wrong-type pet photo; approval double-click safe | Medium | revise |
| 17 | 18-figure list | all 18 files exist; still UI-accurate (sidebars labels unchanged; text color changed to black — cosmetic) | correct | Re-capture only if school requires current styling | Low | keep |
| 18 | Glossary | — | incomplete | Add: vaccination card, walk-in vs online already there; add "controlled drug register"? optional | Low | minor |
| — | Landing-page boarding rooms | feature **removed** in HEAD `3e75be0` | absent (correct) | Confirm NOT documented anywhere — it isn't | — | verified absent |

## Failed-check dispositions (mocked Playwright run today)

| Spec | Failure cause | App defect? |
|---|---|---|
| `revision-b-confirmed-flows` — landing rooms | Feature **deliberately removed** in `3e75be0` | No — spec stale |
| same — walk-in recent card | Spec selector `.walkins-recent-card`; current JSX renders `.recent-item` under "Recent Walk-in Bookings" | No — spec stale |
| same — boarding approval cancel/confirm | Fixture `check_in=2026-10-21` filtered out of default date range on 2026-10-25; confirmation dialog confirmed in source (`ReceptionistHotelBookings.jsx:332` etc.) | No — fixture drift |
| `customer-add-pet-modal` — rejects unsupported/oversized | Spec expects 5 MB + old error text; current = 10 MB + new text (`CustomerPets.jsx:38,464`) | No — spec stale |

Recommendation: do not fix app code for these; optionally update the stale specs in a future test-maintenance pass (recorded as an outstanding issue — app behavior is documented correctly from source).
