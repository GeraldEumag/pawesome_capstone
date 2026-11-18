# Booking API Endpoint Matrix

Generated from `php artisan route:list` (730 routes) on 2026-11-18 — see
`evidence/route-matrix.txt`. All endpoints are under `/api`, behind
`ApiTokenAuth` + `throttle:api` unless marked **public**. `verified` =
`EnsureEmailIsVerified` (customers only).

## Customer — online booking

| Method | Path | Roles | Controller@action | Notes |
| --- | --- | --- | --- | --- |
| GET | `customer/pets` | customer | `PetController@index` | pet picker source |
| GET | `customer/services` | customer | `PortalController@services` | service catalog |
| GET | `customer/availability/veterinary` | customer | `Api\AvailabilityController@veterinary` | 30-min slots, per-vet |
| GET | `customer/availability/grooming` | customer | `Api\AvailabilityController@grooming` | |
| GET | `customer/availability/boarding` | customer | `Api\AvailabilityController@boarding` | |
| POST | `customer/availability/check/veterinary-slot` | customer | `Api\AvailabilityController@checkVeterinarySlot` | |
| POST | `customer/availability/check/grooming-date` | customer | `Api\AvailabilityController@checkGroomingDate` | |
| POST | `customer/availability/check/boarding-room` | customer | `Api\AvailabilityController@checkBoardingRoom` | |
| GET | `boarding/rooms/available` | **public** | (landing/room availability) | room picker for HotelForm |
| POST | `customer/requests` | customer + verified | `Api\ServiceRequestController@store` | vet + grooming requests; hotel type rejected |
| GET | `customer/my-requests` · `customer/requests/history` | customer | `Api\ServiceRequestController@customerRequests` | |
| PATCH | `customer/requests/{id}/cancel` | customer | `Api\ServiceRequestController@cancel` | owner-scoped |
| POST | `customer/requests/{id}/payment-proof` | customer | `Api\ServiceRequestController@uploadPaymentProof` | proof → `pending`, never `paid` |
| GET | `customer/requests/{id}/receipt` | customer | `Api\ServiceRequestController@receipt` | |
| GET | `customer/bookings` | customer | `Customer\BookingBoardController@index` | unified tracker (BookingWorkflowStage) |
| POST | `customer/boardings` · `customer/boarding-requests` | customer + verified | `BoardingController@store` | hotel booking |
| GET | `customer/boardings` · `customer/boarding-requests` | customer | `BoardingController@index` | |
| GET | `customer/boardings/available-rooms` | customer | `BoardingController@availableRooms` | |
| GET | `customer/boarding-requests/{id}` | customer | `BoardingController@show` | owner-scoped |
| POST | `customer/boarding-requests/{id}/cancel` · `boardings/{id}/cancel` | customer | `BoardingController@cancel` | |
| POST | `customer/boarding-requests/{id}/vaccination-card` | customer | `BoardingController@uploadVaccinationCard` | required before approval |
| POST | `customer/boarding-requests/{id}/payment-proof` | customer | `BoardingController@uploadPaymentProof` | |
| GET | `customer/boarding-requests/{id}/care-logs` | customer | `BoardingController@careLogs` | customer-visible care updates |
| POST | `customer/appointments` | customer + verified | `PortalController@bookAppointment` | **legacy** vet path — still availability-checked |
| GET | `customer/appointments` | customer | `PortalController@appointments` | |
| POST | `customer/grooming` · GET `customer/grooming*` | customer | `GroomingController` (legacy) | legacy grooming path — uses `Grooming` model; availability-checked per `BookingSchedulingIntegrityTest` |
| POST | `customer/billing/veterinary/{id}/online-payment` · `cashier-payment` | customer + verified | `VeterinaryBillingController` | vet billing intents |
| GET | `customer/billing/payment-requests/{id}/receipt` | customer | `VeterinaryBillingController@receipt` | |

## Receptionist — approval, scheduling, walk-in, ops

