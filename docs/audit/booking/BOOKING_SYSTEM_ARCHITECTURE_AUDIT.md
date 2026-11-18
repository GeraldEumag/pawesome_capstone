# Booking System Architecture Audit

Verified against the working tree on 2026-11-18 (730 API routes, `route-matrix.txt` evidence).

## 1. Booking model architecture — the hub-and-spoke design

Pawesome does **not** keep three disconnected booking systems. One central
entity anchors every booking:

```
service_requests  (ServiceRequest — the customer-facing request/intake record)
    ├── appointments      (vet booking → consultation lifecycle)
    ├── groomings         (grooming booking → service execution)
    └── boardings         (hotel booking → stay lifecycle)
              └── boarding_room_reservations (modern room inventory blocks)
              └── boarding_care_logs         (per-day care entries)
```

- `service_requests.booking_channel` ∈ `online | walk_in` (`App\Support\BookingChannel`),
  stamped server-side. 210 legacy rows in the clone carry `NULL` channel
  (pre-dates the `2026_10_12_000000_add_booking_channel` migration).
- Child records link back via `service_request_id` on `appointments`,
  `groomings`, `boardings` — **none of these columns have a DB foreign key**
  (see DATABASE_RELATIONSHIP audit).
- `BookingWorkflowStage` (`app/Services/BookingWorkflowStage.php`) derives the
  unified customer-facing stage (`to_approve → to_pay → on_going →
  ready_to_pickup → complete | canceled`) from
  `service_requests.status + payment_status + appointments.status`, used by the
  customer bookings board.

## 2. Online booking paths (customer role)

| Module | Frontend form | Endpoint | Controller |
| --- | --- | --- | --- |
| Veterinary | `components/customers/VetForm.jsx` | `POST /api/customer/requests` | `Api\ServiceRequestController@store` |
| Grooming | `components/customers/GroomingForm.jsx` | `POST /api/customer/requests` | `Api\ServiceRequestController@store` |
| Hotel | `components/customers/HotelForm.jsx` | `POST /api/customer/boardings` (alias `boarding-requests`) | `BoardingController@store` |
| Availability | forms | `GET /api/customer/availability/{veterinary,grooming,boarding}`, `POST /check/*` | `Api\AvailabilityController` |
| Room picker | `HotelForm` | `GET /api/boarding/rooms/available` | public room-availability endpoint |

`ServiceRequestController@store` verifies `pet_id` ownership against the
authenticated customer, ignores spoofed `pet_name`, resolves price server-side,
runs `BookingAvailabilityService::lockServiceSchedule()` +
`isServiceTimeAvailable()` **inside** the booking `DB::transaction`, and applies
a duplicate-request guard (`pet_id` + service + date, ~line 281). Hotel requests
through this route are rejected — the dedicated boarding flow is mandatory
(covered by `CustomerBookingRulesTest`). `BookingChannel::ONLINE` is stamped
server-side; the client cannot supply it.

## 3. Walk-in path (receptionist role)

Single unified endpoint: `POST /api/receptionist/walk-ins`
→ `Receptionist\WalkInController@store`.

- `customer_mode: existing|new` — new customers create `users` + `customers` +
  `pets` rows inside the same `DB::transaction` (guest walk-ins get a real
  customer account; no separate guest model exists or is needed).
- Vet/grooming: `lockServiceSchedule()` + `isServiceTimeAvailable()` inside the
  transaction; requires `booking.request_time` (`H:i`).
- Hotel: requires a room selection; `BoardingRoom` path uses
  `lockForUpdate` + species gate + `isAvailable()` + creates a
  `boarding_room_reservations` row via `BoardingRoomService::createRoomReservation`;
  legacy `HotelRoom` path locks the room and counts blocking `boardings` rows.
- Rate is read from the room record — never the client.
- Stamps `booking_channel = walk_in`, `created_by`/approver metadata from the
  authenticated user — never the payload.
- `GET /api/receptionist/walk-ins` lists recent walk-in `service_requests`.

Same downstream entities as online — no parallel walk-in schema. Verified.

## 4. Approval & scheduling (receptionist)

| Module | Endpoints | Controller |
| --- | --- | --- |
| Vet / Grooming requests | `POST /api/receptionist/requests/{id}/approve|reject`, `PATCH .../status` | `ReceptionistRequestController` — `approve()` runs in `DB::transaction`, creates the `Appointment` (vet, ~line 958) or `Grooming` (~line 997) child row, sets `approved_by` from `request->user()` |
| Hotel requests | `POST /api/receptionist/boarding-requests/{id}/approve|reject|schedule` | `BoardingController` — `schedule()` persists `room_id` + reservation |
| Legacy appointments | `POST /api/receptionist/appointments/{id}/approve|reject|reschedule|cancel|check-in` | `AppointmentController` |

## 5. Service execution

