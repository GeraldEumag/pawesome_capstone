# Cashier / Payment / POS Integration Audit

**Date:** 2026-11-17

## Source-of-truth model

- `sales` — transaction header (POS or service sale); `sale_items` — lines (product/service, qty, unit_price, discount, total).
- `payments` — tender records linked `sale_id` (method, amount, change, status, paid_at).
- `payment_settlements(+_items)` — verified customer-payment groupings; `payment_references` — normalized reference uniqueness guard; `payment_receipts` — issued receipts; `receipt_extractions` — scanned-proof OCR.
- `service_billing_payment_requests(+_items)` — pending service-bill requests feeding verification.
- `visit_invoices(+_lines,+_adjustments)` — veterinary-side invoices; `invoices` — legacy/request invoices.

## Verified behavior

| Check | Evidence | Result |
| --- | --- | --- |
| Payment submit → pending → verify/reject | `PaymentReferenceGuard`, `PaymentBookingChannelTest`, e2e `phase4-payment-workflow` | PASS |
| Duplicate reference → 422 | across all 4 proof flows | PASS |
| Rejected→counter/resubmit | verified in matrix | PASS |
| Receipt generation | `PaymentReceiptMail` + receipt endpoints; `receipt-pdf-regression` e2e | PASS |
| POS server-authoritative pricing | client-manipulated price ignored (P1 test) | PASS |
| Cash floor / insufficient cash → reject | BT + P9 tests | PASS |
| Idempotent submit (no double charge) | `IdempotencyKey` serialized on user row | PASS |
| Customer can't self-approve | cashier `EnsureRole`; customer→verify 403 | PASS |
| Receptionist can't verify | `EnsureRole` | PASS |
| Rejection reason preserved | `rejected_by/at/rejection_reason` columns + tests | PASS |
| Payment proof validation | private disk, image validated, retained on replace/reject (`StorageLifecycleTest`) | PASS |
| Transactional boundaries | billing services use transactions + row locks (verified in architecture audit) | PASS |
| Refund/void | sale void recorded, preserves history | PASS |

## Currency

All cashier/POS/payment displays consolidated onto `formatCurrency()` this phase (CashierPOS, PaymentApprovals, CashierPaymentVerification, PaymentUploadModal, usePaymentApprovals); `-₱500.00` negative form corrected.
