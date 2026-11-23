# Phase 3.2 — Report 04: Full POS Cart and Payment Workflow

**Status: PASS** (browser-verified) — Phase 2 financial rules unchanged.

Stack: same isolated Phase 3.2 stack as Report 03. Spec test: `POS UI cart and cash payment deduct stock once and render receipt`.

## Happy path — PASS

1. Cashier login → `/cashier/pos` → `.pos-search-input` visible.
2. Searched sellable fixture `P32-POS-*` (stock 10, price ₱150, server-created via inventory API).
3. Clicked product tile → added to cart; stepper `+` → qty 2.
4. Cart row showed item ×2; proceeded to Payment step (`2 Payment` chip active).
5. Cash method (default) → `Exact` bill preset (₱300 = ceil(total)) → `Complete Payment`.
6. `Payment Successful!` heading + receipt modal rendered; `.pos-modal-body` contains `VAT` and `TOTAL` labels (X-15 VAT-inclusive labels preserved).
7. Evidence: `evidence/p32-pos-cart.png`, `evidence/p32-pos-receipt.png`.

## Database verification (audit DB, direct PDO)

| Check | Before | After | Result |
|---|---|---|---|
| `inventory_items.stock` | 10 | 8 | −2, exactly one deduction |
| `sales` row count | N | N+1 | one sale |
| `inventory_logs` sale-type movements for item | — | ≥1 | movement recorded |

Idempotency: `CashierPOS.jsx` sends one `Idempotency-Key` per logical sale (`pendingSaleKeyRef`); backend `pos requires an idempotency key and replays retries once` + `same idempotency key with changed payload is rejected` both PASS (PosFinancialIntegrityTest, isolated run).

## Negative coverage

- Out-of-stock product in cart: POS product endpoint filters `stock > 0` (`POSController.php:326`), so a zero-stock tile cannot appear; stepper `+` is disabled at available stock and `canCheckout` blocks over-quantity. Backend rejects insufficient stock atomically (`pos insufficient stock deducts nothing`, `cash underpayment rolls back`, `duplicate product lines cannot oversell`).
- Tampered client price/total: server-authoritative pricing verified by `product price name totals payment and receipt are server authoritative` and `pos ignores manipulated price and total` (P1SecurityIntegrityTest) — PASS.
- Repeated submission / uncertain failure: covered by idempotency tests above; browser-level POS retry was not separately re-simulated in 3.2 (return retry was; POS key logic reviewed in source and backend-tested).
- Unauthorized role / inactive product: `inactive product cannot be sold through direct api`, cashier-role authorization covered by role tests — PASS.

## Limitations

- GCash/Maya reference flow not exercised in browser (no external provider calls permitted); cash path verified end-to-end.
- Physical printer/scanner not tested (no hardware); receipt PDF/print path unchanged.
