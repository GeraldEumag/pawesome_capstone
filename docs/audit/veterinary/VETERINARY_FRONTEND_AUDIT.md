# VETERINARY_FRONTEND_AUDIT.md

**Audit date:** 2026-11-17 · **Scope:** `frontend/src/components/veterinary/` + routing + API layer
**Method:** Static code inspection of every component + endpoint cross-check against `route:list`. Browser execution evidence lands in `VETERINARY_TEST_RESULTS.md`.

---

## 1. Component inventory (17 source files in `components/veterinary/`)

| File | Lines | Routed? | Verdict |
| --- | --- | --- | --- |
| `VetDashboard.jsx` | 574 | `/veterinary` (layout + overview) | Audited — findings F-UI-01…05 |
| `VetAppointments.jsx` | 881 | `/veterinary/appointments` | Audited — finding F-UI-06 |
| `VetConsultation.jsx` | 1153 | `/veterinary/appointments/:id/consult` | Audited — structurally sound |
| `VetAppointmentBilling.jsx` | 430 | `/veterinary/appointments/:id/billing` | Audited — clean Phase-A handoff |
| `VetEditAppointment.jsx` | 593 | `/veterinary/appointments/:id/edit` | Audited — OK |
| `VetMedicalConfinements.jsx` | 754 | `/veterinary/medical-confinements` | Audited — OK |
| `VetCustomerProfiles.jsx` | 737 | `/veterinary/customer-profiles` | Audited — OK |
| `VetReports.jsx` | 209 | `/veterinary/reports` | Audited — OK (real data) |
| `VetHistory.jsx` | 100 | `/veterinary/history` | Audited — OK |
| `VetReceipt.jsx` | 215 | `/veterinary/receipt?id=` | Audited — OK |
| `VetServices.jsx` | 18 | `/veterinary/services` | Audited — delegates to `ServiceCatalogManager` (vet-scoped categories) |
| `VeterinaryCurrentBoarders.jsx` | 257 | `/veterinary/current-boarders` | Audited — read-only boarders view (correct separation from confinements) |
| **`VetCurrentBoarders.jsx`** | 618 | **NOT routed — dead file** | F-UI-07 |
| `VetDiagnosticsPanel.jsx` | 310 | (embedded in VetConsultation) | Audited — OK |
| `VetConsentPanel.jsx` | 197 | (embedded in VetConsultation) | Audited — OK |
| `VeterinarySidebar.jsx` | 109 | layout nav | Audited — vet vs vet_tech nav correct |
| `VetSkeleton.jsx` | 240 | loading fallback | OK |
| `vetStatus.js` | 20 | — | Mirrors `App\Support\VeterinaryStatus` correctly |

Route mounting: `routes/AppRoutes.jsx:55` mounts `VetRoutes` at `/veterinary/*`. `ProtectedRoute` allows `veterinary, vet, veterinarian, vet_tech, admin` for the `/veterinary` segment (admin access is the documented all-access staff role). `vet_tech` lands on `/veterinary/appointments` (read-only board) and is redirected away from the overview.

## 2. API-call → endpoint map (all call sites verified against `route:list`)

