# VETERINARY_BACKEND_API_AUDIT.md

**Audit date:** 2026-11-17 · **Method:** `route:list` inventory + line-level controller/service trace
**Evidence:** `php artisan route:list --path=veterinary` → 85 routes (~70 under `api/veterinary/*`); all frontend call sites mapped in `VETERINARY_FRONTEND_AUDIT.md` §2.

---

## 1. Route groups & middleware

| Group (api.php lines) | Roles | Contents |
| --- | --- | --- |
| `874` | receptionist, vet_tech, veterinary | Intake check-in (`POST appointments/{id}/check-in`) |
| `878` | veterinary, vet, vet_tech | `GET appointments` — shared board (vet_tech gets reduced columns in controller) |
| `890` | veterinary, vet_tech, receptionist, cashier, manager, admin | Shared diagnostics/consent reads |
| `898` | veterinary, vet | **Clinical core** — dashboard, consultations, medical-records CRUD, addenda, vaccinations, MAR, confinement clinical actions, reports, receipt, inventory-usage |
| `1078` | veterinary, admin | Service catalog (`ServiceCatalogController`, server-limited to `Service::VET_CATEGORIES`) |
| `1133` | veterinary | `boardings/*` read-only (current-boarders, show) |
| `1221` | receptionist,admin,manager,cashier,veterinary,customer | Shared `GET /customers`, `GET /customers/{id}/pets`, `GET /pets` |

Every vet group also runs `auth.api` (ApiTokenAuth) + `throttle:api`. Mutating consultation endpoints carry `idempotency` middleware (`start`, `complete`, `recommend-confinement`).

## 2. Controller-by-controller findings

### `Veterinary\DashboardController` (overview/appointments/patients/appointment/history/reports/receipt)
- `assignedAppointments()` scopes non-admins to `veterinarian_id = auth()->id` — queue/dashboard/receipt are assignment-scoped. ✅ IDOR-safe (`receipt` → 404 on foreign ID).
- `appointment($id)` — readable by any vet (clinical-history policy per `docs/veterinary-workflow.md`); non-assigned reads logged via `ClinicalAccessLogger`. ✅ documented design.
- `vet_tech` board is column-reduced (`appointments()`). ✅ least privilege.
- Queue = `VeterinaryStatus::QUEUE` (scheduled, checked_in, in_consultation, in_treatment, awaiting_results, clinical_complete, checkout) — cancelled/completed/requested-without-assignment excluded correctly.
- Minor: `reports()` counts `['completed','treated']` — `treated` is a retired status; harmless dead list entry (OBS-01).

### `Veterinary\ConsultationWorkflowController`
- `start` → `VisitStartService::start` — `DB::transaction` + `lockForUpdate`, idempotent (one draft record, always lands `in_consultation`). ✅
- `complete`:
  - Requires status ∈ STARTED else 422; assigned-vet or admin else 403 (`veterinarian_id == null` case: any vet may complete an unassigned visit — acceptable claim semantics, OBS-02).
  - **Requires a FINALIZED medical record** — clinical data gate ✅.
  - Transaction: `ServiceBillingService::finalizeServiceBill` → cashier payment request (deduped via `OPEN_STATUSES`) → `clinical_complete` (open confinement) or `checkout` → `VisitCompletionService::tryComplete` auto-close when settled. ✅
  - Notifies customer + cashier role. ✅
- `recommendConfinement` — status guard + assigned-vet guard + validation (`in:low,normal,urgent,critical`) + `lockForUpdate` + open-confinement dedupe + transaction + notifications. ✅ No duplicate confinements possible.

