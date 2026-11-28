# 06 — AI Receipt Reading Audit

**Scope:** `app/Services/Receipts/*` pipeline + `ProcessReceiptScan` job +
cashier confirm/reject flow + `PaymentReferenceGuard` +
`PaymentReceipt`/`ReceiptExtraction`/`ReceiptValidation`/
`ReceiptCorrection` models.

## Pipeline

```
upload (payable proof)
  → ReceiptService::storeAndAttach  [idempotency_key, sha256, phash(dHash),
                                     max 15 uploads/payable, private disk]
  → ProcessReceiptScan job (queue: receipts, afterCommit; sync-guarded)
  → ReceiptImagePreprocessor::prepare (working copy)
  → ReceiptReaderChain: GeminiVision → OpenRouterVision → LocalOcr
       (each failure persisted as a ReceiptExtraction attempt row — auditable)
  → ProviderReceiptParser → ReceiptNormalizer (provider-aware reference norm)
  → ReceiptValidationService::run → rules incl. duplicate-image block
  → autofillReference() onto payable + linked service_request/boarding/
    grooming/appointment rows (only while payment_status != 'paid')
  → status READY (all green) | NEEDS_REVIEW — NEVER auto-confirmed
```

## Verified properties

- **Never auto-approve:** scan outcomes only reach `ready`/`needs_review`;
  `confirmed` requires `ReceiptConfirmationService::confirm()` — a cashier
  action inside `PaymentVerificationService::verify()`'s transaction.
- **Blocking validations gate confirm:** any `receipt_validations.result =
  block` row makes confirm return 422 with the block details.
- **Duplicate safety, three layers:**
  1. Upload: same `idempotency_key` + different sha256 → 422 (file can't be
     silently swapped); same file → reuse.
  2. Scan: sha256 match against an already-`confirmed` receipt →
     `image_unique` block + `needs_review`.
  3. Confirm: `payment_references` `UNIQUE(provider,
     reference_normalized)` — concurrent confirms of the same reference
     roll back the whole verify transaction (`UniqueConstraintViolation`
     → friendly 422). `PaymentReferenceGuard::withUniqueReference` adds a
     MySQL `GET_LOCK` named lock + cross-table reference scan for the
     non-receipt payment paths.
- **Race safety:** final status write is conditional
  (`whereNotIn(status, [confirmed, rejected])`) — a cashier decision made
  while the scan was in flight always wins; scan can't downgrade it.
- **Paid-payable protection:** `autofillReference` updates only rows with
  `payment_status != 'paid'` and mirrors to linked records.
- **Audit trail:** every reader attempt persisted (incl. errors +
  latency); cashier reference edits recorded in `receipt_corrections`
  (old→new, corrected_by) for the accuracy report.
- **Failure isolation:** `attachStoredProof`/`dispatchScan` never throw —
  scanner bookkeeping can't fail a completed payment upload; failed scans
  land in `failed`/`needs_review` for manual handling.
- **Disabled mode:** `RECEIPT_SCANNER_ENABLED=false` → transparent
  passthrough to `FileStorageService`; manual flow untouched.

## Upload validation

Proof uploads go through the payable controllers' `mimes:jpg,jpeg,png,pdf`
/ image validation (customer-facing endpoints require the file; staff may
submit reference manually). `ReceiptImagePreprocessor` handles
orientation/resize for readers; original bytes are what get hashed —
hash identity is on the submitted file, not the derivative.

## Confidence tiers

`ReceiptValidationService` produces per-rule results aggregated to an
`overall` outcome; non-green → `needs_review` with rule details visible to
the cashier. Manual override = cashier confirm/reject with mandatory
reference/reason — there is no silent approval path.

## External dependencies

Gemini/OpenRouter readers require API keys (`ProviderConfig`); when
unconfigured `isAvailable()` is false and the chain falls through to
local OCR or fails to `needs_review`/`failed` — graceful degradation
verified by design; live provider calls are environment-dependent and are
marked as such in the compliance matrix (not a code defect).

## Verdict

**PASS.** Defense-in-depth dedupe, human-in-the-loop confirmation,
full audit trail, race-safe status transitions.
