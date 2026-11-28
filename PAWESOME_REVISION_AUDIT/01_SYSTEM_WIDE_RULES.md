# 01 — System-Wide Rules Audit

**Scope:** animal-type (species) enforcement, required-field parity,
"Other"-reason conditional fields — verified against current code on
`audit/pawesome-final-acceptance`.

## 1. Animal-type rules — authoritative source

- `pets.species` is the authoritative field (free-text `varchar(255)`,
  `PetController@store|update` requires `name` + `species` only).
- Business rules live in `App\Services\PetServiceCompatibilityService`
  (`SPECIES_SERVICE_RULES`): Dog/Cat full service; Rabbit/Bird/Hamster
  hotel-with-approval, no grooming; Fish/Reptile/Other no hotel, vet with
  approval, no grooming. Unknown species strings fall back to `Other`
  (conservative).
- Category → service-type mapping centralized in the new
  `PetServiceCompatibilityService::serviceTypeForCategory()`:
  `grooming` → grooming; `hotel|boarding|boarding care|daycare|pet hotel` →
  petHotel; everything else → veterinary.

## 2. Species enforcement matrix (verified server-side)

| Entry point | Enforcement | Status |
| --- | --- | --- |
| `POST /api/appointments` (`AppointmentController@store`) | compat check via `serviceTypeForCategory(service.category)` before insert | **FIXED this audit** (was missing) |
| `POST /api/customer/appointments` (`PortalController@bookAppointment`) | same | **FIXED** |
| Chatbot booking (`ChatbotWorkflowController@createBooking`) | same | **FIXED** |
| Chatbot hotel booking legacy path (`createHotelBooking`) | `allowed_species` map on room type | **FIXED** |
| `POST /api/customer/requests` + receptionist request store/approve/status (`ReceptionistRequestController`, `Api\ServiceRequestController`) | request-type → petHotel/grooming/veterinary mapping, checked at submit AND approve/status transitions | verified + **extended** (pet-compat on approve/status) |
| `POST /api/groomings` customer legacy (`GroomingController@store`) | petId now required + compat check | **FIXED** (petId was optional → bypass) |
| `POST /api/receptionist/groomings` (`Api\GroomingController@store`) | compat check | **FIXED** |
| Walk-in (`Receptionist\WalkInController`) | grooming compat + boarding_room `allowed_species` | already enforced |
| Boarding `POST /api/boardings` (`BoardingController@store`) | legacy `hotel_room_id`: type→species map; modern `room_id`: `BoardingRoomService::createRoomReservation` `allowed_species` + petHotel approval/manual-quote metadata | verified |
| Boarding room assign/reschedule (`assignRoomForBoarding`) | `allowed_species` re-check under row lock | verified |

**Evidence:** `tests/Feature/PetSpeciesEnforcementTest.php` — 11 tests,
all booking channels reject incompatible species (Fish→grooming,
Bird→receptionist grooming, Hamster→chatbot, Cat→dog-kennel room, etc.)
and accept compatible ones. 11/11 pass.

## 3. Required-field parity (spot-verified)

| Module | Frontend | Backend | DB | Result |
| --- | --- | --- | --- | --- |
| Pet create/edit | name, species required | `PetController` `required` name+species; breed/birthdate/gender/notes nullable | `pets.name`, `pets.species`, `pets.customer_id` NOT NULL; rest nullable | PASS |
| Pet archive | reason | `archive_reason required|string|min:3|max:500` | `archive_reason` column | PASS |
| Boarding create | pet, room, dates, vaccination card (customer) | validator mirrors; customer `vaccination_card required`; staff nullable | boarding columns nullable where expected | PASS |
| POS transaction | items, payment method | server re-derives prices; `Idempotency-Key` middleware | `sales`/`sale_items`/`payments` | PASS |
| Stock out | reason_code + per-reason fields | `STOCK_OUT_REQUIRED_FIELDS` enforced in `InventoryService::validateStockOutReasonFields` | n/a | PASS |
| Payment rejection | reason | `PaymentVerificationService::performReject` hard-requires non-empty `rejection_reason` (422 otherwise) | persisted on record + activity log | PASS |

Full per-field matrix for every form is out of proportion for this pass;
spot checks found no frontend-required/backend-optional or
backend-required/frontend-missing mismatches on the critical write paths.

## 4. "Other" reason dropdowns

| Surface | Conditional field | Backend validation | Persistence |
| --- | --- | --- | --- |
| Stock-out reason `other` | `explanation` textarea (StockOutPage.jsx) | `STOCK_OUT_REQUIRED_FIELDS['other'] = ['explanation']` | `inventory_logs.reason_code/line_details`, queued to approval (`STOCK_OUT_APPROVAL_REASONS` incl. `other`) |
| Permanent item delete `other` | `reason_details` | `required_if:reason,other` + service-level `mb_strlen >= 3` | `reason` + `reason_details` on delete audit/activity log |
| Payment proof rejection | free-text `rejection_reason` | required non-empty server-side | `rejection_reason`/`rejected_by`/`rejected_at` + customer notification + email |
| Sensitive stock-out reasons (damaged/expired/lost/internal/supplier/disposal/other) | per-reason detail fields | required-field map + manager/admin approval queue before stock moves | `stock_requests`/approval records |

No gaps found: every "Other" path has a conditional detail field enforced
both client-side (UX) and server-side (authoritative), and sensitive
reasons route through approval rather than executing silently.

## 5. Defects fixed under this stage

- **P1 — species enforcement gaps** on 6 booking channels (see matrix).
- **P2 — misleading availability error**: `AppointmentController@store`
  (and sibling endpoints) return "Time slot overlaps an existing booking."
  for ANY unavailability including holidays/closed days. Real reason is
  available via `BookingAvailabilityService::serviceTimeUnavailableReason()`;
  controllers should surface it. *(Partial fix: test-suite date bombs
  removed; message-mapping improvement tracked in known issues.)*
- **P2 — test date bombs**: `now()->addDays(n)` booking dates collide with
  `holidays` rows (verified failure on Bonifacio Day). Fixed via
  `Tests\TestCase::nextBookableDate()`.
- **P3 — factory flake**: `PetFactory` random species vs random service
  category → probabilistic 422s once enforcement landed. Pinned default
  species to `Dog`.