| Module | Actor | Endpoints | Status machine |
| --- | --- | --- | --- |
| Veterinary | `veterinary`/`vet`/`vet_tech` | `POST /api/veterinary/appointments/{id}/start`, `PUT .../medical`, `PUT|PATCH .../status`, `POST .../check-in`; consultation workflow `POST /api/veterinary/consultations/{id}/start|complete` | `Appointment::VALID_STATUSES` (12 values) gated by `App\Support\VeterinaryStatus` stage groups (STARTABLE/INTAKE/STARTED/POST_CLINICAL/CANCEL_RESTRICTED/ASSIGNABLE) |
| Grooming | `receptionist` (no dedicated groomer role exists) | `PUT /api/grooming/{id}/status`, `POST .../complete`, `.../finalize-bill`, `.../inventory-usage` | `in:pending,approved,rejected,in_progress,completed,cancelled` — **no transition guard; see DEF-001** |
| Hotel ops | `receptionist` | `check-in → care-logs → ready-for-pickup → check-out` on `boarding-requests/{id}` | `boardings.status` enum (11 values); check-in gated on paid + scheduled-today (`ReceptionistCheckInGateTest`) |

## 6. Payment integration

Booking status and payment status are separate columns everywhere
(`service_requests.payment_status`, `boardings.payment_status` ∈
`unpaid|pending|partial|paid|rejected|refunded`; `appointments.payment_status`).
Customer uploads proof (`/payment-proof` endpoints) → `pending`; cashier
verifies/rejects (`/api/cashier/payment-requests/{id}/verify|reject`,
`boarding-payments/{id}/verify|reject`); `uploadPaymentProof` never marks paid;
double-verify returns 4xx. Completion gates: grooming `completed` requires
`payment_status=paid` + `ServiceBillingService::canCompleteService`; boarding
`check-in` requires paid + scheduled-today; vet has `ServiceBillingPaymentRequest`
+ `VisitInvoice`/`ServiceBillingController::finalizeBill` billing chain.

## 7. Authoritative vs legacy table map

| Concern | Authoritative | Legacy/parallel | Evidence |
| --- | --- | --- | --- |
| Vet booking record | `appointments` | `vet_appointments` — **retired** by migration `2026_09_28_000002` (table absent) | migration |
| Grooming record | `groomings` (+ `service_requests`) | `grooming_appointments` — only referenced by legacy `App\Http\Controllers\GroomingController` (the customer `api/customer/grooming` route) | grep: sole consumer |
| Room catalog | `boarding_rooms` | `hotel_rooms` — still FK'd from `boardings.hotel_room_id`, still has receptionist CRUD routes | FK scan + routes |
| Room availability | `boarding_room_reservations` (`overlappingDates`, statuses pending→confined) | `boardings.hotel_room_id` blocking-count for legacy rooms | `BoardingRoomService`, `BoardingRoom::isAvailable` |
| Booking record | `service_requests` + module child | — | hub design |

Legacy `hotel_rooms` handling is deliberate dual-stack support (see
`WalkInController` hotel path and `legacy hotel room schedule still uses the
hotel room id contract` test) — **not** a duplicate-source defect; documented,
not merged.

## 8. Frontend module map

- Customer: `VetForm`, `GroomingForm`, `HotelForm`, `CustomerBookingsBoard`,
  `CustomerRequestStatus`, `CustomerPayments`, `CustomerPets`,
  `CustomerNotifications`, `CustomerReports` (`components/customers/`).
- Receptionist: `ReceptionistApprovals` (requests queue), `ReceptionistBookings`,
  `ReceptionistHotelBookings`/`ReceptionistBoardingManager`,
  `ReceptionistGrooming(Bookings)`, `ReceptionistWalkIn*` (walk-in creation),
  `ReceptionistCheckInForm/CheckOutForm`, `ReceptionistAppointmentList`,
  room CRUD via `Receptionist*Rooms`.
- Veterinary: `VetDashboard`, `VetAppointments`, `VetConsultation`,
  `VetEditAppointment`, `VetHistory`, `VeterinaryCurrentBoarders`,
  `VetDiagnosticsPanel`, `VetAppointmentBilling`, `vetStatus.js` badge map.
- Shared API client: `src/api/client.js::apiRequest` (reads
  `VITE_API_BASE_URL`, bearer token), `src/api/grooming.js` for grooming calls.
- Chatbot booking surfaces exist (`ChatbotWorkflowController` booking/hotel
  endpoints) — same controllers enforce the same rules.

## 9. Notifications / logs / reports hooks

- `WorkflowNotifier` + `NotificationService` emit request/booking lifecycle
  notifications (approval, rejection, completion — e.g.
  `sendGroomingCompletionNotification`); `NotificationMatrixTest` covers matrix.
- `activity_logs` record mutating actions (admin-viewable).
- Reports: `Admin\ReportsController@serviceRequests/veterinary` per-role report
  routes; `BookingWorkflowStage` supplies the customer tracker stage.

## 10. Confirmed strengths vs defect candidates (carried to tracker)

Strengths verified in code/tests: transactions on every multi-write path;
server-side price/schedule/room resolution; `lockForUpdate` on rooms and
service schedule; duplicate-submit guard; `Idempotency-Key` middleware (POS);
status enums on `service_requests`/`boardings`/`reservations`; 96-test green
baseline.

Candidates for live probing (Phase C): grooming `updateStatus` has **no
transition-state guard** (DEF-001); `service_request_id` columns lack FKs
(DB-001); `appointments.status`/`groomings.status` are free varchar, not enums
(DB-002); dual `cancelled`/`canceled` spellings in `service_requests.status`
enum (DB-003); 210 NULL `booking_channel` legacy rows (DB-004).
