<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerBookingRulesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function customer(): User
    {
        return User::factory()->customer()->create();
    }

    private function petFor(User $user, string $species = 'Dog'): Pet
    {
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);

        return Pet::factory()->create(['customer_id' => $customer->id, 'species' => $species]);
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('customer-booking-test')->plainTextToken];
    }

    private function registeredPet(User $user, ?string $species = null): Pet
    {
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);

        return Pet::factory()->create([
            'customer_id' => $customer->id,
            'name' => 'Milo',
            'species' => $species ?? 'Dog',
        ]);
    }

    public function test_staff_cannot_submit_customer_service_requests(): void
    {
        $receptionist = User::factory()->receptionist()->create();

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson('/api/customer/requests', [])
            ->assertForbidden();
    }

    public function test_customer_can_cancel_a_service_request_with_the_cancelled_status(): void
    {
        $user = $this->customer();
        $receptionist = User::factory()->receptionist()->create();
        $serviceRequest = ServiceRequest::create([
            'customer_id' => $user->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_name' => 'Milo',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::tomorrow()->toDateString(),
            'request_time' => '10:00',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson("/api/customer/requests/{$serviceRequest->id}/cancel", [
                'reason' => 'Pet is sick or unavailable',
            ])
            ->assertOk()
            ->assertJsonPath('request.status', 'cancelled');

        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'status' => 'cancelled',
            'cancellation_reason' => 'Pet is sick or unavailable',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $receptionist->id,
            'role' => 'receptionist',
            'related_type' => 'service_request',
            'related_id' => $serviceRequest->id,
            'type' => 'warning',
        ]);
    }

    public function test_customer_cannot_make_a_same_day_service_request_after_store_closes_but_can_book_a_future_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 23:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $headers = $this->authHeaders($user);
        $booking = [
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_time' => '16:30',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [
                ...$booking,
                'requested_date' => Carbon::today()->toDateString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.requested_date.0', 'Same-day bookings are closed after 6:00 PM. Please choose a future date.');

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [
                ...$booking,
                'requested_date' => Carbon::tomorrow()->toDateString(),
            ])
            ->assertCreated();
    }

    public function test_veterinary_availability_filters_overlapping_slots_and_allows_adjacent_times(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $headers = $this->authHeaders($user);
        $date = Carbon::tomorrow()->toDateString();
        $booking = [
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'request_type' => 'vet',
            'service_name' => 'General Consultation',
            'requested_date' => $date,
        ];

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [...$booking, 'request_time' => '10:00'])
            ->assertCreated();

        $availability = $this->withHeaders($headers)
            ->getJson('/api/customer/availability/veterinary?date=' . $date . '&service_name=General%20Consultation')
            ->assertOk();
        $slots = collect($availability->json('slots'))->keyBy('time');
        $this->assertFalse($slots['10:00']['available']);
        $this->assertFalse($slots['10:30']['available']);
        $this->assertTrue($slots['11:00']['available']);

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [...$booking, 'request_time' => '10:30'])
            ->assertUnprocessable();
        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [...$booking, 'request_time' => '11:00'])
            ->assertCreated();
    }

    public function test_grooming_availability_filters_overlapping_slots_and_releases_cancelled_bookings(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $headers = $this->authHeaders($user);
        $date = Carbon::tomorrow()->toDateString();
        $booking = [
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'requested_date' => $date,
            'request_time' => '10:00',
        ];

        $created = $this->withHeaders($headers)
            ->postJson('/api/customer/requests', $booking)
            ->assertCreated();
        $requestId = $created->json('request.id');
        $this->assertDatabaseHas('service_requests', ['id' => $requestId, 'pet_type' => 'Dog']);

        $availability = $this->withHeaders($headers)
            ->getJson('/api/customer/availability/grooming?date=' . $date . '&service_name=Bath%20and%20Brush')
            ->assertOk();

        $slots = collect($availability->json('slots'))->keyBy('time');
        $this->assertFalse($slots['10:00']['available']);
        $this->assertFalse($slots['11:00']['available']);
        $this->assertTrue($slots['11:30']['available']);

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [...$booking, 'request_time' => '11:30'])
            ->assertCreated();

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [...$booking, 'request_time' => '11:00'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.requested_time.0', 'Time slot overlaps an existing booking.');

        $this->withHeaders($headers)
            ->patchJson("/api/customer/requests/{$requestId}/cancel")
            ->assertOk();

        $releasedSlots = $this->withHeaders($headers)
            ->getJson('/api/customer/availability/grooming?date=' . $date . '&service_name=Bath%20and%20Brush')
            ->assertOk()
            ->json('slots');

        $releasedByCancellation = collect($releasedSlots)->keyBy('time');
        $this->assertTrue($releasedByCancellation['10:00']['available']);
        $this->assertFalse($releasedByCancellation['11:30']['available']);
    }

    public function test_completed_grooming_request_releases_its_availability_slot(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $date = Carbon::tomorrow()->toDateString();
        ServiceRequest::create([
            'customer_id' => $user->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_name' => 'Milo',
            'pet_type' => 'Dog',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => $date,
            'request_time' => '10:00',
            'status' => 'completed',
            'payment_status' => 'paid',
        ]);

        $slots = $this->withHeaders($this->authHeaders($user))
            ->getJson('/api/customer/availability/grooming?date=' . $date . '&service_name=Bath%20and%20Brush')
            ->assertOk()
            ->json('slots');

        $this->assertTrue(collect($slots)->firstWhere('time', '10:00')['available']);
    }

    public function test_overlapping_hotel_stays_are_rejected_for_the_same_room(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
        // Pin a boarding-compatible species — a randomized Fish pet would be
        // rejected by pet compatibility before the overlap gate under test.
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);
        $room = HotelRoom::factory()->create(['status' => 'available']);
        $booking = [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in_date' => Carbon::tomorrow()->toDateString(),
            'number_of_days' => 1,
        ];

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/boarding-requests', $booking)
            ->assertCreated();

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/boarding-requests', $booking)
            ->assertUnprocessable();
    }

    public function test_landing_hotel_request_rejects_unavailable_room_type(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);
        $date = Carbon::tomorrow()->toDateString();
        $occupiedRoom = HotelRoom::factory()->create(['status' => 'available', 'type' => 'suite']);
        HotelRoom::factory()->create(['status' => 'available', 'type' => 'deluxe']);
        Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'hotel_room_id' => $occupiedRoom->id,
            'check_in' => $date,
            'check_out' => $date,
            'status' => 'approved',
        ]);
        $request = [
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'pet_type' => 'Dog',
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'requested_date' => $date,
            'requested_time' => '10:00',
            'check_in_date' => $date,
            'check_out_date' => $date,
        ];

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/requests', [...$request, 'room_type' => 'suite'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['room_type']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/requests', [...$request, 'room_type' => 'deluxe'])
            ->assertCreated();
    }

    public function test_customer_cannot_make_a_same_day_hotel_booking_after_store_closes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 23:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
        ]);
        // Pin a boarding-compatible species — a randomized Fish pet would be
        // rejected by pet compatibility before the same-day gate under test.
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/boardings', [
                'pet_id' => $pet->id,
                'check_in_date' => Carbon::today()->toDateString(),
                'number_of_days' => 1,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.check_in_date.0', 'Same-day hotel bookings are closed after 6:00 PM. Please choose a future date.');

        $this->assertDatabaseMissing('boardings', [
            'pet_id' => $pet->id,
            'check_in' => Carbon::today()->toDateString(),
        ]);
    }

    public function test_service_request_requires_a_registered_pet(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'customer_email' => $user->email,
                'pet_name' => 'Milo',
                'request_type' => 'grooming',
                'service_name' => 'Bath and Brush',
                'requested_date' => Carbon::tomorrow()->toDateString(),
                'requested_time' => '10:00',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['pet_id']);

        $this->assertDatabaseMissing('service_requests', ['pet_name' => 'Milo']);
    }

    public function test_customer_cannot_book_using_another_customers_pet(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $other = $this->customer();
        $foreignPet = $this->petFor($other);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'customer_email' => $user->email,
                'pet_id' => $foreignPet->id,
                'request_type' => 'grooming',
                'service_name' => 'Bath and Brush',
                'requested_date' => Carbon::tomorrow()->toDateString(),
                'requested_time' => '10:00',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('service_requests', ['pet_id' => $foreignPet->id]);
    }

    public function test_service_request_ignores_spoofed_pet_name_and_links_the_selected_pet(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'customer_email' => $user->email,
                'pet_id' => $pet->id,
                'pet_name' => 'Forged Name',
                'request_type' => 'grooming',
                'service_name' => 'Bath and Brush',
                'requested_date' => Carbon::tomorrow()->toDateString(),
                'requested_time' => '10:00',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('service_requests', [
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
        ]);
        $this->assertDatabaseMissing('service_requests', ['pet_name' => 'Forged Name']);
    }

    public function test_legacy_customer_appointment_endpoint_rejects_an_overlapping_service_time(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $service = Service::factory()->create([
            'name' => 'General Check-up',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $date = Carbon::tomorrow()->toDateString();

        Appointment::create([
            'customer_id' => $pet->customer_id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'status' => 'approved',
            'scheduled_at' => Carbon::parse("{$date} 10:00:00", 'Asia/Manila')->utc(),
            'price' => $service->price,
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/appointments', [
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => Carbon::parse("{$date} 10:30:00", 'Asia/Manila')->utc()->toISOString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.scheduled_at.0', 'Time slot overlaps an existing booking.');
    }

    public function test_legacy_customer_grooming_accepts_date_only_input_and_preserves_date_cast(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $date = Carbon::tomorrow()->toDateString();

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/grooming', [
                'petId' => $pet->id,
                'petName' => $pet->name,
                'service' => 'bath',
                'date' => $date,
            ])
            ->assertCreated()
            ->assertJsonPath('appointment.pet_id', $pet->id)
            ->assertJsonPath('appointment.appointment_date', Carbon::parse($date, 'UTC')->toISOString());
    }

    public function test_modern_room_availability_ignores_legacy_hotel_room_with_same_numeric_id(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $date = Carbon::tomorrow()->toDateString();
        $legacyRoom = HotelRoom::factory()->create(['status' => 'available']);
        $modernRoom = BoardingRoom::forceCreate([
            'id' => $legacyRoom->id,
            'room_code' => 'POOL-ROOM-1',
            'room_name' => 'Modern Dog Room',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'max_capacity' => 1,
            'total_rooms' => 1,
            'daily_rate' => 800,
            'is_active' => true,
            'customer_selectable' => true,
        ]);

        $this->assertSame($legacyRoom->id, $modernRoom->id);

        Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $pet->customer_id,
            'hotel_room_id' => $legacyRoom->id,
            'check_in' => $date,
            'check_out' => $date,
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);

        $response = $this->getJson('/api/boarding/rooms/available?' . http_build_query([
            'species' => 'dog',
            'check_in_date' => $date,
            'check_out_date' => $date,
        ]))->assertOk();

        $availableModernRoom = collect($response->json('rooms'))
            ->firstWhere('id', $modernRoom->id);

        $this->assertNotNull($availableModernRoom);
        $this->assertTrue($availableModernRoom['available']);
        $this->assertSame(1, $availableModernRoom['available_rooms']);
    }
}
