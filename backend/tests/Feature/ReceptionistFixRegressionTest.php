<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Targeted regression tests for REC-02 and REC-03 fixes.
 *
 * REC-01 and REC-04 are covered by existing PaymentBookingChannelTest which passes.
 *
 * REC-02: Store must reject direct approval status
 * REC-03: Walk-in defaults to unpaid, online to pending
 */
class ReceptionistFixRegressionTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('recep-fix-regression')->plainTextToken];
    }

    public function test_rec02_store_rejects_direct_approval(): void
    {
        $user = $this->user('receptionist');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        // Try to create approved request directly
        $response = $this->postJson('/api/receptionist/requests', [
            'pet_id' => $pet->id,
            'service_name' => 'Grooming',
            'request_type' => 'grooming',
            'status' => 'approved',
        ], $headers);

        $response->assertStatus(422);
        $this->assertStringContainsString('Direct approval via store is not allowed', $response->json('message'));

        // Verify no approved SR was created
        $this->assertDatabaseMissing('service_requests', [
            'service_name' => 'Grooming',
            'status' => 'approved',
        ]);
    }

    public function test_rec03_walk_in_defaults_to_unpaid(): void
    {
        $user = $this->user('receptionist');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        $this->postJson('/api/receptionist/requests', [
            'pet_id' => $pet->id,
            'service_name' => 'Grooming',
            'request_type' => 'grooming',
        ], $headers)->assertStatus(201);

        $this->assertDatabaseHas('service_requests', [
            'service_name' => 'Grooming',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);
    }

    public function test_rec02_status_variants_rejected(): void
    {
        $user = $this->user('receptionist');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        // Try various capitalization/whitespace variants
        foreach (['approved', 'APPROVED', 'Approved', ' approved '] as $status) {
            $response = $this->postJson('/api/receptionist/requests', [
                'pet_id' => $pet->id,
                'service_name' => 'Grooming',
                'request_type' => 'grooming',
                'status' => $status,
            ], $headers);

            $response->assertStatus(422);
        }
    }

    public function test_rec02_legitimate_pending_status_accepted(): void
    {
        $user = $this->user('receptionist');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        // Legitimate pending status should work
        $response = $this->postJson('/api/receptionist/requests', [
            'pet_id' => $pet->id,
            'service_name' => 'Grooming',
            'request_type' => 'grooming',
            'status' => 'pending',
        ], $headers);

        $response->assertStatus(201);
        $this->assertDatabaseHas('service_requests', [
            'service_name' => 'Grooming',
            'status' => 'pending',
        ]);
    }
}
