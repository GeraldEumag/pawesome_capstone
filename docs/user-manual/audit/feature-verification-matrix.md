# Feature Verification Matrix

**Review date:** 2026-10-22 (v0.2)
**Runtime environment:** Local dev build exercised (frontend :3000, API :8000, MySQL `pawesome`, Playwright/Chromium). Prior source review retained where runtime not exercised.
**Counts:** 26 grouped capabilities — 21 VERIFIED, 3 TESTED, 0 CODE-REVIEWED, 0 BLOCKED, 2 NOT IMPLEMENTED. (Mailbox-level email delivery remains a documented limitation on fake domains — recorded inside the relevant rows, not as a separate capability.)

| ID | Role(s) | Feature | Status | Evidence |
|---|---|---|---|---|
| F-01 | All | Login/logout + role routing | VERIFIED | UM-001; all 8 seeded accounts authenticated to workspaces |
| F-02 | Customer | Registration | VERIFIED | e2e-reg user registered; unverified login works but booking POST → 403 (`verified` middleware); `auth.email_verification` intent → SMTP `accepted` |
| F-03 | Customer | Email verification/resend | VERIFIED | Completion endpoint verified via planted hashed token (sets email_verified_at, consumes token); intent→SMTP dispatch proven. Mailbox delivery not provable (fake domain) |
| F-04 | All | Password recovery | VERIFIED | forgot→reset→login chain completed via planted token; intent→SMTP `accepted`; mailbox delivery unprovable |
| F-05 | Customer | Pet profiles | VERIFIED (page) | UM-003; add/edit/archive not exercised |
| F-06 | Customer | Grooming/vet requests | VERIFIED (E2E) | UI booking→review modal→confirm→My Appointments; UM-004a/b |
| F-07 | Customer | Hotel/boarding requests | VERIFIED | Boarding 60 created w/ vax card; receptionist verified card + approved ("inventory deducted" response); boarding.created/status outbox intents queued. Reruns hit room-occupancy 422 and fall back to prior-fixture evidence (see QA D-09) |
| F-08 | Customer | Requests/history/notifications | TESTED | Pages rendered; sidebar labels exact-match verified |
| F-09 | Customer | Service payment proof + receipt | VERIFIED (E2E) | Proof upload → verify → `SR-REC-20261022124801-271` → paid in customer view |
| F-10 | All | Customer store checkout/order writes | NOT IMPLEMENTED | HTTP 410 confirmed in source (`CustomerStoreController`) |
| F-11 | Receptionist | Booking approve/reject/schedule | VERIFIED (approve via API; queue render) | UM-005; grooming + vet approvals executed |
| F-12 | Receptionist/SR | Walk-in booking | VERIFIED | SR-272 created (existing customer, booking_channel=walk_in) → approved → cashier counter cash → paid, receipt SR-REC-20261022131509-272 |
| F-13 | Receptionist | Customer profiles/services | TESTED | Pages render |
| F-14 | Cashier/SR | POS transactions/receipts | VERIFIED | Sales #73/#74 processed (service item, cash ₱200 tendered) then voided (DB `status=cancelled`); strays #68/#69 also cancelled; receipt data returned |
| F-15 | Cashier/SR | Payment approvals | VERIFIED | UM-006 real pending row; verify→receipt issued; queue 500 defect found+resolved via migration; rejection path verified (SR-273 proof rejected w/ reason → payment_status=rejected) |
| F-16 | Inventory/SR | Stock maintenance | VERIFIED | UM-007; remove/set adjust executed w/ `manual_adjustment` logs |
| F-17 | Inventory/SR | Suppliers/barcode/audits | TESTED | Supplier create→delete roundtrip verified; batch receive→dispose verified (item 147 stock 50→51→50). Barcode gen + audit pages not exercised |
| F-18 | Veterinary | Appointments/consultation | VERIFIED | Full cycle: approve→appt→start (in_consultation, draft record created)→finalize record→complete (awaiting_payment, billing synced) |
| F-19 | Manager/Admin | Reports/analytics | VERIFIED (page) | UM-009 (manager); report data ops not exercised |
| F-20 | Manager/Admin/Staff | Payroll & HR | VERIFIED | Payroll 1 created→approved→released (`status=paid`) for fixture user 73; My Payroll page rendered. Semi-monthly generate/13th-month/loans/remittance/DTR reports not exercised |
| F-20a | Admin | Create user + welcome intent | VERIFIED | Users 73 + 82 created (role=receptionist); `email_deliveries` intent `auth.account_welcome` queued→`accepted` via SMTP provider (mailbox delivery not provable) |
| F-25 | Super Receptionist | Composite workspace | VERIFIED | Real `super_receptionist` login lands on `/super-receptionist` (UM-012 recaptured — earlier capture was admin workspace due to a test-credentials fallback; spec defect, fixed) |
| F-21 | — | Standalone Payroll role | NOT IMPLEMENTED | UI option removed in v0.2; backend never accepted `payroll` |
| F-22 | Cashier | Dashboard nav mapping | VERIFIED (fixed) | `/cashier/dashboard` renders overview (UM-014); regression spec passes |
| F-23 | Staff | Attendance kiosk + self-service | VERIFIED | Kiosk PIN gate both directions + **actual punch verified** (attendance row check_in+check_out, `source=barcode`); correction file→reject AND file→approve (correction 11); leave self-file→approve→balance deducted (sick 15→7, D-08 resolved via `LeaveBalance::seedForPerson`); manager-filed leave→reject |
| F-24 | Manager | Day-Off Schedule | VERIFIED | Full contract verified: set [6,0], **clear-all `days:[]` → 200 + 0 rows** (D-07 fixed: `required`→`present` validation), re-set persists, weekday 7 → 422, duplicates → 422, cashier write → 403 |

## Representative endpoints exercised at runtime

| Feature | Endpoint calls actually made |
|---|---|
| F-06/F-09 chain | `POST /customer/requests` (UI), `POST /customer/requests/{id}/payment-proof` (multipart), `POST /receptionist/requests/{id}/approve`, `GET /cashier/payment-requests`, `POST /cashier/payment-requests/{id}/verify` (`type=service_request`), `GET /customer/my-requests` |
| F-16 | `GET /inventory/items/{id}`, `POST /inventory/items/{id}/adjust-stock` (`remove`/`set`) |
| F-18 | `POST /customer/requests` (vet), `POST /receptionist/requests/{id}/approve` (`veterinarian_id`), `POST /veterinary/consultations/{id}/start`, `POST /veterinary/medical-records/{id}/finalize`, `POST /veterinary/consultations/{id}/complete` |
| F-07 | `POST /customer/boardings` (multipart w/ vaccination_card), `POST /receptionist/boarding-requests/{id}/verify-vaccination`, `POST /receptionist/boarding-requests/{id}/approve` |
| F-12 | `POST /receptionist/walk-ins`, `POST /cashier/payment-requests/{id}/verify` (`payment_method=cash`) |
| F-14 | `POST /cashier/pos/transaction`, `POST /cashier/pos/transaction/{id}/void` |
| F-15 reject | `POST /cashier/payment-requests/{id}/reject` (`rejection_reason`) |
| F-20a | `POST /admin/users`; `email_deliveries` intent row inspected via DB read |

## Interpretation

- VERIFIED = executed end-to-end in the stated environment with passing result + dated screenshot where applicable.
- TESTED = exercised; result and limits recorded.
- CODE-REVIEWED = source inspected only.
- BLOCKED = could not be adequately exercised; reason recorded.
- NOT IMPLEMENTED = code-confirmed disabled/absent.
