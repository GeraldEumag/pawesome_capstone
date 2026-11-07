<?php

namespace Tests\Feature;

use App\Models\BoardingRoom;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BoardingRoomAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_soft_deleted_room_is_not_offered_to_customers(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_active' => true, 'email_verified_at' => now()]);
        $headers = ['Authorization' => 'Bearer ' . $customer->createToken('room-test')->plainTextToken];
        $pet = Pet::factory()->create(['customer_id' => \App\Models\Customer::factory()->create(['user_id' => $customer->id, 'email' => $customer->email])->id, 'species' => 'Dog']);

        $active = BoardingRoom::factory()->create(['room_code' => 'DOG-ACTIVE', 'room_type' => 'dog_standard', 'daily_rate' => 500, 'customer_selectable' => true, 'is_active' => true]);
        $deleted = BoardingRoom::factory()->create(['room_code' => 'DOG-DELETED', 'room_type' => 'dog_standard', 'daily_rate' => 400, 'customer_selectable' => true, 'is_active' => true]);
        $deleted->delete();

        $date = now()->addDays(5)->toDateString();
        $response = $this->withHeaders($headers)->getJson('/api/boarding/rooms/available?' . http_build_query([
            'pet_id' => $pet->id,
            'check_in_date' => $date,
            'check_out_date' => $date,
        ]));

        $response->assertOk();
        $ids = collect($response->json('rooms'))->pluck('id')->all();
        $this->assertContains($active->id, $ids);
        $this->assertNotContains($deleted->id, $ids);
    }
}
