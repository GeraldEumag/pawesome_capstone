<?php

namespace Tests\Feature;

use App\Models\CustomerOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerOrderWorkflowsDisabledTest extends TestCase
{
    use RefreshDatabase;

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('customer-order-disabled-test')->plainTextToken];
    }

    private function createOrder(User $customer, array $overrides = []): CustomerOrder
    {
        return CustomerOrder::create(array_merge([
            'customer_id' => $customer->id,
            'customer_email' => $customer->email,
            'customer_name' => $customer->name,
            'total_amount' => 250,
            'order_type' => 'Pick-up',
            'payment_method' => 'GCash',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ], $overrides));
    }

    public function test_customer_can_view_existing_orders_but_customer_order_writes_are_disabled(): void
    {
        $customer = User::factory()->customer()->create();
        $order = $this->createOrder($customer);
        $headers = $this->authHeaders($customer);

        $this->withHeaders($headers)
            ->getJson('/api/customer/store/orders')
            ->assertOk()
            ->assertJsonFragment(['id' => $order->id]);
        $this->withHeaders($headers)
            ->postJson('/api/customer/store/checkout', [])
            ->assertStatus(410);
        $this->withHeaders($headers)
            ->postJson("/api/customer/store/orders/{$order->id}/payment-proof", [])
            ->assertStatus(410);
        $this->withHeaders($headers)
            ->postJson("/api/customer/store/orders/{$order->id}/cancel", [])
            ->assertStatus(410);

        $this->assertDatabaseHas('customer_orders', [
            'id' => $order->id,
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);
    }

    public function test_receptionist_and_cashier_order_processing_is_disabled_without_changing_existing_orders(): void
    {
        $customer = User::factory()->customer()->create();
        $order = $this->createOrder($customer, [
            'status' => 'approved',
            'payment_status' => 'pending',
        ]);
        $receptionist = User::factory()->receptionist()->create();
        $cashier = User::factory()->cashier()->create();

        $this->withHeaders($this->authHeaders($receptionist))
            ->getJson('/api/receptionist/customer-orders/pending')
            ->assertStatus(410);
        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/customer-orders/{$order->id}/approve")
            ->assertStatus(410);
        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/customer-orders/{$order->id}/reject", ['rejection_reason' => 'Disabled'])
            ->assertStatus(410);
        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/customer-orders/{$order->id}/cancel", ['cancellation_reason' => 'Disabled'])
            ->assertStatus(410);

        $payments = $this->withHeaders($this->authHeaders($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');
        $this->assertFalse(collect($payments)->contains(fn ($payment) => ($payment['payable_type'] ?? null) === 'customer_order'));

        $this->withHeaders($this->authHeaders($cashier))
            ->postJson("/api/cashier/payment-requests/{$order->id}/verify", ['type' => 'customer_order'])
            ->assertStatus(410);
        $this->withHeaders($this->authHeaders($cashier))
            ->postJson("/api/cashier/payment-requests/{$order->id}/reject", [
                'type' => 'customer_order',
                'rejection_reason' => 'Disabled',
            ])
            ->assertStatus(410);

        $this->assertDatabaseHas('customer_orders', [
            'id' => $order->id,
            'status' => 'approved',
            'payment_status' => 'pending',
        ]);
    }
}
