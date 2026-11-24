# WORKFLOW_INTEGRATION_REPORT.md

**Date:** 2026-11-24 · Cross-module workflow verification for this revision.

## 1. Species→service compatibility (re-verified)

- `PetServiceCompatibilityService::validateServiceCompatibility` called at `Api\ServiceRequestController.php:198` and `BoardingController.php:488`; species rules cover Dog/Cat/Rabbit/Bird/Hamster/Fish/Reptile/Other.
- `boardings.allowed_species` JSON + `BoardingRoomService` room assignment enforce room-level species rules.
- Frontend filters service/room options; backend still rejects crafted requests (422 `service_not_allowed`) — not UI-only.

## 2. Booking lifecycle stages

`BookingWorkflowStageTest` (8 tests) PASS: grooming approval→payment→pickup, vet `clinical_complete`/`checkout` readiness, hotel stay stages, cancelled/rejected states. `ready_for_pickup` enum used by vet/hotel/grooming pickup flows — E2E harness validity confirmed compatible (specs updated in prior cycle).

## 3. Inventory workflow chain (touched by this revision)

Add Product (UOM fields + auto-barcode) → Stock In (unit-aware, converts to base) → Stock Out (approval queue for sensitive reasons) → Returns (restock/quarantine/damaged/dispose dispositions) → `InventoryLog` audit trail → low-stock `WorkflowNotifier` alerts → POS sells base units via barcode lookup.

Atomicity: all mutations inside transactions with `lockForUpdate`; actor metadata on every log row. Approval queue for sensitive stock-out reasons preserved.

## 4. Payment→fulfillment chain

Service request approved → cashier payment (POS server-recompute) → `payment_status` transition → booking workflow stage advances → customer receipt email via outbox → pickup/checkout.

## 5. Email outbox integration

Intent rows created inside business transactions (`occurrence_key` dedup, encrypted recipients); `email-deliveries:dispatch` publishes to `emails` queue; `SendEmailDelivery` re-checks verification/preferences/suppression at send time. `sync` queue acceptable for demo; supervised worker required for production (deployment gate).

## 6. Revision-specific integration notes

- UOM conversion happens **before** `InventoryService` sees quantities — downstream stock math, logs, alerts, and POS remain in base units; no downstream changes needed.
- Auto-barcode generation occurs at item creation inside the same transaction as SKU generation; collisions retried.
- Index additions are read-path only; no write-path or workflow behavior change.
