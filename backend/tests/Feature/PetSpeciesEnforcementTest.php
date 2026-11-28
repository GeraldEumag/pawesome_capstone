<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * CAP-B SYS-01: animal-type (species) compatibility must be enforced by the
 * backend on every booking channel — frontend filtering is not enforcement.
 */
class PetSpeciesEnforcementTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function customerUser(): User
    {
        return User::factory()->customer()->create(['email_verified_at' => now()]);
    }

    private function petFor(User $user, string $species): Pet
    {
        $customer = $this->customerRecord($user);

        return Pet::factory()->create(['customer_id' => $customer->id, 'species' => $species]);
    }

    private function customerRecord(User $user): Customer
    {
        return Customer::where('user_id', $user->id)->first()
            ?? Customer::create(['user_id' => $user->id, 'name' => $user->name, 'email' => $user->email]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('species-test')->plainTextToken];
    }

    private function groomingService(): Service
    {
        return Service::factory()->create([
            'name' => 'Full Groom',
            'category' => 'Grooming',
            'price' => 800,
            'is_active' => true,
        ]);
    }

    public function test_customer_legacy_grooming_rejects_incompatible_species(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $user = $this->customerUser();
        $pet = $this->petFor($user, 'Fish');
        $date = $this->nextBookableDate(1)->toDateString();

        $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/grooming', [
                'petId' => $pet->id,
                'petName' => $pet->name,
                'service' => 'bath',
                'date' => $date,
                'time' => '10:00',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'service_not_allowed');

        $this->assertDatabaseMissing('grooming_appointments', ['pet_id' => $pet->id]);
    }

    public function test_customer_legacy_grooming_accepts_dog(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $user = $this->customerUser();
        $pet = $this->petFor($user, 'Dog');
        $date = $this->nextBookableDate(1)->toDateString();

        $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/grooming', [
                'petId' => $pet->id,
                'petName' => $pet->name,
                'service' => 'bath',
                'date' => $date,
                'time' => '10:00',
            ])
            ->assertCreated();
    }

    public function test_customer_legacy_grooming_requires_pet_id(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $user = $this->customerUser();
        $date = $this->nextBookableDate(1)->toDateString();

        $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/grooming', [
                'petName' => 'Nameless',
                'service' => 'bath',
                'date' => $date,
                'time' => '10:00',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('petId');
    }

    public function test_receptionist_grooming_rejects_incompatible_species(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $receptionist = User::factory()->receptionist()->create();
        $customerUser = $this->customerUser();
        $customer = $this->customerRecord($customerUser);
        $pet = $this->petFor($customerUser, 'Reptile');

        $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/grooming', [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service' => 'Full Groom',
                'appointment_date' => $this->nextBookableDate(1)->toDateString(),
                'appointment_time' => '10:00',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'service_not_allowed');
    }

    public function test_customer_appointment_with_grooming_service_rejects_fish(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $user = $this->customerUser();
        $pet = $this->petFor($user, 'Fish');
        $service = $this->groomingService();

        $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/appointments', [
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $this->nextBookableDate(1)->setTime(10, 0)->utc()->toISOString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'service_not_allowed');
    }

    public function test_receptionist_appointment_with_grooming_service_rejects_bird(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $receptionist = User::factory()->receptionist()->create();
        $customerUser = $this->customerUser();
        $customer = $this->customerRecord($customerUser);
        $pet = $this->petFor($customerUser, 'Bird');
        $service = $this->groomingService();

        $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/receptionist/appointments', [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $this->nextBookableDate(1)->setTime(10, 0)->utc()->toISOString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'service_not_allowed');
    }

    public function test_chatbot_booking_with_grooming_service_rejects_hamster(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $user = $this->customerUser();
        $pet = $this->petFor($user, 'Hamster');
        $service = $this->groomingService();

        $this->withHeaders($this->headers($user))
            ->postJson('/api/chatbot/workflow/bookings', [
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $this->nextBookableDate(1)->setTime(10, 0)->toDateTimeString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'service_not_allowed');
    }

    public function test_walk_in_grooming_rejects_incompatible_species(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $receptionist = User::factory()->receptionist()->create();
        $customerUser = $this->customerUser();
        $customer = $this->customerRecord($customerUser);
        $pet = $this->petFor($customerUser, 'Fish');

        $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'existing',
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'booking' => [
                    'service_type' => 'grooming',
                    'service_name' => 'Full Groom',
                    'request_date' => $this->nextBookableDate(1)->toDateString(),
                    'request_time' => '10:00',
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'service_not_allowed');
    }

    public function test_boarding_legacy_kennel_room_rejects_cat(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $receptionist = User::factory()->receptionist()->create();
        $customerUser = $this->customerUser();
        $customer = $this->customerRecord($customerUser);
        $pet = $this->petFor($customerUser, 'Cat');
        $kennel = HotelRoom::factory()->create([
            'type' => 'kennel',
            'status' => 'available',
            'capacity' => 1,
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/boardings', [
                'pet_id' => $pet->id,
                'customer_id' => $customer->id,
                'hotel_room_id' => $kennel->id,
                'check_in_date' => $this->nextBookableDate(1)->toDateString(),
                'number_of_days' => 1,
            ])
            ->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['hotel_room_id']]);
    }

    public function test_boarding_legacy_kennel_room_accepts_dog(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $receptionist = User::factory()->receptionist()->create();
        $customerUser = $this->customerUser();
        $customer = $this->customerRecord($customerUser);
        $pet = $this->petFor($customerUser, 'Dog');
        $kennel = HotelRoom::factory()->create([
            'type' => 'kennel',
            'status' => 'available',
            'capacity' => 1,
        ]);

        $response = $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/boardings', [
                'pet_id' => $pet->id,
                'customer_id' => $customer->id,
                'hotel_room_id' => $kennel->id,
                'check_in_date' => $this->nextBookableDate(1)->toDateString(),
                'number_of_days' => 1,
            ]);

        // Must not fail on species grounds — any later business rejection is fine.
        $this->assertNotSame(
            'Selected room does not accept this pet species.',
            $response->json('errors.hotel_room_id.0') ?? $response->json('message')
        );
    }

    public function test_boarding_modern_room_still_enforces_allowed_species(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-28 12:00:00', 'Asia/Manila'));
        $receptionist = User::factory()->receptionist()->create();
        $customerUser = $this->customerUser();
        $customer = $this->customerRecord($customerUser);
        $pet = $this->petFor($customerUser, 'Cat');
        $room = \App\Models\BoardingRoom::forceCreate([
            'room_code' => 'TEST-DOG-1',
            'room_name' => 'Dog Only Room',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'daily_rate' => 1000,
            'is_active' => true,
            'customer_selectable' => true,
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/boardings', [
                'pet_id' => $pet->id,
                'customer_id' => $customer->id,
                'room_id' => $room->id,
                'check_in_date' => $this->nextBookableDate(1)->toDateString(),
                'number_of_days' => 1,
            ])
            ->assertUnprocessable();
    }
}
