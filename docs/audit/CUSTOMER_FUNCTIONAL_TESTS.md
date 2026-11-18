# Customer Role — Functional & Cross-Role Tests (Gate 3)

**Audit date:** 2026-11-18 · **Stack:** audit DB + API `:8001` + frontend `:3001` (Brevo SMTP real sends to developer plus-aliases only)

## Workflow results (each verified API-response + DB + staff-visibility)

### 1. Auth lifecycle — PASS
Register (B) → outbox intent + hashed token → `email/verify` → `email_verified_at` set → booking unblocked (unverified probe correctly 403'd before). Login → token issued. Logout → token reuse **401**. `password/forgot` → generic response + `auth.password_reset` delivery accepted + token row created (deleted on subsequent email change — intended). Email change → `email_verified_at` nulled + fresh verification intent.

### 2. Pets — PASS
Create/list/show persist `customer_id=customers.id`; owner-only reads (B→404). Private photo route authorized per owner.

### 3. Veterinary — PASS
Customer submits VetForm → `service_requests` pending. Receptionist approve **requires valid `veterinarian_id`** (422 "Choose a valid veterinarian" without it) → `appointments` scheduled row created atomically → vet queue lists it → customer `my-requests`/`appointments` show `approved`/`scheduled`.

### 4. Grooming — PASS
GroomingForm → `service_requests` + linked `groomings` row. Receptionist approve → `approved`; linked grooming record synchronized (`approved`).

### 5. Boarding/hotel — PASS
Store-hours/date validation (422 outside 10 AM–6 PM). Vaccination-card upload required → private path persisted. Receptionist `verify-vaccination` → `approve` requires `room_id|hotel_room_id` → transactional `boarding_room_reservations` insert + "inventory deducted". Overlap conflict checking present (reservation id=1 Feb-2027 vs id=2 Nov-2026 coexist correctly). Check-in gates: unpaid → blocked; wrong date → blocked. Cancel/reject release covered by baseline tests.

### 6. Payments — PASS
Proof → `pending` → cashier queue → verify → `paid` + `verified_by=5` + VAT-inclusive receipt numbers (`SR-REC-*`, `BD-REC-*`; 12% VAT math exact). Customer receipt endpoint `GET /customer/receipts/{type}/{id}` returns scan status (`manual_entry` for synthetic proof — expected OCR fallback). Reject→resubmit verified via `payment_receipts` evidence rows retained.

### 7. Notifications — PASS
In-app fan-out confirmed in `notifications` table: customer (submission/approval/payment-verified/reservation-update), cashier pool (proof-ready), vet (appointment-assigned). Read/clear endpoints exercised in e2e baseline.

### 8. Email (real Brevo) — PASS
26 `email_deliveries` rows, all `status=accepted`, attempts=1 — includes `auth.email_verification` (B, C plus-aliases), `auth.password_reset`, lifecycle mails (`service_request`, `appointment`, `boarding` sources). `occurrence_key` dedup rows present; suppression checks stored. No email to real customers — recipients limited to `kiezerherristpascua+audit.*` aliases and inert seeded addresses.

### 9. Staff integration — PASS
Receptionist: approve/schedule/vacc-verify/check-in endpoints all live. Cashier: payment queue + verify + channel rules. Veterinary: appointment queue reflects approved SR8. Inventory: boarding approval logged deduction. Live chat: customer start → receptionist claim → staff reply → customer sees staff message.

### 10. Customer tracking/UI — PASS
`GET /customer/tracking` returns live statuses (step_index/status_label) from real rows; `my-requests` shows approved/cancelled/rejected states; `boardings` shows `approved`+`paid`+`room_reservation`. Baseline e2e covered desktop/mobile rendering, no console errors (52/52 after harness fix).

## Cross-role lifecycle summary

```
customer submit → service_requests:pending
 → receptionist approve (+vet assign / +room reserve) → appointments/boarding_room_reservations
 → customer proof → payment_status:pending (+payment_receipts evidence row)
 → cashier verify → paid + receipt + verified_by audit
 → notifications to customer/staff + email_deliveries accepted (Brevo)
 → gated transitions (check-in: paid + scheduled date)
```

Every hop above was observed in `pawesome_customer_audit` rows — not inferred from API responses alone.