| Frontend call site | Endpoint | Exists? | Vet role allowed? |
| --- | --- | --- | --- |
| VetDashboard:58 | `GET /veterinary/dashboard` | ✅ `DashboardController@overview` | ✅ `role:veterinary,vet` |
| VetDashboard:59 | `GET /veterinary/boardings/current-boarders` | ✅ `BoardingController@currentBoarders` | ✅ `role:veterinary` |
| VetAppointments:182 | `GET /veterinary/appointments` | ✅ `DashboardController@appointments` | ✅ `role:veterinary,vet,vet_tech` |
| VetAppointments:183 | `GET /veterinary/history?status=…` | ✅ `DashboardController@history` | ✅ |
| VetAppointments:222 | `POST /veterinary/appointments/{id}/check-in` | ✅ `AppointmentController@checkIn` | ✅ intake group (receptionist,vet_tech,veterinary) |
| VetAppointments:416, VetDashboard:176 | `POST /veterinary/appointments/{id}/start` | ✅ `AppointmentController@start` | ✅ |
| VetAppointments:421 | `PATCH /veterinary/appointments/{id}/status` | ✅ `AppointmentController@updateStatus` | ✅ |
| VetConsultation:231, VetEditAppointment:141, VetAppointmentBilling:74 | `GET /veterinary/appointments/{id}` | ✅ `DashboardController@appointment` | ✅ |
| VetConsultation:236, VetAppointmentBilling:59 | `GET /veterinary/pets/{id}/medical-records` | ✅ `MedicalRecordController@forPet` | ✅ |
| VetConsultation:262, VetMedicalConfinements:349 | `GET /veterinary/inventory-items` | ✅ `MedicalRecordController@getAvailableItems` | ✅ |
| VetConsultation:346 | `POST /veterinary/consultations/{id}/start` | ✅ `ConsultationWorkflowController@start` (+`idempotency`) | ✅ |
| VetConsultation:375-382 | `POST /veterinary/medical-records` / `PUT /veterinary/medical-records/{id}` | ✅ store/update | ✅ |
| VetConsultation:423 | `POST /veterinary/consultations/{id}/recommend-confinement` | ✅ (+`idempotency`) | ✅ |
| VetConsultation:88 (via api/medicalRecords) | `POST /veterinary/medical-records/{id}/addenda` | ✅ `addAddendum` | ✅ |
| VetAppointmentBilling:109 | `POST /veterinary/consultations/{id}/complete` (+`Idempotency-Key`) | ✅ `ConsultationWorkflowController@complete` | ✅ |
| VetDiagnosticsPanel:44/73/93/225/250 | `…/diagnostics`, `diagnostics/{id}/result`, `/collect`, `/review` | ✅ `DiagnosticOrderController` | ✅ |
| VetConsentPanel:40/59 | `appointments/{id}/consents`, `POST /veterinary/consents` | ✅ `VisitConsentController` | ✅ |
| VetMedicalConfinements:151/169/294/302/331/556-694 | `GET/POST /veterinary/medical-confinements…` (list, progress-notes, mark-*, clear-for-discharge, MAR) | ✅ `MedicalConfinementController` | ✅ |
| VetCustomerProfiles:217/311 | `GET /veterinary/patients`, `GET /veterinary/pets/{id}/medical-history` | ✅ | ✅ |
| VetReports:71 | `GET /veterinary/reports?…` | ✅ `DashboardController@reports` | ✅ |
| VetHistory:34 | `GET /veterinary/history?…` | ✅ | ✅ |
| VetReceipt:37 | `GET /veterinary/receipt/{id}` | ✅ `DashboardController@receipt` | ✅ |
| VetServices→ServiceCatalogManager | `GET/POST/PUT/DELETE /veterinary/services*` | ✅ `ServiceCatalogController` (VET_CATEGORIES server-side) | ✅ `role:veterinary,admin` |
| VetEditAppointment:97/122/130/261 | `GET /customers`, `GET /customers/{id}/pets`, `GET /veterinary/services`, `PUT /veterinary/appointments/{id}` | ✅ shared multi-role group (`role:receptionist,admin,manager,cashier,veterinary,customer`) + vet group | ✅ |
| VeterinaryCurrentBoarders:31 | `GET /veterinary/boardings/current-boarders` | ✅ | ✅ |

**Zero missing endpoints, zero method mismatches.** One routing quirk noted (not vet-blocking): bare `GET /api/customers/search` is `role:cashier`-only while `api/customers` + `api/customers/{id}/pets` are the multi-role group — no vet component calls the search route.

