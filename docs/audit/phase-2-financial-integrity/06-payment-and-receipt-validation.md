# Payment and Receipt Validation

## POS sale

POS is a cashier-entered in-person sale. The controller persists the backend total in `Payment.amount`, marks the payment completed, completes the sale, and creates a paid invoice in the same transaction. Cash tender below the server total is rejected; cash change is calculated from the backend total. The flow does not call an external payment provider.

## Customer proof / verification

The active veterinary service-billing flow accepts GCash/Maya payment proof and creates a pending request; customer submission is not payment approval. Cashier-only verification endpoints invoke the verification service. Customer store order proof/checkout endpoints remain disabled (HTTP 410).

## Receipt authority and fix

- POS receipt data is generated from persisted sale, items, payments and invoice.
- The historical customer-order receipt had an undefined `$orderTotal` argument in `ReceiptBreakdown::forSettleable`; changed both the breakdown total and fallback payment amount to persisted `$totalAmount`.
- Added a regression feature test for a paid historical order receipt.
- X-15 labels remain intact across shared receipts, PDF, browser/thermal, ESC/POS, cashier/customer displays and email; the email now uses the required exact wording.
- No persisted VAT value, VAT rate, or `ReceiptBreakdown` formula was changed. Accountant confirmation remains open.

## Status

The payment/receipt suites ran on the disposable Phase 2 database. `PaymentReceiptOutboxTest`, `ReceiptScannerTest`, and `EmailMailableSecurityTest` produced 39 passing tests and 152 assertions; one image-downscale test was skipped because GD is unavailable. The stale outbox assertion that expected VAT subtraction was updated to assert X-15 inclusive labels. No provider calls were made.
