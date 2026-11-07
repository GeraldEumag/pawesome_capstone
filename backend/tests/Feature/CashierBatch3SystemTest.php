<?php

namespace Tests\Feature;

use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class CashierBatch3SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch3-test')->plainTextToken];
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    /**
     * An approved grooming request owned by a verified customer, ready for a
     * payment proof to be attached and verified by the cashier.
     *
     * @return array{0: ServiceRequest, 1: User}
     */
    private function approvedRequest(): array
    {
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true, 'email_verified_at' => now()]);
        $customer = \App\Models\Customer::factory()->create(['user_id' => $customerUser->id, 'email' => $customerUser->email]);
        $pet = \App\Models\Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'Dog']);

        $request = ServiceRequest::create([
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
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);

        return [$request, $customerUser];
    }

    public function test_cashier_dashboard_requires_the_cashier_role(): void
    {
        $this->getJson('/api/cashier/dashboard')->assertStatus(401);

        $customer = $this->staff('customer');
        $this->withHeaders($this->headers($customer))->getJson('/api/cashier/dashboard')->assertForbidden();

        $receptionist = $this->staff('receptionist');
        $this->withHeaders($this->headers($receptionist))->getJson('/api/cashier/dashboard')->assertForbidden();

        $cashier = $this->staff('cashier');
        $this->withHeaders($this->headers($cashier))->getJson('/api/cashier/dashboard')->assertOk();
    }

    public function test_cashier_payment_queue_and_reports_respond(): void
    {
        $cashier = $this->staff('cashier');
        $headers = $this->headers($cashier);

        $this->withHeaders($headers)->getJson('/api/cashier/payment-requests')->assertOk();
        $this->withHeaders($headers)->getJson('/api/cashier/transactions')->assertOk();
        $this->withHeaders($headers)->getJson('/api/cashier/history')->assertOk();
        $this->withHeaders($headers)->getJson('/api/cashier/reports/live')->assertOk();
    }

    public function test_cashier_can_verify_an_uploaded_payment_proof(): void
    {
        [$request, $customerUser] = $this->approvedRequest();
        $cashier = $this->staff('cashier');

        $proof = $this->withHeaders($this->headers($customerUser))
            ->post("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'BATCH3-VERIFY-001',
                'payment_proof' => UploadedFile::fake()->createWithContent('proof.png', str_repeat('a', 128)),
            ]);
        $proof->assertOk();

        $cashierHeaders = $this->headers($cashier);
        $queue = $this->withHeaders($cashierHeaders)->getJson('/api/cashier/payment-requests')->assertOk()->json();
        $items = $queue['payments'] ?? $queue['data'] ?? $queue;
        $found = collect(is_array($items) ? $items : [])->contains(
            fn ($item) => (int) ($item['id'] ?? 0) === $request->id
        );
        $this->assertTrue($found, 'cashier payment queue must list the uploaded proof');

        $verify = $this->withHeaders($cashierHeaders)->postJson("/api/cashier/payment-requests/{$request->id}/verify", [
            'type' => 'service_request',
            'reference_number' => 'BATCH3-VERIFY-001',
            'cashier_remarks' => 'batch3 verify',
        ]);
        $verify->assertOk();

        $request->refresh();
        $this->assertSame('paid', $request->payment_status);
    }

    public function test_cashier_reject_requires_a_reason(): void
    {
        [$request, $customerUser] = $this->approvedRequest();
        $cashier = $this->staff('cashier');

        $this->withHeaders($this->headers($customerUser))
            ->post("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'BATCH3-REJECT-001',
                'payment_proof' => UploadedFile::fake()->createWithContent('proof.png', str_repeat('a', 128)),
            ])->assertOk();

        $cashierHeaders = $this->headers($cashier);
        $withoutReason = $this->withHeaders($cashierHeaders)->postJson("/api/cashier/payment-requests/{$request->id}/reject", [
            'type' => 'service_request',
        ]);
        $withoutReason->assertStatus(422);

        $withReason = $this->withHeaders($cashierHeaders)->postJson("/api/cashier/payment-requests/{$request->id}/reject", [
            'type' => 'service_request',
            'rejection_reason' => 'Unreadable proof',
        ]);
        $withReason->assertOk();

        $request->refresh();
        $this->assertSame('rejected', $request->payment_status);
    }

    public function test_super_receptionist_can_read_the_cashier_queue(): void
    {
        $super = $this->staff('super_receptionist');
        $this->withHeaders($this->headers($super))->getJson('/api/cashier/payment-requests')->assertOk();
    }
}
