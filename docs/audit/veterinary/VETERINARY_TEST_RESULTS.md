# VETERINARY_TEST_RESULTS.md

**Audit date:** 2026-11-17 · All results below are from actual executions; no result is inferred.

---

## 1. PHPUnit — targeted Veterinary suite (`pawesome_test`)

```
php artisan test --filter="Veterinary|Vet|Medical|Vaccination|AuthorizationMatrix|Storage"
→ Tests: 100 passed (591 assertions) — Duration: 64.49s — 0 failures
```

Covers (selection): `AuthorizationMatrixTest` (11), `VeterinaryWorkflowTest` (24 — full cross-role lifecycle incl. booking→assign→check-in→consult→finalize→cashier-verify→auto-complete, rejection, manager-only cancel-after-start, cross-vet logged reads, idempotent start, duplicate confinement refusal, append-only finalized records), `VisitIntakeTest` (4 — vet_tech boundary + intake idempotency), `VetBatch4SystemTest`, `VetCancellationReasonTest`, `VetUxHandoffTest` (5), `VeterinaryBillingPaymentFlowTest` (6), `VisitBillingPhaseCTest`, `VaccinationCardOwnerAccessTest`, `StorageLifecycleTest` (14), `MedicalRecordFormPayloadTest`, `PharmacyConfinementPhaseDTest`, `ServiceCatalogAccessTest` (4), `BoardingRoomLifecycleTest`, `DatabaseIntegrityTest`, `DashboardTest`, notification/booking-integrity tests.

## 2. PHPUnit — audit probe (new, `pawesome_test`)

```
php artisan test --filter=VeterinaryFinalAuditProbeTest
→ Tests: 5 passed (95 assertions) — 0 failures
php -l → No syntax errors detected
```

New file `backend/tests/Feature/VeterinaryFinalAuditProbeTest.php`:
1. 19-route unauthenticated sweep → all 401.
2. 5 non-clinical roles × 9 clinical endpoints → all 403.
3. Cross-vet IDOR (start/status/complete on foreign appointment) → 404/422, DB unchanged.
4. Medical-record create on unassigned pet → 404 + `assertDatabaseMissing`.
5. vet_tech board + check-in allowed; clinical reads/writes 403; diagnostics collect allowed (intended).

## 3. Playwright — six Veterinary specs (`--workers=1`)

| Spec | Result |
| --- | --- |
| `vet-dashboard.spec.js` | **7/7 pass** |
| `batch4-veterinary-system.spec.js` | **18/18 pass** |
| `veterinary-boarders-room.spec.js` | **1/1 pass** |
| `veterinary-responsive-audit.spec.js` | **3/3 pass** |
| `phase12-veterinary-workflow.spec.js` | **3/3 pass** (isolated `pawesome_e2e_audit` DB on backend :8001 + frontend :3001) |
| `vet-tech-intake-audit.spec.js` | **1/1 pass** (after spec fix — see changelog) |

**Total: 33/33 passed, 0 failed.** First full run: 29 pass + 4 skips (isolated-DB gate); after provisioning `pawesome_e2e_audit` + second backend :8001 + frontend :3001 (`VITE_API_BASE_URL` override): the 4 gated specs ran — 2 immediate pass, phase12 lifecycle pass (1.0m real browser booking→check-in→consult→complete), vet-tech spec initially failed → spec-design defect fixed and verified.

## 4. Frontend build

```
npm run build → ✓ built in 25.75s — 0 errors
```
Pre-existing warnings only: mixed dynamic/static imports; index chunk 3.6MB (>500kB advisory). No vet-module build errors.

## 5. Full backend suite

**Not run** — scoped to the vet filter + probe per the approved execution spec (targeted suite is the regression gate for this audit; CI runs the full MySQL suite on push). Documented as a limitation, not claimed.

## 6. Environment notes
- Dev `pawesome` DB: read-only throughout (SELECT/SHOW only). Test artifacts confined to `pawesome_test` (PHPUnit) and `pawesome_e2e_audit` (browser).
- `pawesome_e2e_audit` created/migrated/seeded solely for the gated browser specs.
- Windows socket-exhaustion flake (documented in AGENTS.md) did not manifest at `workers=1`.
