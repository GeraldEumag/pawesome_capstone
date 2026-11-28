# 05 — POS & VAT Audit

## VAT authority

- **Single source of truth:** `App\Support\ReceiptBreakdown::VAT_RATE =
  0.12`, VAT-**inclusive** convention — `vat = gross * 0.12 / 1.12`
  (`ReceiptBreakdown.php:19,53`).
- Verified consistent across:
  - `Cashier\POSController` checkout — server recomputes
    `tax_amount = subtotal * VAT_RATE / (1 + VAT_RATE)` from
    **server-side** prices (`POSController.php:143`); client-supplied
    prices/discounts ignored.
  - `App\Models\Sale::calculateTotals()` — **fixed this audit**: was
    `$subtotal * 0.12` (exclusive-style, double-counting VAT on
    VAT-inclusive prices). Method had zero callers (dead-code trap);
    now uses `ReceiptBreakdown::VAT_RATE` with inclusive math.
  - `App\Support\EmailContent::vatInclusivePortion()` — already inclusive;
    now references `ReceiptBreakdown::VAT_RATE` instead of literal `0.12`.
  - Receipt payload literals `'vat_rate' => 0.12` in
    `Api\ServiceRequestController`, `Cashier\DashboardController` (×2),
    `Customer\CustomerStoreController` — **fixed**: all now emit
    `ReceiptBreakdown::VAT_RATE`.
  - Frontend `CashierPOS.jsx` — `vatAmount = subtotal * 0.12 / (1+0.12)`
    (display estimate only; authoritative values come from the server
    `breakdown` payload rendered by `ReceiptDocument.jsx`).
  - Frontend `api/pos.js::generateReceipt()` — dead code (no callers)
    that used exclusive math and added VAT on top of gross;
    **fixed** to inclusive extraction so the trap is disarmed.

## POS transaction integrity

- `POST /api/cashier/pos/transaction` is behind the **idempotency
  middleware** (`Idempotency-Key` header; `Tests\TestCase` auto-injects
  one for legacy tests) — retry-safe.
- Server-side pricing: item prices re-read from `services`/`inventory`
  inside the transaction; `unit_price`/discounts from the client are
  ignored (verified `POSController` build of `$serverItems`).
- Stock: deduction via `InventoryService::deductStock` under row locks —
  oversell prevented (`PosConcurrentStockTest`).
- `sale_items`, `payments`, `invoices` written in one transaction;
  `WorkflowNotifier` fires post-commit.
- Receipt immutability: receipts render stored `tax_amount`/`total_amount`
  + `ReceiptBreakdown::forSettleable()` snapshot — later price changes do
  not rewrite historical receipts (verified: breakdown persisted on the
  sale/settlement, not recomputed at render).

## Receipt accuracy

- `ReceiptDocument.jsx` renders server-provided `vat_amount`/`net_amount`
  (falls back to subtotal only when both absent) — no client VAT math on
  authoritative receipts.
- `CashierHistory`/`CashierPaymentVerification` prefer
  `breakdown.vat_amount` over legacy `tax`/`vat_amount` fields —
  migration-safe precedence verified.

## Defects fixed

| ID | Severity | Defect | Fix |
| --- | --- | --- | --- |
| POS-VAT-01 | P2 | `Sale::calculateTotals()` exclusive-style VAT (`*0.12` on VAT-inclusive subtotal) — latent double-VAT if ever called | aligned to `ReceiptBreakdown` inclusive math |
| POS-VAT-02 | P3 | `'vat_rate' => 0.12'` literals in 4 receipt payloads | centralized on `ReceiptBreakdown::VAT_RATE` |
| POS-VAT-03 | P3 | `api/pos.js::generateReceipt()` dead code with wrong exclusive math | corrected to inclusive extraction |

## Verdict

**PASS** after fixes — single VAT authority, server-authoritative pricing,
idempotent checkout, immutable receipts.