| Method | Path | Roles | Controller@action | Notes |
| --- | --- | --- | --- | --- |
| GET | `receptionist/requests` · `requests/pending` · `requests/approval-history` · `requests/rejected-history` · `scheduling/history` | receptionist | `ReceptionistRequestController` | unified request queue |
| POST | `receptionist/requests` | receptionist | `ReceptionistRequestController@store` | staff-side request creation |
| POST | `receptionist/requests/{id}/approve` | receptionist | `ReceptionistRequestController@approve` | creates `Appointment`/`Grooming`; txn; `approved_by=auth user` |
| POST | `receptionist/requests/{id}/reject` | receptionist | `ReceptionistRequestController@reject` | reason required (`ReceptionistReasonRequiredTest`) |
| PATCH | `receptionist/requests/{id}/status` | receptionist | `ReceptionistRequestController@updateStatus` | |
| GET | `receptionist/walk-ins` | receptionist | `Receptionist\WalkInController@index` | walk_in-channel requests only |
| POST | `receptionist/walk-ins` | receptionist | `Receptionist\WalkInController@store` | unified vet/grooming/hotel walk-in |
| GET | `receptionist/customers/search` | receptionist | `Receptionist\WalkInController@searchCustomers` | walk-in customer picker |
| POST | `receptionist/customers` | receptionist | `Api\ReceptionistCustomerController@store` | register new customer |
| GET/POST | `receptionist/pets` | receptionist | `Api\ReceptionistPetController` | register pet |
| GET | `receptionist/boarding-requests` · `/pending` | receptionist | `BoardingController@index|pending` | hotel queue |
| POST | `receptionist/boarding-requests/{id}/approve` | receptionist | `BoardingController@approve` | requires verified vaccination card (online) |
| POST | `receptionist/boarding-requests/{id}/reject` | receptionist | `BoardingController@reject` | reason required |
| POST | `receptionist/boarding-requests/{id}/verify-vaccination` | receptionist | `BoardingController@verifyVaccinationCard` | |
| POST | `receptionist/boarding-requests/{id}/schedule` | receptionist | `BoardingController@schedule` | persists room + reservation |
| POST | `receptionist/boarding-requests/{id}/check-in` | receptionist | `BoardingController@checkIn` | paid + scheduled-today gate |
| POST/GET | `receptionist/boarding-requests/{id}/care-logs` | receptionist | `BoardingController@addCareLog|careLogs` | |
| POST | `receptionist/boarding-requests/{id}/ready-for-pickup` | receptionist | `BoardingController@readyForPickup` | |
| POST | `receptionist/boarding-requests/{id}/check-out` | receptionist | `BoardingController@checkOut` | releases room |
| POST/GET | `receptionist/boarding-requests/{id}/inventory-usage(-history)` | receptionist | `BoardingController` | boarding consumables |
| GET/POST/PUT/DELETE | `receptionist/boarding-rooms*` | receptionist | `Receptionist\BoardingRoomController` | modern room catalog CRUD |
| GET/POST/PUT/DELETE | `receptionist/hotel-rooms*` | receptionist | `Receptionist\HotelRoomController` | legacy room catalog CRUD |
| GET | `receptionist/appointments` · `appointment/list` | receptionist | `DashboardController@appointments` · `AppointmentController@index` | |
| POST | `receptionist/appointments` | receptionist | `AppointmentController@store` | direct appointment creation |
| GET/PUT | `receptionist/appointments/{id}` | receptionist | `AppointmentController@show|update` | |
| POST | `receptionist/appointments/{id}/approve|reject|reschedule|cancel|check-in` | receptionist (cancel also manager,admin) | `AppointmentController` | status-gated |
| GET | `receptionist/veterinarians/available` · `veterinarians/{id}/schedule` | receptionist | `AppointmentController` | vet picker/schedule |
| GET/POST/PUT/DELETE | `grooming/*` | receptionist | `Api\GroomingController` | grooming queue + `updateStatus|complete|finalize-bill|inventory-usage`; **no transition guard — DEF-001** |
| GET | `receptionist/services*` | receptionist | `Api\ServiceCatalogController` | service catalog CRUD |

