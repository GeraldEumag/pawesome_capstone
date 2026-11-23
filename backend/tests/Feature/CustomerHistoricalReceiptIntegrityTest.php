<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CustomerHistoricalReceiptIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_paid_historical_order_receipt_uses_persisted_total_for_breakdown(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $now = now();
        $orderId = DB::table('customer_orders')->insertGetId([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'total_amount' => 112,
            'payment_method' => 'cash',
            'status' => 'completed',
            'payment_status' => 'paid',
            'paid_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $response = $this->getJson("/api/customer/store/orders/{$orderId}/receipt", [
            'Authorization' => 'Bearer ' . $customer->createToken('receipt-test')->plainTextToken,
        ]);

        $response->assertOk()
            ->assertJsonPath('receipt.breakdown.total', 112)
            ->assertJsonPath('receipt.breakdown.amount_paid', 112)
            ->assertJsonPath('receipt.breakdown.vat_amount', 12);
        $this->assertEquals(112, (float) $response->json('receipt.total_amount'));
    }
}
