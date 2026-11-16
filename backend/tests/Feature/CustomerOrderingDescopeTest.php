<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * F-02 descope: customer self-service product ordering is permanently out
 * of scope. Mutation endpoints must stay disabled (410 — not resurrected,
 * not silently 404'd), while read-only history/receipt access to existing
 * customer_orders records is preserved.
 */
class CustomerOrderingDescopeTest extends TestCase
{
    use RefreshDatabase;

    private function headersFor(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken];
    }

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer', 'is_active' => true]);
    }

    private function receptionist(): User
    {
        return User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
    }

    public function test_checkout_is_disabled_410(): void
    {
        $this->postJson('/api/customer/store/checkout', [
            'items' => [['inventory_item_id' => 1, 'quantity' => 1]],
        ], $this->headersFor($this->customer()))
            ->assertStatus(410)
            ->assertJsonPath('success', false);
    }

    public function test_payment_proof_upload_is_disabled_410(): void
    {
        $this->postJson('/api/customer/store/orders/1/payment-proof', [],
            $this->headersFor($this->customer()))
            ->assertStatus(410);
    }

    public function test_customer_order_cancel_is_disabled_410(): void
    {
        $this->postJson('/api/customer/store/orders/1/cancel', [
            'cancellation_reason' => 'changed my mind',
        ], $this->headersFor($this->customer()))
            ->assertStatus(410);
    }

    public function test_receptionist_order_mutations_are_disabled_410(): void
    {
        $headers = $this->headersFor($this->receptionist());

        $this->postJson('/api/receptionist/customer-orders/1/approve', [], $headers)
            ->assertStatus(410);
        $this->postJson('/api/receptionist/customer-orders/1/reject', [], $headers)
            ->assertStatus(410);
        $this->postJson('/api/receptionist/customer-orders/1/cancel', [], $headers)
            ->assertStatus(410);
        $this->getJson('/api/receptionist/customer-orders/pending', $headers)
            ->assertStatus(410);
    }

    public function test_customer_order_history_reads_remain_available(): void
    {
        // Historical records must stay readable — receipts/reports depend on them.
        $this->getJson('/api/customer/store/orders', $this->headersFor($this->customer()))
            ->assertOk();
    }

    public function test_receptionist_order_list_reads_remain_available(): void
    {
        $headers = $this->headersFor($this->receptionist());

        $this->getJson('/api/receptionist/customer-orders', $headers)->assertOk();
        $this->getJson('/api/receptionist/orders/approval-history', $headers)->assertOk();
    }

    public function test_unauthenticated_requests_are_rejected_not_gone(): void
    {
        // Auth middleware runs before the 410 — no unauthenticated signal.
        $this->postJson('/api/customer/store/checkout', [])->assertStatus(401);
        $this->getJson('/api/customer/store/orders')->assertStatus(401);
    }

    public function test_customer_order_tables_and_models_are_preserved(): void
    {
        // Descope must never drop historical data or its access layer.
        $this->assertTrue(Schema::hasTable('customer_orders'));
        $this->assertTrue(Schema::hasTable('customer_order_items'));
        $this->assertTrue(class_exists(\App\Models\CustomerOrder::class));
        $this->assertTrue(class_exists(\App\Models\CustomerOrderItem::class));
    }

    public function test_disabled_mutation_creates_no_order(): void
    {
        $before = DB::table('customer_orders')->count();

        $this->postJson('/api/customer/store/checkout', [
            'items' => [['inventory_item_id' => 1, 'quantity' => 5]],
        ], $this->headersFor($this->customer()))->assertStatus(410);

        $this->assertSame($before, DB::table('customer_orders')->count());
    }
}
