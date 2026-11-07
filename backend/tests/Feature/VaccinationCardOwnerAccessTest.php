<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class VaccinationCardOwnerAccessTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private function actingWithToken(User $user): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken]);
    }

    private function ownedBoarding(): array
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        Storage::disk('private')->put('vaccination_cards/owner.png', base64_decode(self::PNG));
        $boarding = Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
            'status' => 'pending',
            'vaccination_card' => 'vaccination_cards/owner.png',
        ]);

        return [$user, $boarding];
    }

    public function test_owning_customer_can_view_their_vaccination_card(): void
    {
        [$owner, $boarding] = $this->ownedBoarding();

        $this->actingWithToken($owner)
            ->get("/api/files/vaccination-cards/{$boarding->id}/view")
            ->assertOk();
    }

    public function test_another_customer_cannot_view_the_vaccination_card(): void
    {
        [, $boarding] = $this->ownedBoarding();
        $other = User::factory()->create(['role' => 'customer']);
        Customer::factory()->create(['user_id' => $other->id]);

        $this->actingWithToken($other)
            ->get("/api/files/vaccination-cards/{$boarding->id}/view")
            ->assertForbidden();
    }
}
