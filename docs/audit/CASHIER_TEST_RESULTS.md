# Cashier Test Results — Execution Evidence

Date: 2026-11-18 · No test marked PASS without execution evidence.

## 1. Backend PHPUnit (MySQL `pawesome_test`)

| Suite | Result |
|---|---|
| Scoped cashier/POS/payment/settlement/billing/outbox (baseline) | **96 passed / 1 skipped** (GD missing — environmental) |
| `CashierDashboardDefectsTest` (new regression, 7 tests / 36 assertions) | **7 passed** |
| Scoped re-run post-fix (Batch3, QueueDedupe, POS, PaymentSettlement, BookingChannel, VetBilling, ReceiptOutbox) | **64 passed / 349 assertions** |
| **Full suite** | **1075 passed / 1 skipped / 5381 assertions / 0 failed** (~6 min) |

New regression coverage (`tests/Feature/CashierDashboardDefectsTest.php`):

1. `dashboard_void_cancels_and_fully_reverses_the_sale` — `/cashier/void` → 200, `status=cancelled`, void metadata, stock restored, payment refunded, invoice cancelled, double-void 400.
2. `dashboard_refund_records_a_negative_ledger_row` — `/cashier/refund` → 200, `amount=-100`, `payment_type='refund'`, valid enum type.
3. `multi_payment_records_a_zero_amount_audit_row` — `/cashier/multi-payment` → 200, ₱0 `payment_type='multi'` row.
4. `transactions_feed_does_not_double_list_linked_service_payments` — linked SR excluded, settlement row present.
5. `unlinked_paid_service_request_still_appears_in_feed` — non-linked SRs unaffected.
6. `overview_excludes_cancelled_sales_from_revenue` — cancelled ₱50 excluded from totals/by-type.
7. `counter_cash_table_payment_records_settlement_method` — settlement `payment_method='cash'` persisted.

## 2. Live mutation matrix (audit stack :8001, `pawesome_cashier_audit`)

| Scenario | Result |
|---|---|
| Payment proof verify (valid reference) | 200; booking + SR mirror + settlement + activity log atomic |
| Double verification | 422 |
| Reject without reason | 422 |
| Reject with reason | 200; resubmission allowed |
| Unapproved record verify | 422 |
| Online unpaid → counter cash | 422 (channel rule) |
| Rejected online proof → counter cash | 200, `payment_method='cash'` (documented fallback) |
| Walk-in counter cash | 200; settlement now records `payment_method='cash'` (post-fix) |
| POS manipulated `unit_price=0.01` on ₱900 item | persisted ₱900 (server-authoritative) |
| Cash sale ₱2,300 / tender ₱2,500 | VAT ₱246.43, change ₱200 |
| Insufficient cash | 422 |
| Oversell quantity / empty cart | 422 |
| GCash sale (no cash amount) | 200 |
| Idempotency replay (`Idempotency-Key`) | same sale returned, no duplicate rows |
| POS void | sale `cancelled`, payment `refunded`, invoice `cancelled`, stock 56→58 once, re-void 400 |
| `/cashier/void` (dashboard) — **pre-fix** | 500 `Data truncated 'status'` → **post-fix 200** |
| `/cashier/refund` — **pre-fix** | 500 `Data truncated 'type'` → **post-fix 200, amount −100.00** |
| `/cashier/multi-payment` — **pre-fix** | 500 `Data truncated 'type'` → **post-fix 200** |
| Transactions feed — **pre-fix** | SERVICE-249 + SETTLEMENT-61 both listed (same ₱500) → **post-fix: settlement only** |
| `POST /boardings/{id}/pay` by cashier | 200 via `PaymentVerificationService::verify` — legitimate, not a bypass |

## 3. Frontend build & e2e (audit stack :3001 → :8001)

| Check | Result |
|---|---|
| `npm run build` | PASS (32.97s) |
| `e2e/cashier-dashboard.spec.js` | **7/7 passed** (login redirect, dashboard, sales display, refresh, nav, verify flow, forbidden pages) |
| `e2e/batch3-cashier-system.spec.js` | **18/18 passed** (all 11 cashier routes open cleanly; cross-role redirects; super_receptionist/admin access; customer blocked) |
| `e2e/live-pos.spec.js` | **4/4 passed** |
| Frontend env | `VITE_API_BASE_URL=http://127.0.0.1:8001/api` verified in served bundle; `USE_MOCK_DATA=false` |

Remaining six specs — executed 2026-11-18 against the audit stack: **15/18 passed, 3 failed** (all three root-caused as test-harness/data defects, none implicate Cashier code):

- `cashier-inventory-workflow` — **passed** (POS sale → inventory logs → manager reports, 1.7m)
- `receipt-pdf-regression` — **3/3 passed** (A4 pagination, veterinary PDF, customer PDF+print)
- `cashier-pos-responsive-audit` — **3/3 passed** (no overflow, 390px checkout, approvals responsive)
- `cashier-responsive-audit` — **3/3 passed**
- `phase4-payment-workflow` — **5/8 passed**; verify/reject/resubmit flows ✓
- `cashier-payment-deep-link` — **failed**: spec calls `POST /api/pets` — that route does not exist (real route `POST /api/customer/pets`). Stale test harness, not an app defect.
- `phase4` vax-card boarding — **failed**: two-layer fixture defect — (a) `beforeEach` seeder runs `php` on `backend/.env` (`DB_DATABASE=pawesome`) so fixtures land in **dev DB**, not the audit clone; (b) the seeded boarding has `booking_channel='walk_in'` and walk-ins legitimately skip online-proof vax gating, so the expected disabled "verify the vaccination card first" button correctly renders as "Approve". Application behavior verified by `PaymentBookingChannelTest` (card-verification gate passes).
- `phase4` chatbot FAQ — **failed**: app answers with placeholder contact `(555) 123-4567`/`info@pawsitive.com`; test expects real contact info. Landing-page content issue, **outside Cashier scope**.

Note: the phase4 seeder upserted `PW-E2E-*` marker rows into `pawesome` (dev) — non-destructive named fixtures by design, but it means the spec is dev-stack-oriented and its `beforeEach` does not honor `E2E_AUDIT_DATABASE`.

## 4. Frontend wiring review

- All cashier pages hit real endpoints (cross-checked vs `route:list`); loading/empty/error states present; double-submit guards on checkout; filters/search/pagination on transactions/history; refresh persistence verified by spec.
- Dead code confirmed unreferenced but **left in place** (P3, per minimal-change scope): `pos.js::generateReceipt` (fake store info + wrong VAT math — never imported), `cashierEndpoints.js` `MOCK_DATA` (flag off), `CashierPaymentVerification.jsx` (unrouted), dead private verify/reject helpers in `DashboardController`/`CashierPaymentController`, `*_Polished.css` files.
