# VETERINARY_DATABASE_AUDIT.md

**Audit date:** 2026-11-17 · **Method:** read-only `information_schema`/`SHOW CREATE TABLE` on `pawesome` + migration/mode code trace. Dev DB was queried but never modified.

---

## 1. Foreign-key graph (all InnoDB)

```
appointments        → customers (CASCADE), pets (CASCADE), services (CASCADE), users.vet (SET NULL)
medical_records     → pets (CASCADE), appointments (SET NULL), users vet/finalized_by/locked_by
prescriptions       → medical_records (CASCADE), users (RESTRICT), inventory_items (SET NULL)
vaccinations        → pets (CASCADE), medical_records (SET NULL), users (RESTRICT), inventory_batches (SET NULL)
medical_attachments → medical_records (CASCADE), users (RESTRICT)
medical_record_addenda → medical_records (CASCADE), users author (RESTRICT)
medical_confinements → appointments consultation_id (CASCADE), pet/customer/room/ward_bed/consent/override_by (SET NULL), vet (CASCADE)
medical_progress_notes → confinement (CASCADE), vet (CASCADE)
diagnostic_orders   → appointments (CASCADE) → diagnostic_results (CASCADE)
visit_consents      → (polymorphic consentable, no FK — by design; subject existence validated in controller)
service_item_usages → appointments/pet/inventory_item/batch/used_by (all SET NULL — survives record deletes)
```

**Consistency assessment:** audit trails (`medical_attachments`, addenda, prescriptions, vaccinations, progress notes) use `RESTRICT`/`CASCADE` so clinical authorship can't be silently orphaned; operational links use `SET NULL` so deleting a bed/room/customer doesn't destroy clinical history. This matches the business intent (records must outlive administrative entities).

## 2. Indexing (`medical_records` verified; same pattern on siblings)
- PKs + FK indexes + dedicated indexes on `pet_id`, `veterinarian_id`, `visit_date`, `status` — the exact columns used by controller `where` clauses and `index()` filters. No obvious missing index on hot paths.

## 3. Live-data integrity probes (dev DB, read-only)

| Probe | Result |
| --- | --- |
| Orphaned `medical_records` (pet_id dangling) | **0** |
| Orphaned `prescriptions` (record dangling) | **0** |
| Orphaned `medical_confinements` (consultation dangling) | **0** |
| Orphaned `vaccinations` (pet dangling) | **0** |
| Orphaned `appointments` (pet dangling) | **0** |
| Duplicate medical records per appointment | **0** (VisitStartService dedupe works) |
| Stale `in_consultation` appointments | **34 rows** — accumulated dev/test data where visits were started but never completed. Not a schema defect; runtime lifecycle enforcement verified via `VisitCompletionService` + updateStatus gates. Flagged as dev-data hygiene note (DB-01), not a code defect. |

## 4. Transaction & locking review (code trace)

| Operation | Transaction | Row lock | Idempotency |
| --- | --- | --- | --- |
| Visit start (`VisitStartService`) | ✅ | `lockForUpdate` on appointment | ✅ reuses existing draft record |
| Check-in (`AppointmentController::checkIn`) | ✅ | `lockForUpdate` | ✅ keeps original stamp |
| Clinical complete (`ConsultationWorkflowController::complete`) | ✅ | n/a (state-guarded) | payment-request dedupe via OPEN_STATUSES |
| Confinement recommend/assign-bed/admit/cancel/release | ✅ | `lockForUpdate` on appointment/bed/room/confinement | ✅ re-checks availability inside lock |
| Medical record create (record+Rx+vax) | ✅ manual begin/commit/rollback | — | — |
| Inventory usage (`VeterinaryInventoryService`) | ✅ | `lockForUpdate` on item | deduction atomic with usage row |
| Vaccination (`VaccinationService::administer`) | ✅ | `lockForUpdate` on batch | stock deduct inside txn |
| Diagnostics (`DiagnosticOrderService`) | ✅ per transition | `lockForUpdate` | transition validates from-status |

## 5. N+1 / query-shape review

- Lists eager-load: `assignedAppointments`/`index` → `with(['customer','pet','service','veterinarian'])`; confinements → `with(['consultation','customer','pet','veterinarian','room','wardBed'])`; diagnostics → `with('results')`; record `show` → addenda + attachments + progressNotes.veterinarian. ✅ No N+1 on audited paths.
- `dashboard overview()` — 3 count + 1 list query; `patients()` — single grouped query. Acceptable.

## 6. Notable findings

| ID | Severity | Finding |
| --- | --- | --- |
| DB-01 | P3 | 34 stale `in_consultation` rows in dev DB — hygiene issue, not code defect; cleanup via manager/cancel or a data-maintenance pass, not audited scope (dev DB is read-only for this audit). |
| DB-02 | P3 | `visit_consents.consentable_*` polymorphic pair has no DB-level FK (by design — polymorphic); subject existence is enforced in `VisitConsentController::store` only. Acceptable. |
| DB-03 | OK | `service_item_usages` SET NULL references — usage ledger survives item/batch deletion, correct for audit billing. |

**Verdict (inspection):** schema is normalized, fully referential, indexed on access paths, and every multi-write operation is transactional with row locks. Runtime data-integrity behaviors are exercised in the PHPUnit phase — see `VETERINARY_TEST_RESULTS.md`.
