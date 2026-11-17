# VETERINARY_SECURITY_AUDIT.md

**Audit date:** 2026-11-17 · **Method:** route/middleware inventory + code trace + **runtime probes** (`tests/Feature/VeterinaryFinalAuditProbeTest.php` — 5 tests, 95 assertions, all PASS on `pawesome_test`).

---

## 1. Authorization matrix (runtime-verified)

| Actor | Board `GET /appointments` | Check-in | Start/Complete | Medical-records | Diagnostics order | Diagnostics collect/result | Confinement rec. | Dashboard/History |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| unauthenticated | **401** (19-route sweep) | 401 | 401 | 401 | 401 | 401 | 401 | 401 |
| customer | — | 403 | 403 | 403 | 403 | — | 403 | 403 |
| receptionist | — | ✅ (own route) | 403 | 403 | 403 | — | 403 | 403 |
| cashier | — | 403 | 403 | 403 | 403 | — | 403 | 403 |
| inventory | — | 403 | 403 | 403 | 403 | — | 403 | 403 |
| **vet_tech** | ✅ reduced columns | ✅ | 403 | 403 | 403 (order) | ✅ (intended) | 403 | 403 |
| **veterinary** | ✅ assigned scope | ✅ | ✅ assigned only | ✅ assignment-gated writes | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ full board | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

`vet_tech` boundary confirmed at runtime: board + check-in + diagnostics specimen/result work only; every clinical read/write returns 403. **No privilege expansion found.**

## 2. IDOR probes (runtime)

| Probe | Result |
| --- | --- |
| Vet → foreign vet's appointment `start` | **404** (no mutation, no existence leak) |
| Vet → foreign vet's appointment `PATCH status` | **404** |
| Vet → foreign vet's appointment `consultations/{id}/complete` | **422** (state guard; never reaches mutation) |
| Vet → medical-record create on pet with no assigned appointment | **404** + `assertDatabaseMissing` |
| Customer → another customer's vaccination certificate | covered by `VaccinationCardOwnerAccessTest` (PASS) |
| Customer → vet-scoped `pets/{pet}/medical-records` (own pet only) | covered by `indexByCustomer` ownership check |

## 3. Cross-vet clinical reads
- Readable by design (continuity-of-care policy, `docs/veterinary-workflow.md`) BUT every non-assigned read is written to `clinical_access_logs` via `ClinicalAccessLogger` — verified by `VeterinaryWorkflowTest::test_other_veterinarian_can_read_appointment_detail_but_access_is_logged` (PASS).
- **Gap (SEC-01, P3):** `MedicalRecordController@index` (record list) performs no access logging, unlike `show`/`forPet`/`indexByPet`. Reads remain role-gated, but the audit trail misses list-page views.

## 4. Attachment / file security
- Diagnostic result attachments: `mimes:pdf,jpg,jpeg,png|max:10240`, stored via `FileStorageService::storeAndPersist` on the **private** disk — verified by storage hardening tests (14/14 PASS).
- Confinement payment proofs on private disk (`PrivateConfinementPaymentProofTest` PASS).
- Vaccination certificates: ownership-checked route (`customerVaccinationCertificate`).
- No raw file paths served; no public-disk writes for clinical data.

## 5. Mass assignment & injection
- All writes use `Validator` whitelists; `vetCanAccessPet`/`vetCanUseAppointment`/`canAccessAppointment` gate every mutation. `update()` refuses `customer_id` changes for non-admin/receptionist. `store` enforces `pet_id === appointment.pet_id`. ✅
- Eloquent parameterized queries throughout; no raw SQL in vet paths.

## 6. State-transition safety
- Status transitions enforced server-side (`isValidStatusTransition` matrix); model `saving` hook folds legacy statuses forward — invalid values cannot be persisted.
- Cancellation after clinical start: manager-only (`cancellationBlockedAfterStart`) — runtime-verified.
- Completed/closed visits: append-only records (addenda with `content_hash` chain + `author_id` + `ActivityLog`).

## 7. Audit logging coverage
- `ActivityLog` on start / complete / check-in / medical-info update / finalize / addendum / confinement actions / inventory usage. ✅
- `ClinicalAccessLogger` on non-assigned reads of appointment/pet/record detail. ✅ (except SEC-01 list-view gap)

## 8. Findings

| ID | Severity | Finding |
| --- | --- | --- |
| SEC-01 | P3 | `medical-records` list endpoint lacks `ClinicalAccessLogger` entry (detail reads are logged; list reads are not). |
| SEC-02 | P3 | `GET /customers` & `GET /customers/{id}/pets` shared group includes `veterinary` — needed by `VetEditAppointment`; data exposure is name/phone-scoped and role-gated, acceptable. No defect. |
| — | none | No P0/P1/P2 security defects. Authentication, role gates, IDOR guards, private storage, and audit logging all verified at runtime. |
