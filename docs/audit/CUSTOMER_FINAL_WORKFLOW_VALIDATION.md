# Customer Role — Final Workflow Validation (Phase 3, 5, 6, 7)

**Date:** 2026-11-18 · All checks on the live audit stack; persistence confirmed by SQL, not just API responses.

## Service workflows — PASS

| Flow | Evidence |
| --- | --- |
| **Veterinary** | SR8: submit→pending → receptionist approve (422 without `veterinarian_id`; 200 with id 7) → `appointments` id=1 `scheduled`/`scheduled_at` → vet queue lists it → customer `my-requests`/`appointments` show it → `New Appointment Assigned` notification to user 7. Medical history stays owner+staff-scoped. |
| **Grooming** | SR5 + linked `groomings` id=4 synchronized through approve→pay→verify; SR11 **fresh re-verified this session**: submit→approve→maya proof→cashier verify→`paid`,`verified_by=5`, receipt `SR-REC-20261118203254-11` (₱350 → net 312.50 + VAT 37.50). |
| **Boarding** | Boarding 2: vacc-card private upload → receptionist vacc verify → approve requires room → `boarding_room_reservations` transactional insert → check-in gates (unpaid + wrong date both blocked) → `BD-REC-…` receipt ₱500 → net 446.43 + VAT 53.57. Overlap protection is **capacity-aware** (`total_rooms`); current occupancy 2/5 on 2027-02-16 — legal, not a conflict. |

## Payments — PASS
pending/proof state, cashier queue, verify→`paid`+receipt+VAT breakdown, reject→resubmit evidence retained, channel rules enforced, no customer path to `paid`, receipts readable via `customer/receipts/{service_request,boarding}/{id}` with scanner `manual_entry` fallback for unparseable proofs.

## Email & notifications — PASS (with honest depth accounting)

- 32 `email_deliveries` rows: **all `status=accepted`, `attempts=1`, `delivered_at` NULL, 0 failures, `failed_jobs` empty**.
- Real Brevo SMTP sends — provider **accepted** ≠ inbox **delivered**. Webhook endpoint `POST /api/webhooks/brevo` fully implemented (secret+`hash_equals`, event reconciliation, hard_bounce/spam → `EmailSuppression`) but unreachable from Brevo to localhost — `delivered_at` remains a deployment-verified item.
- SPF/DKIM/DMARC: **cannot exist without a real sending domain** — documented requirement, deployment-gated.
- In-app notifications: fan-out verified (customer + cashier pool + vet), unread counts accurate (44 unread for customer 9), read/clear endpoints exercised in e2e; no cross-customer rows observed.
- Notification preferences: opt-out honored at intent + send time (suppression checks stored).

## Frontend — PASS
Vitest 44/44; `vite build` green; all customer e2e specs green (serial-verified). Responsive layouts, loading/empty states, currency (₱ + VAT breakdown), timezone-consistent dates (Asia/Shanghai stack), no critical console errors in passing specs. No visual design changes made.

## Playwright strategy honored
API-driven verification preferred; serial browser re-run used only where needed (6/6 bookings-board spec after one Windows socket flake under 2 workers). No large-suite repeat executions.
