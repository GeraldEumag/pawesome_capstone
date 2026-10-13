<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class BookingSchedulingIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        Event::forget('eloquent.creating: ' . Grooming::class);
        parent::tearDown();
    }

    private function userWithToken(string $role): User
    {
        $user = User::factory()->create([
            'role' => $role,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $user->plain_text_token = $user->createToken('booking-integrity')->plainTextToken;

        return $user;
    }

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->plain_text_token];
    }

    private function customerAndPet(): array
    {
        $user = $this->userWithToken('customer');
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);

        return [$user, $customer, $pet];
    }

    public function test_assigned_veterinarian_availability_is_scoped_to_that_vet(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00:00', 'Asia/Manila'));
        $firstVet = $this->userWithToken('veterinary');
        $secondVet = $this->userWithToken('veterinary');
        [, $customer, $pet] = $this->customerAndPet();
        $service = Service::factory()->create([
            'name' => 'General Consultation',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $date = Carbon::tomorrow('Asia/Manila')->toDateString();
        Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $firstVet->id,
            'status' => 'approved',
            'scheduled_at' => Carbon::parse($date . ' 10:00', 'Asia/Manila')->utc(),
        ]);

        $otherVetSlots = $this->getJson('/api/availability/veterinary?date=' . $date . '&service_name=General%20Consultation&veterinarian_id=' . $secondVet->id)
            ->assertOk()
            ->json('slots');
        $this->assertTrue(collect($otherVetSlots)->firstWhere('time', '10:00')['available']);

        $unassignedSlots = $this->getJson('/api/availability/veterinary?date=' . $date . '&service_name=General%20Consultation')
            ->assertOk()
            ->json('slots');
        $this->assertFalse(collect($unassignedSlots)->firstWhere('time', '10:00')['available']);
    }

    public function test_walk_in_requires_a_time_and_checks_capacity_within_store_hours(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 15:00:00', 'Asia/Manila'));
        $receptionist = $this->userWithToken('receptionist');
        [, $customer, $pet] = $this->customerAndPet();
        $service = Service::factory()->create([
            'name' => 'General Consultation',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $date = Carbon::today('Asia/Manila')->toDateString();
        ServiceRequest::create([
            'customer_id' => $customer->user_id,
            'pet_id' => $pet->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_name' => $pet->name,
            'request_type' => 'veterinary',
            'service_name' => $service->name,
            'request_date' => $date,
            'request_time' => '16:00',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);
        $headers = $this->authHeader($receptionist);
        $payload = [
            'customer_mode' => 'existing',
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'booking' => [
                'service_type' => 'veterinary',
                'service_name' => $service->name,
                'request_date' => $date,
                'request_time' => '16:00',
            ],
        ];

        $this->withHeaders($headers)
            ->postJson('/api/receptionist/walk-ins', [
                ...$payload,
                'booking' => [...$payload['booking'], 'request_time' => null],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['booking.request_time']);

        $this->withHeaders($headers)
            ->postJson('/api/receptionist/walk-ins', $payload)
            ->assertUnprocessable();

        $payload['booking']['request_time'] = '18:00';
        $this->withHeaders($headers)
            ->postJson('/api/receptionist/walk-ins', $payload)
            ->assertUnprocessable();

        $payload['booking']['request_time'] = '17:00';
        ServiceRequest::where('request_date', $date)->delete();
        $response = $this->withHeaders($headers)
            ->postJson('/api/receptionist/walk-ins', $payload)
            ->assertCreated();

        $appointment = Appointment::findOrFail($response->json('data.booking_id'));
        $this->assertSame('17:00', $appointment->scheduled_at->setTimezone('Asia/Manila')->format('H:i'));
        $this->assertDatabaseHas('service_requests', [
            'id' => $response->json('data.service_request_id'),
            'request_time' => '17:00',
        ]);
    }

    public function test_receptionist_grooming_creation_persists_time_after_availability_check(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00:00', 'Asia/Manila'));
        $receptionist = $this->userWithToken('receptionist');
        [, $customer, $pet] = $this->customerAndPet();
        $service = Service::factory()->create([
            'name' => 'Bath and Brush',
            'category' => 'Grooming',
            'duration_minutes' => 60,
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson('/api/grooming', [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service' => $service->name,
                'appointment_date' => Carbon::tomorrow('Asia/Manila')->toDateString(),
                'appointment_time' => '10:00',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('groomings', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'appointment_time' => '10:00',
        ]);
    }

    public function test_grooming_row_failure_rolls_back_the_customer_request(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00:00', 'Asia/Manila'));
        [$user, , $pet] = $this->customerAndPet();
        $eventName = 'eloquent.creating: ' . Grooming::class;
        Event::listen($eventName, static function (): void {
            throw new \RuntimeException('forced grooming insert failure');
        });

        $this->withHeaders($this->authHeader($user))
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'pet_id' => $pet->id,
                'request_type' => 'grooming',
                'service_name' => 'Bath and Brush',
                'requested_date' => Carbon::tomorrow('Asia/Manila')->toDateString(),
                'requested_time' => '10:00',
            ])
            ->assertServerError();

        $this->assertDatabaseMissing('service_requests', [
            'pet_id' => $pet->id,
            'request_type' => 'grooming',
        ]);
        $this->assertDatabaseMissing('groomings', ['pet_id' => $pet->id]);
    }

    public function test_legacy_customer_grooming_route_persists_time_and_checks_availability(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00:00', 'Asia/Manila'));
        [$user, , $pet] = $this->customerAndPet();
        $date = Carbon::tomorrow('Asia/Manila')->toDateString();

        $this->withHeaders($this->authHeader($user))
            ->postJson('/api/customer/grooming', [
                'petId' => $pet->id,
                'petName' => $pet->name,
                'service' => 'bath',
                'date' => $date,
                'time' => '10:00',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('grooming_appointments', [
            'pet_id' => $pet->id,
            'appointment_date' => $date,
            'appointment_time' => '10:00',
        ]);
    }
}
