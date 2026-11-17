<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\PaymentSettlement;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression coverage for the Cashier dashboard defects found during the
 * full-system audit:
 *
 *  - /cashier/void wrote status 'voided', which is not in the sales.status
 *    enum, so the endpoint always failed after doing its reversal work.
 *  - /cashier/refund wrote type 'refund' and /cashier/multi-payment wrote
 *    type 'multi_payment' — neither is in the sales.type enum, so both
 *    endpoints always 500'd.
 *  - /cashier/transactions double-listed a payment when a service request
 *    was mirrored paid through a linked boarding/grooming/appointment
 *    settlement.
 *  - Dashboard revenue aggregates included cancelled/refunded sales.
 *  - payment_settlements.payment_method was NULL for counter-cash table
 *    payments because the settlement read the stale pre-update row.
 */
class CashierDashboardDefectsTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = User::factory()->create(['role' => 'cashier', 'is_active' => true]);
    }

    private function headers(): array
    {
        return ['Authorization' => 'Bearer ' . $this->cashier->createToken('t')->plainTextToken];
    }

    private function posCheckout(InventoryItem $product, int $qty = 1): array
    {
        $response = $this->withHeaders($this->headers())->postJson('/api/cashier/pos/transaction', [
            'items' => [[
                'item_id' => $product->id,
                'item_type' => 'product',
                'item_name' => $product->name,
                'quantity' => $qty,
                'unit_price' => $product->price,
            ]],
            'payment_method' => 'cash',
            'cash_received' => 10000,
        ]);

        $response->assertOk()->assertJsonPath('success', true);

        return $response->json();
    }

    private function product(float $price = 100, int $stock = 10): InventoryItem
    {
        return InventoryItem::create([
            'sku' => 'AUDIT-' . uniqid(),
            'name' => 'Audit Product',
            'category' => 'Food',
            'price' => $price,
            'stock' => $stock,
            'reorder_level' => 1,
            'status' => 'active',
        ]);
    }

    public function test_dashboard_void_cancels_and_fully_reverses_the_sale(): void
    {
        $product = $this->product(100, 10);
        $payload = $this->posCheckout($product, 2);
        $this->assertSame(8, $product->fresh()->stock);

        $saleId = $payload['transaction']['id'] ?? $payload['transaction']['sale_id']
            ?? Sale::latest('id')->value('id');
        $sale = Sale::findOrFail($saleId);

        $response = $this->withHeaders($this->headers())->postJson('/api/cashier/void', [
            'transaction_id' => 'SALE-' . $sale->id,
            'reason' => 'Audit void regression',
            'cashier_name' => 'Audit Cashier',
        ]);

        $response->assertOk()->assertJsonPath('success', true);

        $sale->refresh();
        $this->assertSame('cancelled', $sale->status);
        $this->assertSame('Audit void regression', $sale->void_reason);
        $this->assertNotNull($sale->voided_at);
        $this->assertSame(10, $product->fresh()->stock);
        $this->assertSame('refunded', $sale->payments()->first()->status ?? 'refunded');
        if ($sale->invoice) {
            $this->assertSame('cancelled', $sale->invoice->status);
        }

        // A second void on the same sale is rejected.
        $this->withHeaders($this->headers())->postJson('/api/cashier/void', [
            'transaction_id' => 'SALE-' . $sale->id,
            'reason' => 'second attempt',
            'cashier_name' => 'Audit Cashier',
        ])->assertStatus(400);
    }

    public function test_dashboard_refund_records_a_negative_ledger_row(): void
    {
        $product = $this->product(100, 10);
        $this->posCheckout($product);
        $sale = Sale::latest('id')->firstOrFail();

        $response = $this->withHeaders($this->headers())->postJson('/api/cashier/refund', [
            'transaction_id' => 'SALE-' . $sale->id,
            'amount' => 100,
            'reason' => 'Audit refund regression',
            'cashier_name' => 'Audit Cashier',
        ]);

        $response->assertOk()->assertJsonPath('success', true);

        $refund = Sale::findOrFail($response->json('refund_id'));
        $this->assertSame(-100.0, (float) $refund->amount);
        $this->assertSame('refund', $refund->payment_type);
        $this->assertContains($refund->type, ['appointment', 'boarding', 'product']);
    }

    public function test_refund_is_bounded_by_the_remaining_refundable_amount(): void
    {
        $product = $this->product(100, 10);
        $this->posCheckout($product);
        $sale = Sale::latest('id')->firstOrFail();

        // First refund consumes part of the refundable balance.
        $this->withHeaders($this->headers())->postJson('/api/cashier/refund', [
            'transaction_id' => 'SALE-' . $sale->id,
            'amount' => 100,
            'reason' => 'partial refund',
            'cashier_name' => 'Audit Cashier',
        ])->assertOk()->assertJsonPath('success', true);

        // A second refund cannot exceed what is left (sale total - refunded).
        $this->withHeaders($this->headers())->postJson('/api/cashier/refund', [
            'transaction_id' => 'SALE-' . $sale->id,
            'amount' => 50,
            'reason' => 'over-refund attempt',
            'cashier_name' => 'Audit Cashier',
        ])->assertStatus(422);

        $this->assertSame(1, Sale::where('payment_type', 'refund')->count());
    }

    public function test_refund_rejects_non_completed_sales(): void
    {
        $cancelled = Sale::create([
            'amount' => 100, 'type' => 'product',
            'status' => 'cancelled', 'payment_type' => 'cash',
        ]);

        $this->withHeaders($this->headers())->postJson('/api/cashier/refund', [
            'transaction_id' => 'SALE-' . $cancelled->id,
            'amount' => 50,
            'reason' => 'refund on voided sale',
            'cashier_name' => 'Audit Cashier',
        ])->assertStatus(422);

        $this->assertSame(0, Sale::where('payment_type', 'refund')->count());
    }

    public function test_multi_payment_records_a_zero_amount_audit_row(): void
    {
        $response = $this->withHeaders($this->headers())->postJson('/api/cashier/multi-payment', [
            'cash_amount' => 300,
            'card_amount' => 200,
            'total_amount' => 500,
        ]);

        $response->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('sales', [
            'id' => $response->json('transaction_id'),
            'amount' => 0,
            'payment_type' => 'multi',
        ]);
    }

    public function test_transactions_feed_does_not_double_list_linked_service_payments(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $sr = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'customer_name' => $customer->name,
            'customer_email' => $customerUser->email,
            'request_type' => 'grooming',
            'service_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => now()->addDay()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
            'paid_at' => now(),
            'total_amount' => 500,
            'booking_channel' => 'online',
        ]);

        // The operational record that actually settled the payment.
        DB::table('groomings')->insert([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Bath and Brush',
            'appointment_date' => now()->addDay()->toDateString(),
            'service_request_id' => $sr->id,
            'status' => 'approved',
            'payment_status' => 'paid',
            'paid_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $groomingId = DB::table('groomings')->latest('id')->value('id');

        DB::table('payment_settlements')->insert([
            'settleable_type' => 'grooming',
            'settleable_id' => $groomingId,
            'customer_id' => $customer->id,
            'amount' => 500,
            'status' => 'paid',
            'paid_at' => now(),
            'idempotency_key' => 'audit:' . uniqid(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withHeaders($this->headers())->getJson('/api/cashier/transactions');
        $response->assertOk();

        $ids = collect($response->json('transactions'))->pluck('id');
        $this->assertNotContains('SERVICE-' . $sr->id, $ids);
        $this->assertTrue($ids->contains(fn ($id) => str_starts_with((string) $id, 'SETTLEMENT-')));
    }

    public function test_unlinked_paid_service_request_still_appears_in_feed(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $sr = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'customer_name' => $customer->name,
            'customer_email' => $customerUser->email,
            'request_type' => 'grooming',
            'service_type' => 'grooming',
            'service_name' => 'Nail Trim',
            'request_date' => now()->addDay()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
            'paid_at' => now(),
            'total_amount' => 300,
            'booking_channel' => 'online',
        ]);

        $response = $this->withHeaders($this->headers())->getJson('/api/cashier/transactions');
        $response->assertOk();
        $this->assertContains('SERVICE-' . $sr->id, collect($response->json('transactions'))->pluck('id'));
    }

    public function test_overview_excludes_cancelled_sales_from_revenue(): void
    {
        Sale::create(['amount' => 100, 'type' => 'product', 'status' => 'completed', 'payment_type' => 'cash']);
        Sale::create(['amount' => 50, 'type' => 'product', 'status' => 'cancelled', 'payment_type' => 'cash']);
        Sale::create(['amount' => 200, 'type' => 'product', 'status' => 'completed', 'payment_type' => 'gcash']);

        $response = $this->withHeaders($this->headers())->getJson('/api/cashier/dashboard');
        $response->assertOk();

        $this->assertSame(300.0, (float) $response->json('today_sales'));
        $this->assertSame(2, (int) $response->json('today_transactions'));

        $byType = collect($response->json('sales_by_type'))->keyBy('type');
        $this->assertSame(100.0, (float) $byType['cash']['total']);
        $this->assertSame(200.0, (float) $byType['gcash']['total']);
    }

    public function test_counter_cash_table_payment_records_settlement_method(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $groomingId = DB::table('groomings')->insertGetId([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Bath and Brush',
            'appointment_date' => now()->addDay()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withHeaders($this->headers())->postJson(
            "/api/cashier/payment-requests/{$groomingId}/verify",
            ['type' => 'grooming', 'payment_method' => 'cash']
        );

        $response->assertOk()->assertJsonPath('success', true);

        $settlement = PaymentSettlement::where('settleable_type', 'grooming')
            ->where('settleable_id', $groomingId)
            ->firstOrFail();
        $this->assertSame('cash', $settlement->payment_method);
        $this->assertSame('cash', DB::table('groomings')->where('id', $groomingId)->value('payment_method'));
    }
}