### `Veterinary\MedicalRecordController` (largest — 1,069 lines)
- `store`: `pet_id`/`appointment_id` existence validated; with appointment → `vetCanUseAppointment` (STARTED + assigned vet) **and** `pet_id` must equal `appointment.pet_id` — cross-pet injection blocked. Without appointment → `vetCanAccessPet` (vet must have an appointment with that pet, or admin). Whole create (record + nested prescriptions + vaccinations) in `beginTransaction`/`commit`/`rollBack`. ✅
- `update`: draft-only (`status !== draft` → 403 with "add an addendum" message); `canBeEditedBy` + `vetCanAccessPet`; prescriptions replaced atomically. ✅ append-only enforcement.
- `destroy`/`lock`/`finalize`/`addAddendum`: owner-or-admin, state guards, `finalize` writes `ActivityLog` + idempotent 200, addendum chained via `content_hash` + logged. ✅
- `index` (list) — **unscoped** (any vet sees all records) but consistent with the documented "clinical reads open to veterinary staff" policy; unlike `show`/`forPet`/`indexByPet` it does **not** write a `ClinicalAccessLogger` entry (OBS-03, audit-log coverage gap, P3).
- `indexByCustomer` — verifies `pet.customer.user_id === auth->id`, else 404. ✅ customer IDOR-safe.
- `createVaccination` — `vetCanAccessPet` + full validation incl. `next_due_date after:date_administered`, batch existence; delegates `VaccinationService::administer` (transactional + batch `lockForUpdate` + stock deduct). ✅
- `customerVaccinationCertificate` — ownership-checked via `Customer::where('user_id')`. ✅
- `recordInventoryUsage`/`getUsageHistory` — `vetCanUseAppointment` (STARTED + assigned) → stock can only move during an active assigned consultation. ✅
- `updatePrescription`/`updateVaccinationRecord` (private) — `canBeEditedBy` model checks. ✅

### `Veterinary\DiagnosticOrderController` + `DiagnosticOrderService`
- Full state machine `ordered → collected → resulted → reviewed` (+cancel) enforced inside `lockForUpdate` transactions; each transition validates `from` status; creating an order requires appointment ∈ STARTED and flips `in_consultation → awaiting_results`; reviewing the last open order flips back. ✅
- Result attachments: `mimes:pdf,jpg,jpeg,png|max:10240` → `FileStorageService::storeAndPersist` on **private** disk. ✅

### `Veterinary\VisitConsentController`
- Polymorphic consent (`appointment`|`medical_confinement` verified to exist), typed enum, signed-at/by recorded, revocation requires reason. ✅

### `MedicalConfinementController` (shared, 824 lines)
- Status machine via `ConfinementStatusMap` (Phase D lifecycle + legacy fold): `recommended → consented → bed_assigned → admitted → under_care → ready_for_discharge → released` + `cancelled`.
- `assignBed`/`assignRoom`/`admit`/`cancel`/`release`: `lockForUpdate` on bed/room/confinement, availability rechecks, releases prior bed, marks new occupied — race-safe. ✅
- MAR (`marSchedule`/`marAdminister`/`marUpdateStatus`): administration deducts inventory via the inventory service (server-side deduction — vet UI never writes stock). ✅
- Vet scoping: `index` filters by `vet_id` for vet roles (line ~70).

### `AppointmentController` (shared vet-reachable methods)
- `canAccessAppointment`: vet roles → `veterinarian_id === auth->id` else 404 (IDOR-safe); customers → own only.
- `start` → `VisitStartService` + `ActivityLog`. `checkIn` → locked idempotent transition (INTAKE_ELIGIBLE only), emergency flag, notifies assigned vet or role.
- `updateStatus` — transition matrix (`isValidStatusTransition` lines 1091-1109) enforces Phase B paths; cancel requires reason code ('other' → free text mandatory); `cancellationBlockedAfterStart` blocks non-managers once clinical work begins; `completed` requires finalized record + `payment_status=paid` + `ServiceBillingService::canCompleteService`. ✅
- `update` — ASSIGNABLE-only, pet-must-belong-to-customer, schedule-conflict revalidation, `customer_id` changes restricted to admin/receptionist. ✅
- Model `saving` hook maps legacy statuses forward (can't persist retired values). ✅

## 3. Cross-checks

| Check | Result |
| --- | --- |
| Frontend endpoint ↔ route existence/method | ✅ 30/30 call sites resolve (see frontend audit §2) |
| Validation server-side on all mutations | ✅ every write action validates |
| Transactions on multi-write ops | ✅ start/complete/confinement/inventory/vaccination all transactional + row locks |
| Response consistency | ⚠ mixed shapes — `{consultation}`, `{record}`, `{appointment}`, bare arrays, `{success,data}`; frontend `safeArray`/fallbacks handle them (see `API_RESPONSE_CONVENTION.md` gap OBS-04) |
| `complete()` unassigned-visit claim | OBS-02 — any vet may complete a `veterinarian_id=null` STARTED visit; documented claim semantics, no defect |
| `index()` audit-log gap | OBS-03 — list reads not logged unlike record/pet reads (P3) |

**No P0/P1 backend defects found by inspection.** Candidate runtime verifications (authorization matrix, IDOR, transition enforcement) are exercised in the PHPUnit probes — see `VETERINARY_TEST_RESULTS.md` and `VETERINARY_SECURITY_AUDIT.md`.
