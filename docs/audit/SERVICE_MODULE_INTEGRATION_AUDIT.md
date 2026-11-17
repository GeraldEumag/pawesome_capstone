# Service Module Integration Audit (Veterinary · Grooming · Boarding)

**Date:** 2026-11-17

## Veterinary

| Capability | Evidence | Result |
| --- | --- | --- |
| Approve→assign vet→consult→finalize→billing→auto-close after payment | `VeterinaryBillingPaymentFlowTest`, e2e `phase12-veterinary-workflow`, `phase12-diagnostics-workflow` | PASS |
| Diagnosis / treatment / prescription / attachments | `medical_records(+_addenda)`, `medical_attachments`, `prescriptions` — corrections-not-edits | PASS |
| Vaccinations w/ lot+expiry on certificate | `vaccinations` + test | PASS |
| Confinement / ward beds / progress notes / discharge clearance | `medical_confinements`, `ward_beds`, `PharmacyConfinementPhaseDTest` | PASS |
| MAR scheduled vs administered stock movement | test: schedule doesn't move stock, administer does | PASS |
| Medical privacy | owner + care-team scoped; `PrivatePetPhotoTest`-family | PASS |
| Customer visibility | finalized records visible to owning customer | PASS |

## Grooming

| Capability | Evidence | Result |
| --- | --- | --- |
| Request → receptionist approve → schedule → status → complete | `grooming_appointments`, `groomings`, e2e `phase12-native-ui-workflows`, `batch1-customer-system` | PASS |
| Service item usage deducts inventory once | `service_item_usages` + add-on tests | PASS |
| Customer tracking | booking tracker | PASS |

## Boarding / Hotel

| Capability | Evidence | Result |
| --- | --- | --- |
| Request → approve → room assign (`boarding_room_reservations`) → check-in → care logs → ready → check-out → room freed | `boardings`, `boarding_care_logs`, e2e `phase12-boarding-workflow`, `receptionist-room-assignment` | PASS |
| Full-room conflict → 422 | matrix evidence | PASS |
| Add-ons atomic; restored on post-approval reject | P1 add-on tests | PASS |
| `boarding_rooms` vs `hotel_rooms` | coexist: `boarding_rooms` + reservations drive availability; `hotel_rooms` is the hotel catalog; **not merged — no evidence they are duplicates to collapse** | Documented |

All stock-affecting service paths write `inventory_logs` with actor + before/after.
