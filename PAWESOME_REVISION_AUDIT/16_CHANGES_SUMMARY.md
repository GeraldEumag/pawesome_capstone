# 16 — Changes Summary

Branch: `audit/pawesome-final-acceptance`. All changes uncommitted at
time of writing; see report 17 for the diff-review notes.

## Backend — species / service compatibility (SYS-01)

| File | Change |
| --- | --- |
| `app/Services/PetServiceCompatibilityService.php` | Added `serviceTypeForServiceCategory()` — single category→service-type mapper. |
| `app/Http/Controllers/AppointmentController.php` | `store()` enforces pet↔service compatibility via the mapper. |
| `app/Http/Controllers/Customer/PortalController.php` | `bookAppointment()` same enforcement for customer bookings. |
| `app/Http/Controllers/ChatbotWorkflowController.php` | `createBooking()` same enforcement for AI-chatbot bookings. |
| `app/Http/Controllers/GroomingController.php` | `store()` requires `petId`, validates compatibility. |
| `app/Http/Controllers/Api/GroomingController.php` | Same for the receptionist grooming endpoint. |
| `app/Http/Controllers/ReceptionistRequestController.php` | `store()` enforces compatibility for known service types. |
| `app/Http/Controllers/BoardingController.php` | `store()` hotel-room path checks room `allowed_species`. |
| `app/Http/Controllers/BoardingRoomController.php` | Supporting species metadata on room create/update. |
| `app/Http/Controllers/Receptionist/WalkInController.php` | Walk-in bookings route through compatibility checks. |
| `app/Http/Controllers/Customer/CustomerStoreController.php` | Store-checkout path aligned (VAT + compat where applicable). |
| `app/Models/HotelRoom.php` | `allowed_species` cast/handling for reservation checks. |
| `tests/Feature/PetSpeciesEnforcementTest.php` | **New** — 11 tests covering accept/reject across channels. |

## Backend — VAT / receipts

| File | Change |
| --- | --- |
| `app/Models/Sale.php` | `calculateTotals()` aligned to VAT-inclusive convention (dead code, trap removed). |
| `app/Http/Controllers/Cashier/POSController.php` | Uses `ReceiptBreakdown::VAT_RATE` instead of literal. |
| `app/Http/Controllers/Cashier/DashboardController.php` | Two `0.12` literals → `ReceiptBreakdown::VAT_RATE`. |
| `app/Http/Controllers/Api/ServiceRequestController.php` | Same literal replacement. |
| `app/Support/EmailContent.php` | Receipt-email VAT literal → constant. |

## Backend — tests / fixtures

| File | Change |
| --- | --- |
| `tests/TestCase.php` | Added `protected function nextBookableDate(int $daysAhead = 1): Carbon` — skips holidays/non-bookable dates via `BookingAvailabilityService::isBookableDate`. |
| `tests/Feature/DatabaseIntegrityTest.php` | `now()->addDays*` → `nextBookableDate()`; reschedule-target guard. |
| `tests/Feature/FullSystemIntegrationTest.php` | Same date-bomb fixes. |
| `tests/Feature/NotificationMatrixTest.php` | Same. |
| `tests/Feature/VeterinaryWorkflowTest.php` | Same + reschedule collision guard. |
| `database/factories/PetFactory.php` | `species` pinned to `'Dog'` (was randomized → enforcement flake). |

Note on naming: the base helper is `nextBookableDate`; the pre-existing
private no-arg `bookableDate()` helpers in `AdminDeepAuditTest` and
`WalkInBookingTest` are untouched and coexist without collision.

## Frontend

| File | Change |
| --- | --- |
| `src/api/pos.js` | `generateReceipt` VAT now extracted from VAT-inclusive gross (`* 0.12 / 1.12`), total = subtotal − discount. Display-only; backend authoritative. |

## Deliverables

`PAWESOME_REVISION_AUDIT/` — reports 00–17 (this set).

## Intentionally not changed

- Legacy `/inventory/*` redirect aliases (intentional app behavior).
- `vet_tech` dev-seed gap (fixture, not code).
- OCR/receipt-scanning chain (verified safe as-is: cashier-confirm gated).
- Public API route surface (audited: all throttled, webhook secret, kiosk PIN — acceptable).
