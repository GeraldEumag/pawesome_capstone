<?php

namespace Tests\Feature;

use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The grooming board PATCHes a service request to `ready_for_pickup`, but the
 * service_requests.status enum never listed that value — on MySQL 8 strict
 * mode the UPDATE failed with "Data truncated" and surfaced as a 500 on the
 * deployed site (non-strict MariaDB silently stored ''). The migration
 * 2026_11_18_000001 adds the missing enum value.
 */
class ServiceRequestReadyForPickupTest extends TestCase
{
    use RefreshDatabase;

    private function receptionist(): User
    {
        return User::factory()->receptionist()->create();
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('ready-pickup-test')->plainTextToken];
    }

    private function groomingRequest(array $overrides = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'customer_name'   => 'TEST CUSTOMER',
            'customer_email'  => 'customer@example.com',
            'pet_name'        => 'Buddy',
            'pet_type'        => 'Dog',
            'request_type'    => 'grooming',
            'service_name'    => 'Full Grooming',
            'price'           => 800,
            'request_date'    => now()->toDateString(),
            'request_time'    => '10:00',
            'status'          => 'in_progress',
            'payment_status'  => 'paid',
        ], $overrides));
    }

    public function test_grooming_request_can_be_marked_ready_for_pickup(): void
    {
        $receptionist = $this->receptionist();
        $serviceRequest = $this->groomingRequest();

        $this->withHeaders($this->authHeaders($receptionist))
            ->patchJson("/api/receptionist/requests/{$serviceRequest->id}/status", [
                'status' => 'ready_for_pickup',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $serviceRequest->refresh();
        $this->assertSame('ready_for_pickup', $serviceRequest->status);
        $this->assertNotNull($serviceRequest->ready_for_pickup_at);
    }

    public function test_ready_for_pickup_status_round_trips_through_the_enum(): void
    {
        // Direct model write — proves the enum accepts the value end to end,
        // not just through the controller path.
        $serviceRequest = $this->groomingRequest(['status' => 'ready_for_pickup']);

        $this->assertSame('ready_for_pickup', $serviceRequest->fresh()->status);
    }
}
