# Reports Module — Database Reconciliation

**Date:** 2026-11-18
**Method:** Every headline metric independently recomputed with ground-truth SQL
and compared to the API response. Dev DB `pawesome` (API :8000) for baseline;
isolated `pawesome_reports_audit` (API :8001) for mutation workflows.

## 1. Metric definitions (independent of application code)

```sql
-- Canonical collected revenue (all paid legs)
SELECT 'pos' src, COALESCE(SUM(amount),0) v FROM sales
 WHERE type NOT IN ('refund','multi_payment','appointment')
   AND status NOT IN ('voided','cancelled')
UNION ALL
SELECT 'orders', COALESCE(SUM(total_amount),0) FROM customer_orders
 WHERE payment_status IN ('paid','verified','completed')
UNION ALL
SELECT 'service_requests', COALESCE(SUM(total_amount),0) FROM service_requests sr
 WHERE sr.payment_status IN ('paid','verified','completed')
   AND NOT EXISTS (SELECT 1 FROM boardings b   WHERE b.service_request_id = sr.id)
   AND NOT EXISTS (SELECT 1 FROM groomings g   WHERE g.service_request_id = sr.id)
   AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.service_request_id = sr.id)
UNION ALL
SELECT 'boardings',    COALESCE(SUM(total_amount),0) FROM boardings
 WHERE payment_status IN ('paid','verified','completed')
UNION ALL
SELECT 'confinements', COALESCE(SUM(COALESCE(final_amount,estimated_cost,total_amount)),0)
 FROM medical_confinements WHERE payment_status IN ('paid','verified','completed')
UNION ALL
SELECT 'appointments', COALESCE(SUM(COALESCE(total_amount,price)),0) FROM appointments
 WHERE payment_status IN ('paid','verified','completed')
UNION ALL
SELECT 'groomings',    COALESCE(SUM(COALESCE(total_amount,amount,price)),0) FROM groomings
 WHERE payment_status IN ('paid','verified','completed');

-- Canonical low stock
SELECT COUNT(*) FROM inventory_items
 WHERE status='active' AND archived_at IS NULL AND stock <= reorder_level;

-- Service volume (deduped unified ledger)
SELECT (SELECT COUNT(*) FROM service_requests sr WHERE NOT EXISTS
          (SELECT 1 FROM boardings b WHERE b.service_request_id=sr.id)
          AND NOT EXISTS (SELECT 1 FROM groomings g WHERE g.service_request_id=sr.id)
          AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.service_request_id=sr.id))
     + (SELECT COUNT(*) FROM appointments)
     + (SELECT COUNT(*) FROM boardings)
     + (SELECT COUNT(*) FROM groomings)
     + (SELECT COUNT(*) FROM medical_confinements) AS total_services;
```

## 2. Dev-DB baseline (`pawesome`, verified live)

| Metric | Ground-truth SQL | API | Status |
| --- | --- | --- | --- |
| Unified revenue | 62,225 = 23,090 POS + 0 orders + 1,500 SR + 17,000 boarding + 0 conf + 4,935 appt + 15,700 groom | `unifiedRevenue` 62,225 | PASS |
| Sales report revenue | 23,090 (32 completed rows; 16 cancelled ₱13,800 excluded) | 23,090 (was 36,890 pre-fix) | PASS (fixed R-01) |
| Overview trend | RevenueService daily legs | uses RevenueService::daily (was raw sale sums incl. a cancelled ₱900 row) | PASS (fixed R-02) |
| Services count | 305 = 20 SR + 69 appt + 51 boarding + 2 conf + 163 grooming | `total_requests` 305, `by source` incl. grooming | PASS (fixed R-03/R-07) |
| Exec low stock | 269 canonical | 269 (was 725) | PASS (fixed R-08) |
| Orders report | 71 rows (48 sales + 23 customer_orders), revenue 23,090 paid-only | 23,090 | PASS (fixed R-15) |
| Customer payments | cust8 ₱1,350 POS payments (sales.customer_id=8), cust5 22 unpaid orders → balance ₱19,800 | matches; balance never negative | PASS (fixed R-05) |
| Cashier summary | POS 23,090; verified 14; receipts 7 | identical (full-set counts) | PASS (fixed R-19) |

