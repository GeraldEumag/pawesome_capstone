# POS_PAYMENT_REVISION_REPORT.md

**Date:** 2026-11-24 · **Scope:** re-verification only — no POS/payment code changed this revision (no confirmed gap).

## Verified-current controls (code-level, HEAD)

| Control | Location | Status |
|---|---|---|
| Server-side price recompute | `Cashier\POSController::processTransaction` resolves server unit prices; client prices ignored | VERIFIED |
| VAT-inclusive math | `subtotal*0.12/1.12`; `net_amount`/`vat_amount`/`vat_rate` on receipts; `EmailContent::vatInclusivePortion` | VERIFIED |
| Transactional integrity | DB transaction + idempotency on POS transactions | VERIFIED |
| Cashier-only payment verification | `PaymentVerificationService`; receipt-scanner chain flags low-confidence; AI never auto-approves | VERIFIED |
| Payment status authority | `payment_status` transitions server-side; no client-writable status | VERIFIED |
| Refund handling | `Sale::payment_type='refund'` accounting in cashier flows | VERIFIED (tests) |

## Test evidence this revision

- `ReceiptBreakdownTest` (5 tests), `ReceiptScannerTest` (24 tests), `ReceiptScannerSettingsTest` (6 tests) — all PASS on MySQL 8 suite.
- Cashier dashboard/payment-queue queries now backed by new indexes (FR-03): `service_requests.payment_status`, `sales.status`.

## Open items (accepted/documented)

- Free-text payroll rows trust maker-entered totals — maker-checker gated; Option B auto-compute is a business decision (C-05, ACCEPTED_GAP P3).
- Live payment-provider settlement (GCash/Maya auto-confirm) is not wired — scanner assists cashier verification only; provider credentials are an external gate (C-06).

## Verdict

**VERIFIED** at code+test level for the audited controls; live provider confirmation remains BLOCKED (external).
