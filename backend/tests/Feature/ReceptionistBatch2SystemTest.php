<?php

namespace Tests\Feature;

use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceptionistBatch2SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch2-test')->plainTextToken];
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function pendingGroomingRequest(): ServiceRequest
    {
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true, 'email_verified_at' => now()]);
        $customer = \App\Models\Customer::factory()->create(['user_id' => $customerUser->id, 'email' => $customerUser->email]);
        $pet = \App\Models\Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);

        return ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'customer_name' => $customer->name,
            'customer_email' => $customerUser->email,
            'request_type' => 'grooming',
            'service_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => now()->addDays(20)->toDateString(),
            'request_time' => '10:00',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);
    }

    public function test_receptionist_pending_queue_requires_the_receptionist_role(): void
    {
        $this->getJson('/api/receptionist/requests/pending')->assertStatus(401);

        $customer = $this->staff('customer');
        $this->withHeaders($this->headers($customer))->getJson('/api/receptionist/requests/pending')->assertForbidden();

        $receptionist = $this->staff('receptionist');
        $this->withHeaders($this->headers($receptionist))->getJson('/api/receptionist/requests/pending')->assertOk();
    }

    public function test_receptionist_sees_a_pending_request_in_the_queue(): void
    {
        $request = $this->pendingGroomingRequest();

        $response = $this->withHeaders($this->headers($this->staff('receptionist')))
            ->getJson('/api/receptionist/requests/pending');

        $response->assertOk();
        $this->assertStringContainsString((string) $request->id, $response->getContent());
    }

    public function test_receptionist_approval_is_idempotent_and_creates_one_grooming_record(): void
    {
        $request = $this->pendingGroomingRequest();
        $headers = $this->headers($this->staff('receptionist'));

        $this->withHeaders($headers)->postJson("/api/receptionist/requests/{$request->id}/approve", [])
            ->assertOk();
        $this->assertSame('approved', $request->fresh()->status);

        $this->withHeaders($headers)->postJson("/api/receptionist/requests/{$request->id}/approve", [])
            ->assertOk()
            ->assertJsonPath('message', 'Request is already approved.');
        $this->assertSame(1, \App\Models\Grooming::where('service_request_id', $request->id)->count());
    }

    public function test_walk_in_list_is_staff_only_and_store_validates_input(): void
    {
        $customer = $this->staff('customer');
        $this->withHeaders($this->headers($customer))->getJson('/api/receptionist/walk-ins')->assertForbidden();

        $receptionist = $this->headers($this->staff('receptionist'));
        $this->withHeaders($receptionist)->getJson('/api/receptionist/walk-ins')->assertOk();
        $this->withHeaders($receptionist)->postJson('/api/receptionist/walk-ins', [])->assertStatus(422);
    }

    public function test_super_receptionist_can_open_the_receptionist_queue(): void
    {
        $this->withHeaders($this->headers($this->staff('super_receptionist')))
            ->getJson('/api/receptionist/requests/pending')
            ->assertOk();
    }
}
