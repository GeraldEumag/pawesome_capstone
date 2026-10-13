<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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
        Storage::fake('private');
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
            ->post('/api/customer/boarding-requests', $booking + [
                'vaccination_card' => UploadedFile::fake()->create('milo-card.png', 100, 'image/png'),
            ])
            ->assertCreated();

        $this->withHeaders($this->authHeaders($user))
            ->post('/api/customer/boarding-requests', $booking + [
                'vaccination_card' => UploadedFile::fake()->create('milo-card-duplicate.png', 100, 'image/png'),
            ])
            ->assertUnprocessable();
    }

    public function test_legacy_hotel_service_request_route_requires_the_dedicated_boarding_flow(): void
    {
        $user = $this->customer();
        $pet = $this->petFor($user, 'Dog');

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'customer_email' => $user->email,
                'pet_id' => $pet->id,
                'request_type' => 'hotel',
                'service_name' => 'Pet Hotel',
                'requested_date' => Carbon::tomorrow()->toDateString(),
                'check_out_date' => Carbon::tomorrow()->toDateString(),
                'room_type' => 'standard',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Pet hotel bookings must use the Pet Hotel reservation form so a vaccination card can be attached.');
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

        Storage::fake('private');
        $room = HotelRoom::factory()->create(['status' => 'available']);
        $this->withHeaders($this->authHeaders($user))
            ->post('/api/customer/boardings', [
                'pet_id' => $pet->id,
                'hotel_room_id' => $room->id,
                'check_in_date' => Carbon::today()->toDateString(),
                'number_of_days' => 1,
                'vaccination_card' => UploadedFile::fake()->create('milo-card.png', 100, 'image/png'),
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

    public function test_same_day_availability_omits_elapsed_times_and_server_rejects_them(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 14:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $pet = $this->petFor($user);
        $date = Carbon::now('Asia/Manila')->toDateString();
        $headers = $this->authHeaders($user);

        $slots = $this->withHeaders($headers)
            ->getJson('/api/customer/availability/veterinary?date=' . $date . '&service_name=General%20Consultation')
            ->assertOk()
            ->json('slots');

        $times = array_column($slots, 'time');
        $this->assertNotContains('10:00', $times);
        $this->assertNotContains('14:00', $times);
        $this->assertContains('14:30', $times);

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'pet_id' => $pet->id,
                'request_type' => 'vet',
                'service_name' => 'General Consultation',
                'requested_date' => $date,
                'requested_time' => '10:00',
            ])
            ->assertUnprocessable();
    }

    public function test_legacy_customer_appointment_route_checks_availability_and_uses_manila_time(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $user->forceFill(['email_verified_at' => now()])->save();
        $pet = $this->petFor($user);
        $service = Service::factory()->create([
            'name' => 'General Consultation',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $date = Carbon::tomorrow('Asia/Manila')->toDateString();
        ServiceRequest::create([
            'customer_id' => $user->id,
            'pet_id' => $pet->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_name' => $pet->name,
            'request_type' => 'vet',
            'service_name' => $service->name,
            'request_date' => $date,
            'request_time' => '10:00',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);

        $headers = $this->authHeaders($user);
        $overlap = Carbon::parse($date . ' 10:00', 'Asia/Manila')->toISOString();
        $this->withHeaders($headers)
            ->postJson('/api/customer/appointments', [
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $overlap,
            ])
            ->assertUnprocessable();

        $localSlot = Carbon::parse($date . ' 11:00', 'Asia/Manila');
        $this->withHeaders($headers)
            ->postJson('/api/customer/appointments', [
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $localSlot->toISOString(),
            ])
            ->assertCreated();

        $appointment = Appointment::latest('id')->firstOrFail();
        $this->assertSame('03:00', $appointment->scheduled_at->copy()->setTimezone('UTC')->format('H:i'));
        $this->assertSame('11:00', $appointment->scheduled_at->copy()->setTimezone('Asia/Manila')->format('H:i'));
    }
}
