<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\BoardingRoomReservation;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BoardingRoomLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('boarding-room-lifecycle')->plainTextToken];
    }

    private function customerPet(): array
    {
        $user = $this->user('customer');
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog']);

        return [$user, $customer, $pet];
    }

    private function room(array $overrides = []): BoardingRoom
    {
        return BoardingRoom::create(array_merge([
            'room_code' => 'LIFE-' . uniqid(),
            'room_name' => 'Lifecycle Dog Room',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'max_capacity' => 1,
            'total_rooms' => 1,
            'daily_rate' => 800,
            'is_active' => true,
            'customer_selectable' => true,
        ], $overrides));
    }

    private function boarding(Customer $customer, Pet $pet, array $overrides = []): Boarding
    {
        return Boarding::create(array_merge([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'pet_type' => $pet->species,
            'status' => 'pending',
            'payment_status' => 'paid',
            'check_in' => Carbon::tomorrow()->toDateString(),
            'check_out' => Carbon::tomorrow()->toDateString(),
            'total_amount' => 800,
        ], $overrides));
    }

    public function test_receptionist_schedule_persists_a_boarding_room_id_and_reservation(): void
    {
        $receptionist = $this->user('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $room = $this->room();
        $boarding = $this->boarding($customer, $pet);
        $date = Carbon::tomorrow()->toDateString();

        HotelRoom::forceCreate([
            'id' => $room->id,
            'room_number' => 'LEGACY-' . $room->id,
            'name' => 'Unrelated Legacy Room',
            'type' => 'standard',
            'size' => 'medium',
            'capacity' => 1,
            'daily_rate' => 100,
            'status' => 'maintenance',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
                'room_id' => $room->id,
                'check_in' => $date,
                'check_out' => $date,
                'total_amount' => 800,
            ])
            ->assertOk()
            ->assertJsonPath('boarding.room_reservation.room.room_name', $room->room_name);

        $this->assertDatabaseHas('boardings', [
            'id' => $boarding->id,
            'hotel_room_id' => null,
            'status' => 'scheduled',
        ]);
        $this->assertDatabaseHas('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'room_id' => $room->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_legacy_hotel_room_schedule_still_uses_the_hotel_room_id_contract(): void
    {
        $receptionist = $this->user('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $room = HotelRoom::factory()->create(['daily_rate' => 800, 'status' => 'available']);
        $boarding = $this->boarding($customer, $pet);
        $date = Carbon::tomorrow()->toDateString();

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
                'hotel_room_id' => $room->id,
                'check_in' => $date,
                'check_out' => $date,
                'total_amount' => 800,
            ])
            ->assertOk()
            ->assertJsonPath('boarding.hotel_room.id', $room->id);

        $this->assertDatabaseHas('boardings', [
            'id' => $boarding->id,
            'hotel_room_id' => $room->id,
            'status' => 'scheduled',
        ]);
        $this->assertDatabaseHas('hotel_rooms', ['id' => $room->id, 'status' => 'reserved']);
    }

    public function test_boarding_list_includes_the_reservation_for_its_service_request(): void
    {
        $receptionist = $this->user('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $room = $this->room();
        $date = Carbon::tomorrow()->toDateString();
        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => $date,
            'request_time' => '10:00',
            'check_out_date' => $date,
            'boarding_room_id' => $room->id,
            'room_name' => $room->room_name,
            'room_type' => $room->room_type,
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);
        $boarding = $this->boarding($customer, $pet, [
            'service_request_id' => $serviceRequest->id,
            'status' => 'approved',
            'check_in' => $date,
            'check_out' => $date,
        ]);
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'service_request',
            'source_id' => $serviceRequest->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => $date,
            'check_out_date' => $date,
            'status' => 'pending',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->getJson('/api/receptionist/boarding-requests')
            ->assertOk()
            ->assertJsonPath('data.0.id', $boarding->id)
            ->assertJsonPath('data.0.service_request.room_reservation.room.room_name', $room->room_name);
    }

    public function test_veterinary_current_boarders_response_includes_service_request_room(): void
    {
        $veterinary = $this->user('veterinary');
        [, $customer, $pet] = $this->customerPet();
        $room = $this->room();
        $date = Carbon::tomorrow()->toDateString();
        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => Carbon::today()->toDateString(),
            'request_time' => '10:00',
            'check_out_date' => $date,
            'boarding_room_id' => $room->id,
            'room_name' => $room->room_name,
            'room_type' => $room->room_type,
            'status' => 'checked_in',
            'payment_status' => 'paid',
        ]);
        $boarding = $this->boarding($customer, $pet, [
            'service_request_id' => $serviceRequest->id,
            'status' => 'in_care',
            'check_out' => $date,
        ]);
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'service_request',
            'source_id' => $serviceRequest->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => Carbon::today()->toDateString(),
            'check_out_date' => $date,
            'status' => 'checked_in',
        ]);

        $this->withHeaders($this->headers($veterinary))
            ->getJson('/api/veterinary/boardings/current-boarders')
            ->assertOk()
            ->assertJsonPath('boarders.0.id', $boarding->id)
            ->assertJsonPath('boarders.0.service_request.room_reservation.room.room_name', $room->room_name);
    }

    public function test_customer_cancellation_releases_a_modern_boarding_room_reservation(): void
    {
        [$customerUser, $customer, $pet] = $this->customerPet();
        $room = $this->room();
        $date = Carbon::tomorrow()->toDateString();
        $boarding = $this->boarding($customer, $pet);
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => $date,
            'check_out_date' => $date,
            'status' => 'pending',
        ]);

        $this->withHeaders($this->headers($customerUser))
            ->postJson("/api/customer/boarding-requests/{$boarding->id}/cancel", [
                'reason' => 'Change of plans',
            ])
            ->assertOk();

        $this->assertDatabaseHas('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_schedule_rejects_a_conflicting_selected_room_without_substitution(): void
    {
        $receptionist = $this->user('receptionist');
        [, $firstCustomer, $firstPet] = $this->customerPet();
        [, $secondCustomer, $secondPet] = $this->customerPet();
        $room = $this->room();
        $date = Carbon::tomorrow()->toDateString();
        $existing = $this->boarding($firstCustomer, $firstPet, ['status' => 'scheduled']);
        $requested = $this->boarding($secondCustomer, $secondPet);
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => $existing->id,
            'pet_id' => $firstPet->id,
            'customer_id' => $firstCustomer->id,
            'check_in_date' => $date,
            'check_out_date' => $date,
            'status' => 'scheduled',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$requested->id}/schedule", [
                'room_id' => $room->id,
                'check_in' => $date,
                'check_out' => $date,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'Selected boarding room is no longer available for the selected dates.');

        $this->assertDatabaseHas('boardings', ['id' => $requested->id, 'status' => 'pending']);
        $this->assertDatabaseMissing('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $requested->id,
        ]);
    }

    public function test_schedule_rejects_inactive_or_species_incompatible_rooms(): void
    {
        $receptionist = $this->user('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $inactiveRoom = $this->room(['is_active' => false]);
        $boarding = $this->boarding($customer, $pet);
        $date = Carbon::tomorrow()->toDateString();

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
                'room_id' => $inactiveRoom->id,
                'check_in' => $date,
                'check_out' => $date,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'Selected boarding room is not active.');

        $incompatibleRoom = $this->room(['allowed_species' => ['cat']]);
        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
                'room_id' => $incompatibleRoom->id,
                'check_in' => $date,
                'check_out' => $date,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'Pet species is not compatible with this room');

        $this->assertDatabaseMissing('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
        ]);
    }

    public function test_check_in_updates_the_modern_room_reservation_state(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-13 11:00:00'));
        $receptionist = $this->user('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $room = $this->room();
        $boarding = $this->boarding($customer, $pet, [
            'status' => 'scheduled',
            'check_in' => Carbon::today()->toDateString(),
            'check_out' => Carbon::today()->toDateString(),
        ]);
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => Carbon::today()->toDateString(),
            'check_out_date' => Carbon::today()->toDateString(),
            'status' => 'scheduled',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertOk();

        $this->assertDatabaseHas('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'status' => 'checked_in',
        ]);
    }

    public function test_check_out_releases_a_modern_boarding_room_reservation(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-13 11:00:00'));
        $receptionist = $this->user('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $room = $this->room();
        $boarding = $this->boarding($customer, $pet, [
            'status' => 'ready_for_pickup',
            'check_in' => Carbon::today()->toDateString(),
            'check_out' => Carbon::today()->toDateString(),
        ]);
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => Carbon::today()->toDateString(),
            'check_out_date' => Carbon::today()->toDateString(),
            'status' => 'checked_in',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-out")
            ->assertOk();

        $this->assertDatabaseHas('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'status' => 'checked_out',
        ]);
    }
}