## Veterinary staff — execution

| Method | Path | Roles | Controller@action |
| --- | --- | --- | --- |
| GET | `veterinary/appointments` | veterinary,vet,vet_tech | `Veterinary\DashboardController@appointments` |
| POST | `veterinary/appointments` | veterinary,vet | `AppointmentController@store` |
| GET/PUT | `veterinary/appointments/{id}` | veterinary,vet | `DashboardController@appointment` · `AppointmentController@update` |
| POST | `veterinary/appointments/{id}/check-in` | receptionist,vet_tech,veterinary | `AppointmentController@checkIn` |
| POST | `veterinary/appointments/{id}/start` | veterinary,vet | `AppointmentController@start` (STARTABLE gate) |
| PUT | `veterinary/appointments/{id}/medical` | veterinary,vet | `AppointmentController@updateMedical` |
| PUT/PATCH | `veterinary/appointments/{id}/status` | veterinary,vet | `AppointmentController@updateStatus` (stage-gated) |
| POST | `veterinary/consultations/{id}/start` · `/complete` · `/recommend-confinement` | veterinary,vet | `Veterinary\ConsultationWorkflowController` |
| GET | `veterinary/consultations` · `/scheduled` | veterinary,vet | `ConsultationWorkflowController` |
| POST/GET | `veterinary/appointments/{id}/diagnostics*` | veterinary,vet(+vet_tech for collect/result) | `DiagnosticOrderController` |
| GET/POST/PUT/DELETE | `veterinary/medical-records*` · `pets/{pet}/medical-history` | veterinary,vet | `MedicalRecordController` (finalize/lock/addenda) |
| POST/GET | `veterinary/appointments/{id}/inventory-usage*` | veterinary,vet | `MedicalRecordController` |
| POST | `veterinary/appointments/{id}/finalize-bill` | veterinary,vet | `Api\ServiceBillingController@finalizeBill` |
| GET | `veterinary/boardings/current-boarders` · `boardings/{id}` | veterinary | `BoardingController` | clinical visibility |
| GET | `veterinary/history` · `reports/*` · `receipt/{id}` · `patients` · `customers*` · `pets/{pet}/*` | veterinary,vet | various | read-mostly support surfaces |

## Cashier — payment verification (booking-adjacent)

| Method | Path | Roles | Controller@action |
| --- | --- | --- | --- |
| GET | `cashier/payment-requests` · `boarding-payments/pending` · `confinement-payments/pending` | cashier | `Cashier\DashboardController@getPaymentRequests` |
| POST | `cashier/payment-requests/{id}/verify` · `/reject` | cashier | `Cashier\DashboardController@verifyPayment|rejectPayment` |
| POST | `cashier/boarding-payments/{id}/verify` · `/reject` | cashier | same, `defaults('type','boarding')` |

## Admin / Manager / Reports (booking read surfaces)

`GET admin/appointments`, `admin/boardings*`, `admin/grooming*` (admin only, view);
`GET reports/service-requests|veterinary|boarding` for receptionist / manager /
admin / veterinary report surfaces (`Admin\ReportsController`,
`WorkflowReportController@boarding`).

## Chatbot (same rule surface)

`POST workflow/bookings`, `workflow/hotel-bookings`, `GET workflow/*-options`,
`workflow/hotel/availability` — customer + front-desk roles, `verified` gated on
creation. Reuses the same availability services.

## Findings from the matrix

- **0 missing endpoints** — every frontend call observed maps to a live route.
- Role gates are on every mutation; `super_receptionist` normalizes through
  `EnsureRole` composite handling (AGENTS.md).
- Legacy-but-live surfaces: `customer/appointments` (PortalController),
  `customer/grooming` (legacy `GroomingController`), `hotel-rooms` CRUD.
- `boarding/rooms/available` is public by design (landing page picker).
