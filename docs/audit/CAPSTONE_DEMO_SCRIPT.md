# Capstone Demonstration Script

**Date:** 2026-11-17 · **Stack:** frontend `http://localhost:3000` · backend `http://localhost:8000` · DB `pawesome`
**Format:** one continuous narrative — a customer journey that exercises every role and module. Total runtime ~25–30 min.

## Pre-demo checklist (run 15 min before)

- [ ] XAMPP MySQL running; `php artisan serve` on :8000; `npm run dev` on :3000
- [ ] `curl http://127.0.0.1:8000/api/health` → 200
- [ ] Browser profile with NO saved logins; zoom 100%; close unused tabs
- [ ] All 8 demo accounts verified (see `CAPSTONE_DEMO_READINESS_REPORT.md` §accounts)
- [ ] Optional: pre-stage one pet + one pending booking per workflow so waits stay short

## Credentials

| Role | Email | Password |
| --- | --- | --- |
| customer | customer@example.com | Password123! |
| receptionist | receptionist@example.com | Password123! |
| veterinary | vet@example.com | Password123! |
| cashier | cashier@example.com | password123 |
| inventory | inventory@example.com | Password123! |
| manager | manager@example.com | password123 |
| admin | admin@example.com | Password123! |
| super_receptionist | super_receptionist@example.com | Password123! |

---

## Act 1 — Customer (5 min) `/customer/*`

1. Login → **dashboard** — show peso formatting, pets, upcoming bookings, notifications.
2. **Pets** → register/view a pet; show vaccination card upload (required for hotel).
3. **Book veterinary appointment** (`/customer/bookings/veterinary`) — pick service, date/time from availability, submit → status `pending`.
4. **Book boarding/hotel** (`/customer/bookings/hotel`) — show vaccination-card gate: booking is blocked without a verified card.
5. **Notifications + chatbot** — FAQ answer, then live-chat handoff.

**Say:** "Everything a customer does lands as a pending request — nothing mutates staff state until a role approves it."

## Act 2 — Receptionist (5 min) `/receptionist/*`

1. Login → **requests/appointments** — the customer's new booking is visible in the pending queue (49 pending requests exist in dev data).
2. **Approve** the vet appointment → assign schedule; show slot occupancy update.
3. **Boarding approvals** — show the vaccination-card verified state; attempt approval on an unverified booking → blocked (real guard, browser-verified).
4. **Walk-in / POS-adjacent intake** — create a walk-in customer or appointment if time permits.
5. **Rooms** — show boarding room availability grid (7 rooms, 51 boarding records).

**Say:** "Receptionist is the gatekeeper — approvals write real state that downstream roles consume."

## Act 3 — Veterinary (4 min) `/veterinary/*`

1. Login → **appointments** → open the approved appointment → `/veterinary/appointments/:id/consult`.
2. Record consultation notes, diagnosis, prescription; order a diagnostic test.
3. Show **medical-confinements** + vaccination/MAR records (module exists; confinement payment proof flows to cashier).
4. Complete the visit → billing intent generated for cashier.

## Act 4 — Cashier (4 min) `/cashier/*`

1. Login → **payment-verification** — show the verify/reject queue.
2. Open the vet billing / confinement proof → **verify** → status flips to paid; customer sees it instantly (E2E-verified round trip).
3. Show **reject** path on a second proof → customer can re-upload.
4. **POS** (`/cashier/pos`) — sell an inventory item → stock decrements, sale + payment records created atomically.
5. **Receipt** — peso formatting on-screen; mention PDF shows `PHP` (jsPDF font limit — documented exception).

## Act 5 — Inventory (3 min) `/inventory/*`

1. Login → **stock** — 843 items, batch/FEFO view; the POS sale just reduced stock.
2. **Monthly audit** (`/inventory/audit`) — enter a physical count with a variance → discrepancy flagged, reconciled.
3. **History + expiry alerts** — movement ledger, batch traceability.

## Act 6 — Manager (4 min) `/manager/*`

1. Login → **payroll** — generate payroll for an employee with attendance → server computes gross/deductions/net (₱, authoritative — attendance is NOT double-charged).
2. Show **unlinked/manual row** → creator self-approve is rejected (422) → second manager/admin approves → release → payslip.
3. **Reports** — payroll, sales, attendance; export shows the same ₱ data as the UI.
4. **Salary loans / leaves / day-offs / 13th-month** — point at the HR module breadth.

## Act 7 — Admin (2 min) `/admin/*`

1. Login → **dashboard** → **users** → role management; **activity-logs** (492 entries).
2. Show admin reaches every staff module but **cannot** enter `/customer` portal (blocked → redirect).
3. **Reports** — cross-module analytics; `formatCurrency` throughout.

## Closer (1 min)

- Re-login as customer → the approved appointment, verified payment, and notification are all visible — the loop is closed across 7 roles in one data pass.

**Landing/registration beats (if panel asks):** registration validation messages, landing z-index/carousel, chatbot FAQ — all E2E-verified.

## What NOT to demo / claim

- Customer product checkout — deliberately disabled (410). Say: "Checkout was descoped; payments flow through service billing + POS."
- Live deployment, real email delivery, real payment gateway — local/demo only.
- If asked about `payroll` role: enum exists but is unused; `manager` is the operational payroll role by design.
