<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CashierQueueDedupeTest extends TestCase
{
    use RefreshDatabase;

    private function cashier(): User
    {
        return User::factory()->create(['role' => 'cashier', 'is_active' => true]);
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('cashier-queue-test')->plainTextToken];
    }

    public function test_linked_grooming_is_not_listed_twice_with_its_service_request(): void
    {
        $cashier = $this->cashier();
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        // Approved grooming request awaiting cashier verification
        $serviceRequest = ServiceRequest::create([
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::today()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_proof' => 'payment-proofs/test.jpg',
            'payment_reference' => 'GCASH-123',
        ]);

        // The linked grooming record created on approval shares the payment
        Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Bath and Brush',
            'appointment_date' => Carbon::today()->toDateString(),
            'appointment_time' => '10:00',
            'amount' => 500,
            'status' => 'approved',
            'payment_status' => 'pending',
            'service_request_id' => $serviceRequest->id,
        ]);

        $payments = collect(
            $this->withHeaders($this->authHeaders($cashier))
                ->getJson('/api/cashier/payment-requests')
                ->assertOk()
                ->json('payments')
        );

        // The booking must appear exactly once — as the service_request leg
        $matches = $payments->filter(fn ($p) =>
            ($p['pet_name'] ?? null) === $pet->name
            && ($p['customer_email'] ?? null) === $customer->email
        );

        $this->assertCount(1, $matches);
        $this->assertSame('service_request', $matches->first()['type']);
    }

    public function test_walk_in_grooming_without_service_request_stays_in_queue(): void
    {
        $cashier = $this->cashier();
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $grooming = Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Full Groom',
            'appointment_date' => Carbon::today()->toDateString(),
            'appointment_time' => '14:00',
            'amount' => 800,
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'cash',
        ]);

        $this->withHeaders($this->authHeaders($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $grooming->id,
                'type' => 'grooming',
            ]);
    }
}
