# Inventory Data Hygiene Review — `pawesome` (dev DB)

**Date:** 2026-11-18 · **Backup:** `backups/pawesome_backup_inventory_hygiene_20261118.sql`
(3,865,373 bytes, mysqldump single-transaction, restorability verified into a
scratch DB: 843 items / 118 logs / 33 batches; scratch DB dropped after check).

All repairs were first applied and verified on the isolated clone
`pawesome_inventory_audit` before any development-database action was proposed.

## Finding 1 — Item #275 `4IN1 VACCINE (TOGALABZ)`: flat 10 vs batches 2

**Root cause (traced through `inventory_logs`):** the initial 10 units were
created by a plain `stock_adjustment_increment` (log 49, 2026-10-03) **without
a batch record**. Five subsequent POS sale/void cycles each exercised the
service's drift self-heal: every sale created+depleted a 2-unit batch and every
void created a fresh 2-unit batch. Final state: 5 depleted batches + 1 active
batch (remaining 2) → batch sum 2 vs flat 10. The missing 8 units are the
original unbatched stock that was never batch-tracked.

**Classification:** SAFE TO APPLY — reconciliation creates a `RECON-*` batch
of +8 (additive only; flat stock unchanged; delta-0 `stock_reconciliation` log).

**Audit-DB proof:** `RECON-6AFCAF861DD92` (+8) created; stock 10, batch sum 10.

## Finding 2 — Item #838 `pawesome med`, batch `01`: expired but `active`

- Batch 4: qty 10, remaining 10, status `active`, expiration `2026-10-15`
  (expired ~5 weeks). Item is FEFO/`requires_expiry_tracking=1`.
- `deductStock` already **blocks** deduction of this batch (verified by the
  "expired batch still blocks sale" test) — the status is inaccurate for
  reporting but cannot cause an illegal sale.

**Classification:** REQUIRES MANUAL REVIEW — the reconcile command marks the
batch `expired` and reduces flat stock 10 → 0 (writes an `expiry_mark` log,
batch `remaining_quantity` preserved). This is a real stock write-off of
10 expired units: correct semantics, but it is a business decision to formally
write off expired merchandise.

**Audit-DB proof:** batch → `expired`, item stock → 0, `expiry_mark` log
written by "System (inventory:reconcile-stock)".

## Finding 3 — 12 actor-less `inventory_logs`

- 6× `Initial stock` rows (items 838–843, Oct 1–4) — created by the pre-INV-06
  `created` hook. System-level seed events; no user context ever existed.
- 6× `Batch disposed: E2E manual audit dispose` (item 147, Oct 22) — created by
  the pre-INV-05 `disposeBatch`, which ran in an authenticated context but did
  not record it.

**Classification:** PRESERVE AS-IS — the original actors are genuinely
unrecoverable; writing any identity now would fabricate attribution. Both
writers are fixed, so no new actor-less rows can be produced. Outstanding
issue is permanently historical.

## Finding 4 — Reconcile dry-run: 381 planned actions

Categorized exactly:

| Category | Count | Classification |
|----------|-------|----------------|
| Create `RECON-*` batch (flat > batch sum; mostly never-batch-tracked items) | 380 | SAFE TO APPLY — additive only, idempotent, complete logs |
| Expire active-but-expired batch (item 838/`01`, stock 10 → 0) | 1 | REQUIRES MANUAL REVIEW — real stock write-off |
| `batchSum > stock` manual-review report rows | 0 | none |

**Command safety review** (`app/Console/Commands/ReconcileInventoryStock.php`):
default is **dry-run** (`--apply` required to write); each action runs in its
own `DB::transaction`; writes only batches/log rows and the item counter —
never deletes records; idempotent (verified: second `--apply` run reports
"All items already in sync"); cannot overwrite historical movements.

## Repair execution status

| Scope | Status |
|-------|--------|
| `pawesome_inventory_audit` | **APPLIED + VERIFIED** (381 actions; re-run clean) |
| `pawesome` (dev) | **PENDING USER APPROVAL** — backup verified; same 381 actions proposed. No dev-DB mutation performed by this audit beyond disclosure in the main report. |

## Recommendation

Approve `php artisan inventory:reconcile-stock --apply` on `pawesome` (all 381
actions) — the only behavior change is: expired batch 838/`01` formally
write-off (10 unsellable units) plus batch-tracking backfill for 380 items.
If the write-off needs owner sign-off, the RECON actions alone cannot be split
by the current command; a manual `update` on batch 4 would be the alternative.