Unused vet endpoints (backend has them, frontend doesn't call): `GET consultations`, `GET consultations/scheduled`, `POST consents/{id}/revoke`, `POST medical-records/{id}/lock`, `DELETE medical-records/{id}`, `POST appointments/{id}/inventory-usage` + usage-history GETs (frontend embeds prescriptions/MAR instead), `GET vaccination-recall`, `GET vaccinations/{id}/certificate`, `POST appointments`, `PUT appointments/{id}/medical`. Documented, not defects.

## 3. Verified strengths

- **Phase B vocabulary:** all status labels/filters use `requested→…→checkout→completed`; `vetStatus.js` mirrors backend exactly.
- **Duplicate-record prevention:** VetConsultation finds existing record by `appointment_id` before POSTing; update uses `PUT /medical-records/{id}`.
- **Idempotency:** `consultations/{id}/complete` sends `Idempotency-Key`; backend start/complete/recommend-confinement all carry `idempotency` middleware.
- **Append-only finalized records:** `isFinalized` disables all inputs; corrections only via addenda.
- **Clinical/billing separation:** vet never marks paid — `Send to Cashier` → `consultations/{id}/complete`; auto-close on payment verify.
- **Cancellation:** reason prompt (`showCancellationReasonPrompt`), `VET_CANCEL_RESTRICTED_STATUSES` blocks vet cancel after clinical work begins (manager/admin only).
- **Auth plumbing:** `apiRequest` attaches Sanctum token, `ProtectedRoute` redirects unauthenticated/ wrong-role navigation.
- **Abort/stale-state safety:** VetAppointments uses `AbortController` + `mountedRef`; silent 15 s refresh; `safeArray` normalizes response shapes.
- **vet_tech UI restriction:** intake board read-only; check-in only; no clinical actions rendered.

## 4. Findings

| ID | Sev | File:line | Finding |
| --- | --- | --- | --- |
| F-UI-01 | P3 | `VetDashboard.jsx:553` | "Recent Activity" mini-chart renders **hardcoded bar heights** `[40,65,45,80,55,90,70]` — decorative fake data presented as a chart. Violates "no fake chart data". Recommend deriving from `dashboardData` or removing the chart. |
| F-UI-02 | P3 | `VetDashboard.jsx:144` | `getMissedAppointments` filters `status === "missed" \|\| "no-show"` — neither is a real status (`no_show` uses underscore). Alert can never fire. Dead logic. |
| F-UI-03 | P3 | `VetDashboard.jsx:154-157` | `getCheckoutsToday` reads `b.checkout_date \|\| b.end_date` but boarder objects expose `check_out`/`check_out_date` (see VeterinaryCurrentBoarders:122,219). Alert always 0. |
| F-UI-04 | P3 | `VetDashboard.jsx:65` | Bare `catch {}` on dashboard fetch — total API failure renders "All systems normal • No alerts" + empty-state cards, indistinguishable from a healthy empty clinic. No error surface. |
| F-UI-05 | P3 | `VetDashboard.jsx:518` | "View Details" button has no `onClick` — dead control. |
| F-UI-06 | P3 | `VetAppointments.jsx:183` | History fetch is `status=completed,cancelled` — **`no_show` omitted** and no `no_show` filter chip exists, so no-show visits are invisible on this page (they do appear in VetHistory which uses `completed,cancelled,no_show`). |
| F-UI-07 | P3 | `components/veterinary/VetCurrentBoarders.jsx` | Entire 618-line file is **dead code** — `VetRoutes.jsx:17` imports `VeterinaryCurrentBoarders.jsx` (aliased); nothing imports this file. |
| F-UI-08 | P3 | `VetDashboard.jsx:76-78` | Stale comment "poll every 5 seconds" — actual interval 30 s. Cosmetic. |
| F-UI-09 | P3 | `VetReports.jsx:196` | `statusOptions` includes legacy `pending` (not a Phase-B status) — harmless dead option. |

**No P0–P2 frontend defects found by inspection.** All P3 items are documented; per the approved fix policy they are not patched in this round.

## 5. Separation-of-responsibilities check (frontend)

| Rule | Result |
| --- | --- |
| Vet must not approve/reject pending requests | ✅ — no approval UI in vet components; `requested` items show "Incoming/Unassigned" with clinical actions disabled |
| Vet must not verify payments / mark paid | ✅ — billing page only sends bill to cashier; pay actions are cashier-side |
| Vet must not do manual inventory adjustments | ✅ — inventory interaction is `recordInventoryUsage`/MAR-administer endpoints only (server-enforced deduction); no stock-edit UI |
| Vet must not manage users/roles | ✅ — no such UI |
| Boarders ≠ confinements | ✅ — `current-boarders` is a read-only hotel view; `medical-confinements` is the clinical ward page; distinct endpoints & components |
