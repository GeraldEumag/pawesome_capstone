# Customer Role — Final Security Validation (Phase 2 + 4)

**Date:** 2026-11-18 · **Stack:** `pawesome_customer_audit` live on `:8001`. Baseline: Gate-2 clean (0 P0/P1). This phase re-validates that posture on the live stack after the parallel reports-module changes.

## Authentication — PASS (re-verified live)

| Check | Result |
| --- | --- |
| Registration + hashed verification token + Brevo outbox | verified earlier; `email_deliveries` rows persist |
| Login → token issued; logout → reuse **401** | ✓ |
| Email verify → `email_verified_at` set → bookings unblocked | ✓ |
| Forgot/reset → generic response, hashed `password_reset_tokens` row, `auth.password_reset` delivery | ✓ (token row deleted on email change — intended hygiene) |
| Unauthenticated `/customer/*` | **401** (fresh probe) |
| Inactive-account restriction | `user_active` suppression + auth checks present |

## Authorization — PASS (fresh probes this session)

- Customer A/B → `/admin/users`: **403** (both)
- B on A's pet `/customer/pets/1`: **404**; A on B's pet `/customer/pets/6`: **404**
- Both on own `/customer/pets`: **200**
- Staff→customer-only routes: 403 (bidirectional enforcement shown earlier)
- Store mutation `/customer/store/checkout`: **410** (F-02 intact)

## IDOR — PASS (baseline matrix still valid)

All cross-customer surfaces denied: pets, service requests, appointments, boardings, confinements, payment proofs (owner 200 image/png vs 403), vaccination cards, receipts (staff-only viewer), notifications, live chat (403 on read/write/close). No regression since baseline.

## File security — PASS

MIME-sniff + extension + size validation; private disk; per-owner authorization via `SecureFileController::recordBelongsToCustomer()`; `nosniff` + private no-cache headers; rejected proofs retained (`payment_receipts.status=failed` rows with sha256).

## Financial integrity — PASS (SQL-verified)

| Check | Result |
| --- | --- |
| `service_requests` paid but `verified_by IS NULL` | **0** — every paid row cashier-verified (SR5, SR11 by user 5) |
| `payment_status='pending'` without proof+method | **0** |
| `boardings` paid without verifier | **0** |
| Customer-side reach to `paid` | none — proof→`pending` only |
| Channel downgrade | cashier cash-settle of `online` booking → 422 |
| Fresh chain SR11 | pending→pending(proof)→paid + `SR-REC-…` receipt, VAT net 312.50 on ₱350 |

## Defects found in this phase

**None.** Baseline security posture fully re-verified.
