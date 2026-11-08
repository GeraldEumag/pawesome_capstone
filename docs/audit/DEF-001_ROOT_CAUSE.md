# DEF-001 Root-Cause Investigation — Boarding Schedule 422

> **Verdict: fixture bug (test-side), NOT an application defect.** Resolved with a one-line fixture pin.

## Symptom
`Tests\Feature\ReceptionistCheckInGateTest › scheduling preserves a submitted payment proof` returned 422 (expected 200) in the full suite — reproduced under both loose and strict sql_mode.

## Reproduction
- Endpoint: `POST /api/receptionist/boarding-requests/{id}/schedule` (receptionist token)
- Payload: `room_id`, `check_in`/`check_out` = today, `check_in_time` 10:00, `check_out_time` 18:00, `total_amount` 500
- Fixture: `BoardingRoom` `dog_standard` with `allowed_species = ['dog']`; boarding created via `boarding()` helper → `Pet::factory()`

## Trace
`scheduleBoardingRoom` → `BoardingRoomService::assignRoomForBoarding` validates (line ~220):
`in_array(strtolower($pet->species), $allowedSpecies)` → returns `{success:false, "Pet species is not compatible with this room"}` → controller maps to **422**.

`PetFactory::definition()` assigns **`'species' => $this->faker->randomElement(['Dog','Cat','Bird','Rabbit','Fish'])`** — a 1-in-5 chance of `'Dog'`.

## Root cause
The test never constrained the pet's species while scheduling into a **dog-only** room. ~80% of runs the random pet is not a dog and the (correct) species guard rejects the schedule with 422. **The validation is working as designed — the test was flaky by construction.** Dates (`check_out` on-or-after `check_in`), payment-status rules, and room-availability logic were all eliminated as causes.

## Minimal correction
`tests/Feature/ReceptionistCheckInGateTest.php` — inside the failing test only, pin the fixture species to match the room constraint:

```php
$boarding->pet()->update(['species' => 'Dog']);
```

No application code, validation rules, or business logic changed.

## Regression evidence
- `ReceptionistCheckInGateTest`: **11 passed / 31 assertions** (previously 10 pass + 1 fail).
- Full-suite run: see `run.json` (`phase13_def001`) — baseline was 916 passed / 1 skipped / 1 failed.

## Remaining note
If the species guard ever fails in CI for a different reason (e.g., case handling — factory stores `'Dog'`, guard lowercases), the fixture pin remains correct since it matches `allowed_species` normalization.
