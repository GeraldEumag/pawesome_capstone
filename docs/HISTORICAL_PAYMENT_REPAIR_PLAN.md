# Historical Payment Repair Plan

Status: **PARTIALLY EXECUTED** — Boarding #2 repair approved and committed
(see Execution Log). All other records frozen pending external GCash
verification. Every remaining action requires explicit approval before
execution.

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

---

# Execution Log & Provenance Findings (2026-10-05/06)

## P.2 — Boarding #2 repair: EXECUTED AND COMMITTED

Approved narrow repair ran via canonical
`ServiceBillingService::markBaseServiceAsPaid('boarding', 2)` in one
transaction on production:

- `base_service` SIU#9 created: ₱800, `is_paid=1`, "Large Kennel stay"
- `amount_paid` 0 → ₱800; `balance_due` ₱0; `payment_status` `paid`
- Settlement #1 preserved byte-identical (no new settlement/receipt)
- Revenue unchanged: ₱2,000 → ₱2,000 (delta ₱0)
- Idempotency verified on second run; unrelated records fingerprinted
  unchanged (boarding #1, appointment #2, grooming #7, SR #8/#9)
- Disclosed side effect: `boardings.paid_at` refreshed to repair time
  (`syncServicePaymentState` stamps `paid_at` on paid records); the
  authoritative event time lives on `payment_settlements.paid_at`
  (`2026-10-05 18:01:58`, untouched)

## P.3 — Boarding #1 deeper evidence

- `activity_logs#10`: `payment_verified` by user 5
  (`super_receptionist@example.com`), `pending→paid`, metadata
  `{GCash, BD-REC-…-1, ref 12355678}`, 2026-09-25 22:31:57
- `payment_proof` file EXISTS on private disk — real JPEG (300 KB, EXIF
  Android RMX3636 — same device fingerprint as the session user-agent)
- `payment_reference` `29462936389491` (GCash-shaped)
- Missing settlement explained structurally: `payment_settlements` table
  was created 2026-10-05; the payment was verified 2026-09-25 — the ledger
  did not exist yet. Same explanation covers appointment #2 (₱500) and
  grooming #7 (₱950), both paid Sep 25.

## P.4 — Classification: likely TEST/DEMO (not proven unpaid)

- Pet `STORAGE_TEST Pet 1790298309154` matches
  `frontend/e2e/storage-hardening.spec.js` convention
  (`STORAGE_TEST Pet ${Date.now()}`); embedded timestamp = pet `created_at`.
- Customer `customer@example.com` and actor `super_receptionist@example.com`
  are seeded accounts; user 5's entire activity history is test actions.
- Boarding #1 completed ~16 min after creation — before its own stay
  dates (Sep 26–27).
- Sibling records from the same 22:25–22:53 session: SR #8→grooming #7,
  SR #9→appointment #2 (both `paid`), SR #7 rejected, appointment #1
  cancelled.
- Counter-evidence: the proof image is a real phone JPEG (not the spec's
  test PNG), so a real GCash transfer during a live demo cannot be ruled
  out.

## P.5 — Revenue integrity (read-only replication of RevenueService)

| Leg | Rows | Amount |
|---|---|---|
| sales / orders / confinements / partial settlements | 0 | ₱0 |
| service_requests | 0 | ₱0 (SR#8/#9 excluded via linkage) |
| boardings | 2 | ₱2,000 |
| appointments | 1 | ₱500 |
| groomings | 1 | ₱950 |
| **Total** | | **₱3,450** |

- ₱2,650 of ₱3,450 (77%) traces to the Sep 25 test session.
- ₱800 (boarding #2) is genuinely attributed.
- No double counting; sales/payments/invoices ledgers are empty and
  consistent; cashier history inputs agree.
- No test/demo provenance mechanism exists in the schema.

## P.5.1 — Decision: FROZEN pending external GCash verification

The app proves the transactions were *recorded as* paid; only the
business's GCash history can prove money moved. All production state is
frozen — no marking, no exclusion, no settlement backfill.

### Client verification checklist

Ask the business to check GCash transaction history for **2026-09-25
evening (~22:30–22:55 PHT)**:

| Record | Amount | Payment reference | Receipt no. |
|---|---|---|---|
| Boarding #1 | ₱1,200 | `29462936389491` / `12355678` | BD-REC-20260925223157-1 |
| Grooming #7 (via SR #8) | ₱950 | `123578482` | SR-REC-20260925224358-8 |
| Appointment #2 (via SR #9) | ₱500 | `123456` | SR-REC-20260925225220-9 |

Also check 2026-10-05 ~18:01 for boarding #2 ref `12389200`/`1512632`
(₱800) — already ledger-proven, useful as a control.

### Outcome mapping

- **All confirmed** → RETAIN all three records as-is (Scenario A).
- **Partially confirmed** → STOP; retain confirmed, flag only the
  unverified subset (Scenario B).
- **Confirmed test/demo, no real payment** → Scenario C: approval-gated
  reversible exclusion via a `report_exclusions` table (preserves records
  and audit trail; `RevenueService` skips actively-excluded rows; lifting
  an exclusion restores the amount). Design documented; NOT implemented.
