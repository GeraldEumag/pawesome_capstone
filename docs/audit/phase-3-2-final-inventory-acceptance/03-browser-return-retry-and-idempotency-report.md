# Phase 3.2 — Report 03: Browser Return Retry and Idempotency

**Status: PASS** (browser-verified on isolated stack)

Stack: Chromium via Playwright 1.59.1 · frontend `http://localhost:3002` (Vite) · API `http://127.0.0.1:8020/api` (worker pool 8021–8024) · DB `pawesome_phase3_2_browser_audit` (MariaDB 10.4.32) · spec `frontend/e2e/phase32-acceptance.spec.js` · audit-guard write-probe confirmed API writes land in the audit DB and not `pawesome`.

## Test P32-R1 — Uncertain-failure retry reuses key, one return only — PASS

- Role: inventory (UI) + cashier (POS fixture sale via API).
- Fixture: sellable product `P32-RET-*` stock 5; POS sale qty 2 (source-linked return eligible qty 2).
- UI: `/inventory/returns` → Record Return → item, qty 1, source `POS Sale`, source id = sale id, reason.
- Failure simulation: Playwright `page.route('**/api/inventory/returns')` performed `route.fetch()` (server fully processed and committed) then `route.abort("failed")` — a genuine post-commit response loss.
- App showed the "Record Return" error dialog; after dismissing OK, the same form (with retained `createIdemKey`) was resubmitted.
- Evidence: `evidence/p32-return-form-filled.png`, `evidence/p32-return-retry-success.png`.

Captured requests (headers only, secrets excluded):

| Attempt | Idempotency-Key | Result |
|---|---|---|
| 1 (aborted after commit) | `92bac287-…` (per-run UUID) | client saw failure; server committed |
| 2 (retry) | **same key** | success, "Return Recorded" |

DB verification (`inventory_returns`, `idempotency_keys` on audit DB):
- Exactly **1** return row for the item+source.
- Exactly **1** `idempotency_keys` row for that key on `POST …/inventory/returns` — replay returned the cached response; no second return, no duplicate stock movement.

## Test P32-R2 — Deterministic 4xx rotates key; new logical return gets new key — PASS

- Same UI flow; first submission qty 99 against a sale of qty 1 → HTTP 422, no return row (`quantity=99` count = 0).
- Key rotated on the 4xx boundary per `StockReturnsPage.jsx` (`err.status` 400–499 → `setCreateIdemKey(newIdemKey())`).
- Second, distinct logical return (manual source) submitted with a **different** captured key → success.
- Evidence: `evidence/p32-return-4xx-rejected.png`, `evidence/p32-return-second-success.png`.

## Limitations

- Response-loss was simulated via route abort after `route.fetch()` completed — equivalent to a post-commit network failure; it does not test a mid-transaction server crash (backend transaction atomicity for that case is covered by `InventoryConcurrentReturnTest` / `ServiceInventoryUsageAtomicityTest`).
- Disposition (inspect/restock) idempotency was verified in Phase 3.1 backend tests; browser disposition retry was not re-run in 3.2.