## 3. Isolated-DB workflow reconciliation (`pawesome_reports_audit`)

| Metric | SQL | API | Status |
| --- | --- | --- | --- |
| Sales revenue after 6 POS sales | 4,580.00 | `sales.total_revenue` 4,580 | PASS |
| Services ledger | boarding + grooming + appointment rows present | sources boarding/grooming/appointment/service_request all listed | PASS |
| Cashier rejected payments | `boardings.payment_status='rejected'` → 1 | `rejected_payments` 1 | PASS |
| Cashier verified payments | `boardings.payment_status='paid'` → 1 + receipt issued | `verified_payments` 1, `receipt_count` 1 | PASS |
| Unified revenue | POS 4,580 + paid boarding 800 | `executive.total_revenue` 5,380 = `cashier.total_revenue` 5,380 | PASS |
| Customers | 1 row (created via API) | `total_customers` 1, row listed | PASS |
| Inventory adjustments | 4 `remove` adjustments → stock_deductions +10 | `manual_adjustments` 4, `stock_deductions` 10 | PASS |

## 4. Integrity checks

| Check | Result |
| --- | --- |
| JOIN multiplication | Payment/status counts now run as separate SQL `COUNT()`s (no join fan-out); service ledger rows are per-source `UNION`-style collections, deduped via `whereNotExists`. PASS |
| Orphaned FKs | `payments.sale_id`, `sales.customer_id`, `customer_orders.customer_id`, `pets.customer_id`, `boardings.room_id` all constrained by real FKs (verified via `SHOW CREATE TABLE`). PASS |
| Invalid statuses | Sales enum limited to (`appointment`,`boarding`,`product`) × (`pending`,`completed`,`cancelled`,`refunded`); boardings payment enum enforced. Data respects enums. PASS |
| Negative stock | Inventory service clamps adjustments at 0; `set` rejected below min via validation. PASS |
| Date boundaries | `whereDate >= from AND <= to` inclusive; E2E same-day transactions visible immediately. PASS |
| Timezone | `created_at` stored app-time; report date filters use `whereDate` on same clock — consistent. Verified same-day POS sale appears in today revenue. |
| Soft deletes | `customers.deleted_at` excluded in counts; inventory archived items excluded from low-stock. PASS |
| Hardcoded analytics | None found — predictive uses real least-squares model; segmentation queries paid orders; alerts evaluate live thresholds. PASS |

## 5. Discrepancies found & resolved

| ID | Discrepancy | Resolution |
| --- | --- | --- |
| R-01 | sales report +₱13,800 (cancelled counted) | fixed; regression test added |
| R-02 | overview trend showed cancelled sale day | fixed via RevenueService::daily |
| R-03/R-07 | 163 groomings invisible; service total inflated 401 vs 305 | grooming added as source; dedup applied |
| R-05 | customer `paid_amount` always 0 | paymentsFor rewritten (POS join + order rows) |
| R-08 | exec low stock 725 vs canonical 269 | aligned to archived-aware helper |
| R-14 | vet revenue 1,585 (completed-status `price` only) vs paid 4,935 | payment_status + COALESCE fix |
| R-19 | cashier KPIs computed on 250-row slice | `paymentStatusCounts()` full-set SQL |
| balance | customer balance could go negative (−1,350) | `max(0, order_total − order_paid)` |

## 6. Verification status

- Dev DB: every baseline metric in §2 re-verified live (curl vs SQL).
- Audit DB: 7/7 scripted reconciliations PASS (`e2e_workflow_audit.py`).
- Remaining unverified: per-day trend bucket-by-bucket diff vs a fully independent
  recomputation of RevenueService daily legs (structurally verified, not row-diffed);
  segmentation tier thresholds reviewed in code but not numerically challenged with
  boundary fixtures.
