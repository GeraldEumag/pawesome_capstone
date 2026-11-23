# Phase 3.2 — Report 05: Service Inventory UI Integration (Grooming / Boarding / Veterinary)

**Status: PARTIAL — backend atomicity PASS; full browser workflows NOT VERIFIED**

## What was verified

| Area | Result | Evidence |
|---|---|---|
| Grooming multi-line usage atomicity | PASS (API/DB) | `ServiceInventoryUsageAtomicityTest`: `grooming rejection rolls back other valid usage lines` — mixed valid/invalid submission rolls back all stock changes and usage rows (Phase 3.1 fix re-verified on Phase 3.2 DB). |
| Boarding multi-line usage atomicity | PASS (API/DB) | Same test: `boarding rejection rolls back other valid usage lines`. |
| Veterinary inventory consumption path | Source-traced only | `MedicalRecordController` routes appointment inventory usage through the shared `InventoryService::deductStock()` inside transactions; no dedicated vet UI component was found consuming a separate endpoint. |
| Full grooming booking → usage UI workflow | NOT VERIFIED | Requires a complete grooming booking fixture chain (customer → pet → service request → approval → usage). Not executed in browser during 3.2. |
| Full boarding booking → approval → usage UI workflow | NOT VERIFIED | Same fixture-chain limitation. |
| Veterinary appointment UI consumption workflow | NOT VERIFIED | No confirmed UI entry point for inventory consumption was identified; deduction timing derives from `MedicalRecordController` finalize flow. |

## Source findings

- `GroomingInventoryService` / `BoardingInventoryService` wrap multi-line usage in `DB::transaction` and roll back on any line failure (Phase 3.1 fix confirmed in worktree).
- Usage records snapshot item name/SKU/unit at consumption time (`ServiceItemUsage`).
- Deduction timing: grooming/boarding deduct at usage-record submission; veterinary deducts through the medical-record finalize path. No consumption is invented for services that do not submit usage lines.

## Decision required / limitation

The acceptance criterion "Grooming and boarding browser workflows pass" and "Veterinary inventory behavior verified against existing rules" are **not fully satisfied**: atomicity is proven at service/API level, but end-to-end UI workflows were not executed. Marked NOT VERIFIED rather than substituting API evidence for browser proof.
