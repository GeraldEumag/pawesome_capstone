# Historical Payment Repair Plan

Status: **DRAFT — no production data has been modified.** Every action below
requires explicit approval before execution.

## Background

A billing-integrity audit found that service payment state was historically
split across three writers:

1. `service_item_usages` + `payment_settlements` (canonical path, via
   `PaymentVerificationService` / `ServiceBillingService`).
2. Legacy direct-column writers (`AppointmentController::markAsPaid`,
   `BoardingController::markAsPaid`, SR-linked cascades) that set
   `payment_status = 'paid'` without settlements and without syncing
   `amount_paid`/`balance_due`.
3. `service_requests`-linked flows that pay the request and cascade to the
   linked service record.

Because boardings frequently had no `base_service` item, several paid
boardings were never synced to consistent `amount_paid`/`balance_due`
values, and some were paid without a settlement row.

## Production evidence (Railway `pawesome`, read via read-only script, 2026-10-xx)

### Boarding #2

| Field | Value |
|---|---|
| status | `in_care` |
| payment_status | `paid` |
| total_amount | ₱800.00 |
| amount_paid | ₱0.00 |
| balance_due | ₱0.00 |
| receipt_number | BD-REC-20261005180158-2 |
| settlement | `payment_settlements#1` — boarding/2, ₱800, gcash, paid, key `verify:boarding:2:…` |
| base billing item | **missing** |

Recommended repair (non-destructive, after approval):

```text
ensureBaseServiceItem('boarding', 2)
    → creates base_service ₱800, is_paid = true (record is paid)
syncServicePaymentState('boarding', 2)
    → amount_paid = 800, balance_due = 0, payment_status = paid
```

Risk: low — the settlement proves the ₱800 payment; the repair only aligns
derived columns and adds the missing itemized row. Does not create a new
settlement or duplicate revenue (the boarding leg already counts it).

### Boarding #1

| Field | Value |
|---|---|
| status | `completed` |
| payment_status | `paid` |
| total_amount | ₱1,200.00 |
| amount_paid | ₱0.00 |
| receipt_number | BD-REC-20260925223157-1 |
| settlement | **none** |
| base billing item | **missing** |

Classification: **legacy payment record** — paid before the settlement
ledger path existed/was used. A receipt number exists but no durable
settlement row proves the payment event in the ledger.

Recommended repair (requires approval — adds a ledger record):

```text
Option A (minimal, recommended):
    ensureBaseServiceItem + sync only → aligns columns/items,
    but does NOT fabricate a settlement for a payment we cannot re-verify.

Option B (full):
    record a backfill settlement keyed `backfill:boarding:1` with
    amount 1200 and payment_method 'legacy' — only if finance
    confirms the ₱1,200 was actually received. Do NOT do this
    automatically; inventing a settlement asserts money moved.
```

## Local DB (`pawesome`, dev) — same legacy signature

- Boardings 34–38: `paid`, `amount_paid = 0`, receipt present, no
  settlement, no base item — legacy `markAsPaid` output.
- SR-created boardings (5, 11, 12, 13, 18, 19, 20, 27, 30, 39): no base
  item; `payment_status = unpaid`. With the fix, the first billing touch
  self-heals via `ensureBaseServiceItem` (boarding 39 has total ₱0 — no
  item is created for a zero-amount record by design).
- `service_item_usages#19` predates `boardings#10` — created by a repo-root
  debug script (`debug_*.php` / `comprehensive_billing_test.php` run
  against the dev DB). Local-only pollution; not present in production
  (prod boarding SIU count = 0).

## What is NOT repaired automatically

- `amount_paid` on legacy-paid records (boarding 1 prod; 34–38 local).
- Missing settlements for legacy payments (boarding 1).
- `service_item_usages` rows keyed to `service_request.id` (the
  `ServiceRequestController` approval branch that wrote
  `service_id = serviceRequest->id` is dead code — not routed — so no
  such rows exist in production; none were found locally either).

## Verification queries (read-only)

```sql
-- Paid records with inconsistent paid amount
SELECT id, payment_status, total_amount, amount_paid, balance_due
FROM boardings
WHERE payment_status='paid' AND amount_paid <> total_amount;

-- Paid services with no settlement
SELECT b.id FROM boardings b
WHERE b.payment_status='paid' AND NOT EXISTS (
  SELECT 1 FROM payment_settlements p
  WHERE p.settleable_type='boarding' AND p.settleable_id=b.id AND p.status='paid');

-- Orphaned billing items
SELECT s.id, s.service_type, s.service_id FROM service_item_usages s
LEFT JOIN boardings b ON s.service_type='boarding' AND b.id=s.service_id
WHERE s.service_type='boarding' AND b.id IS NULL;
```
