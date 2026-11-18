<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\BookingAvailabilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Receptionist walk-in bookings. A hotel walk-in previously wrote
 * `boardings.room_id` unconditionally — a column no migration creates —
 * so the INSERT raised SQLSTATE 42S22 and the whole transaction rolled
 * back: the receptionist saw the flow complete but the booking never
 * reached the bookings board or the recent walk-ins list. The walk-in
 * path also never created a `boarding_room_reservations` row, so the
 * room was not held. Both now mirror BoardingController::store's
 * contract (schema-guarded room_id + a real reservation).
 */
class WalkInBookingTest extends TestCase
{
    use RefreshDatabase;

    private function receptionist(): User
    {
        return User::factory()->receptionist()->create();
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('walkin-test')->plainTextToken];
    }

    /** Next date the availability engine will actually accept a booking on. */
    private function bookableDate(): string
    {
        for ($d = 1; $d <= 14; $d++) {
            $date = now()->addDays($d)->toDateString();
            if (BookingAvailabilityService::isBookableDate($date)) {
                return $date;
            }
        }

        $this->fail('No bookable date found in the next 14 days.');
    }

    private function existingCustomer(): array
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);

        return [$customer, $pet];
    }

    public function test_hotel_walk_in_for_existing_customer_is_persisted_and_listed(): void
    {
        $receptionist = $this->receptionist();
        [$customer, $pet] = $this->existingCustomer();
        $room = BoardingRoom::factory()->create(['allowed_species' => ['dog']]);
        $date = $this->bookableDate();

        $response = $this->withHeaders($this->authHeaders($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'existing',
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'booking' => [
                    'service_type' => 'hotel',
                    'service_name' => 'Pet Hotel Stay',
                    'request_date' => $date,
                    'room_id' => $room->id,
                    'room_type' => $room->room_type,
                ],
            ]);

        $response->assertCreated()->assertJsonPath('success', true)
            ->assertJsonPath('data.booking_type', 'boarding');

        $boardingId = $response->json('data.booking_id');
        $serviceRequestId = $response->json('data.service_request_id');

        $this->assertDatabaseHas('boardings', [
            'id' => $boardingId,
            'service_request_id' => $serviceRequestId,
            'stay_type' => 'hotel_boarding',
            'booking_channel' => 'walk_in',
            'status' => 'pending',
        ]);

        // The room is actually held — this is what blocks availability and
        // what the bookings board reads for the room assignment.
        $reservation = DB::table('boarding_room_reservations')
            ->where('source_type', 'pet_hotel')
            ->where('source_id', $boardingId)
            ->first();
        $this->assertNotNull($reservation, 'Walk-in must create a boarding_room_reservations row');
        $this->assertSame($date, $reservation->check_in_date);

        // The booking must be visible where the receptionist looks for it.
        $this->withHeaders($this->authHeaders($receptionist))
            ->getJson('/api/receptionist/boarding-requests')
            ->assertOk()
            ->assertJsonFragment(['id' => $boardingId]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->getJson('/api/receptionist/walk-ins')
            ->assertOk()
            ->assertJsonFragment(['id' => $serviceRequestId]);
    }

    public function test_hotel_walk_in_for_new_customer_creates_account_pet_boarding_and_reservation(): void
    {
        $receptionist = $this->receptionist();
        $room = BoardingRoom::factory()->create(['allowed_species' => ['dog']]);
        $date = $this->bookableDate();

        $response = $this->withHeaders($this->authHeaders($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'new',
                'customer' => [
                    'first_name' => 'Walkin',
                    'last_name' => 'Guest',
                    'email' => 'walkin.guest@example.com',
                    'phone' => '09123456789',
                ],
                'pet' => ['name' => 'Rex', 'species' => 'Dog'],
                'booking' => [
                    'service_type' => 'hotel',
                    'service_name' => 'Pet Hotel Stay',
                    'request_date' => $date,
                    'room_id' => $room->id,
                    'room_type' => $room->room_type,
                ],
            ]);

        $response->assertCreated()->assertJsonPath('success', true)
            ->assertJsonPath('data.is_new_customer', true);

        $this->assertDatabaseHas('users', ['email' => 'walkin.guest@example.com', 'role' => 'customer']);
        $this->assertDatabaseHas('customers', ['email' => 'walkin.guest@example.com']);
        $this->assertDatabaseHas('pets', ['name' => 'Rex', 'species' => 'Dog']);
        $this->assertDatabaseHas('boardings', [
            'id' => $response->json('data.booking_id'),
            'booking_channel' => 'walk_in',
        ]);
        $this->assertNotNull(
            DB::table('boarding_room_reservations')
                ->where('source_type', 'pet_hotel')
                ->where('source_id', $response->json('data.booking_id'))
                ->first()
        );
    }

    public function test_grooming_walk_in_for_existing_customer_is_persisted_and_listed(): void
    {
        $receptionist = $this->receptionist();
        [$customer, $pet] = $this->existingCustomer();
        $date = $this->bookableDate();

        $response = $this->withHeaders($this->authHeaders($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'existing',
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'booking' => [
                    'service_type' => 'grooming',
                    'service_name' => 'Basic Grooming',
                    'request_date' => $date,
                    'request_time' => '10:00',
                ],
            ]);

        $response->assertCreated()->assertJsonPath('data.booking_type', 'grooming');

        $this->assertDatabaseHas('groomings', [
            'id' => $response->json('data.booking_id'),
            'service_request_id' => $response->json('data.service_request_id'),
            'booking_channel' => 'walk_in',
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->getJson('/api/receptionist/walk-ins')
            ->assertOk()
            ->assertJsonFragment(['id' => $response->json('data.service_request_id')]);
    }

    public function test_veterinary_walk_in_for_existing_customer_is_persisted_and_listed(): void
    {
        $receptionist = $this->receptionist();
        [$customer, $pet] = $this->existingCustomer();
        Service::factory()->create(['name' => 'Consultation', 'category' => 'Consultation']);
        $date = $this->bookableDate();

        $response = $this->withHeaders($this->authHeaders($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'existing',
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'booking' => [
                    'service_type' => 'veterinary',
                    'service_name' => 'Consultation',
                    'request_date' => $date,
                    'request_time' => '10:00',
                ],
            ]);

        $response->assertCreated()->assertJsonPath('data.booking_type', 'appointment');

        $this->assertDatabaseHas('appointments', [
            'id' => $response->json('data.booking_id'),
            'service_request_id' => $response->json('data.service_request_id'),
            'booking_channel' => 'walk_in',
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->getJson('/api/receptionist/walk-ins')
            ->assertOk()
            ->assertJsonFragment(['id' => $response->json('data.service_request_id')]);
    }

    public function test_hotel_walk_in_requires_a_room_selection(): void
    {
        $receptionist = $this->receptionist();
        [$customer, $pet] = $this->existingCustomer();

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'existing',
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'booking' => [
                    'service_type' => 'hotel',
                    'service_name' => 'Pet Hotel Stay',
                    'request_date' => $this->bookableDate(),
                ],
            ])
            ->assertStatus(422);

        $this->assertSame(0, Boarding::count());
        $this->assertSame(0, ServiceRequest::count());
    }
}
