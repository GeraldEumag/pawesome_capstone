<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PosFinancialIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function cashier(): User
    {
        return User::factory()->create(['role' => 'cashier', 'is_active' => true]);
    }

    private function product(int $stock = 5, float $price = 112, array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'P2-' . strtoupper(uniqid()),
            'name' => 'Authoritative Product',
            'category' => 'Health',
            'price' => $price,
            'stock' => $stock,
            'reorder_level' => 1,
            'status' => 'active',
            'is_sellable' => true,
        ], $overrides));
    }

    private function payload(array $items, float $cashReceived = 10000): array
    {
        return [
            'items' => $items,
            'payment_method' => 'cash',
            'cash_received' => $cashReceived,
        ];
    }

    private function productLine(int $id, int $quantity = 1, array $overrides = []): array
    {
        return array_merge([
            'item_type' => 'product',
            'item_id' => $id,
            'quantity' => $quantity,
        ], $overrides);
    }

    public function test_product_price_name_totals_payment_and_receipt_are_server_authoritative(): void
    {
        $cashier = $this->cashier();
        $product = $this->product();
        $payload = $this->payload([
            $this->productLine($product->id, 1, [
                'item_name' => 'Forged free item',
                'unit_price' => 0.01,
                'discount_amount' => 999,
            ]),
        ], 112);
        $payload += ['subtotal' => 0.01, 'tax' => 0, 'discount' => 111, 'total' => 0.01];

        $response = $this->postJson('/api/cashier/pos/transaction', $payload, [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-authoritative-product',
        ]);

        $response->assertOk()
            ->assertJsonPath('receipt.items.0.name', 'Authoritative Product');
        $this->assertEquals(112, (float) $response->json('receipt.total'));

        $sale = Sale::with('items')->firstOrFail();
        $this->assertSame(4, (int) $product->fresh()->stock);
        $this->assertSame('Authoritative Product', $sale->items->first()->item_name);
        $this->assertEquals(112, (float) $sale->items->first()->unit_price);
        $this->assertEquals(112, (float) $sale->total_amount);
        $this->assertEquals(12, (float) $sale->tax_amount);
        $this->assertEquals(0, (float) $sale->discount_amount);
        $this->assertEquals(112, (float) Payment::firstOrFail()->amount);
        $this->assertEquals(112, (float) Invoice::firstOrFail()->total_amount);
    }

    public function test_active_service_uses_database_price_and_name(): void
    {
        $cashier = $this->cashier();
        $service = Service::factory()->create([
            'name' => 'Authoritative Grooming',
            'price' => 560,
            'is_active' => true,
        ]);
        $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([[
            'item_type' => 'service',
            'service_id' => $service->id,
            'item_name' => 'Forged service',
            'unit_price' => 1,
            'quantity' => 1,
        ]], 560), [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-authoritative-service',
        ]);

        $response->assertOk()
            ->assertJsonPath('receipt.items.0.name', 'Authoritative Grooming');
        $this->assertEquals(560, (float) $response->json('receipt.total'));
        $this->assertSame('Authoritative Grooming', SaleItem::firstOrFail()->item_name);
        $this->assertEquals(560, (float) SaleItem::firstOrFail()->unit_price);
        $this->assertSame(0, InventoryItem::count());
    }

    public function test_inactive_service_cannot_be_sold_through_direct_api(): void
    {
        $cashier = $this->cashier();
        $service = Service::factory()->create(['is_active' => false]);
        $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([[
            'item_type' => 'service',
            'service_id' => $service->id,
            'quantity' => 1,
        ]]), [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-inactive-service',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, Payment::count());
    }

    public function test_inactive_product_cannot_be_sold_through_direct_api(): void
    {
        $cashier = $this->cashier();
        $product = $this->product(5, 100, ['status' => 'inactive']);
        $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([
            $this->productLine($product->id),
        ], 100), [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-inactive-product',
        ]);

        $response->assertStatus(422);
        $this->assertSame(5, (int) $product->fresh()->stock);
        $this->assertSame(0, Sale::count());
    }

    public function test_invalid_product_identifier_is_rejected_before_writes(): void
    {
        $cashier = $this->cashier();
        $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([
            $this->productLine(999999),
        ], 100), [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-invalid-product-id',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, Payment::count());
    }

    public function test_zero_negative_and_excess_quantities_are_rejected_without_writes(): void
    {
        $cashier = $this->cashier();
        $product = $this->product(2, 100);
        $headers = ['Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken];

        foreach ([0, -1, 3] as $index => $quantity) {
            $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([
                $this->productLine($product->id, $quantity),
            ], 10000), $headers + ['Idempotency-Key' => "phase2-invalid-quantity-{$index}"]);
            $response->assertStatus(422);
        }

        $this->assertSame(2, (int) $product->fresh()->stock);
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, Payment::count());
    }

    public function test_duplicate_product_lines_cannot_oversell_and_rollback_atomically(): void
    {
        $cashier = $this->cashier();
        $product = $this->product(1, 100);
        $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([
            $this->productLine($product->id),
            $this->productLine($product->id),
        ], 200), [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-duplicate-lines',
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, (int) $product->fresh()->stock);
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, SaleItem::count());
        $this->assertSame(0, Payment::count());
        $this->assertSame(0, Invoice::count());
    }

    public function test_cash_underpayment_rolls_back_stock_and_financial_records(): void
    {
        $cashier = $this->cashier();
        $product = $this->product(2, 112);
        $response = $this->postJson('/api/cashier/pos/transaction', $this->payload([
            $this->productLine($product->id),
        ], 111), [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-underpayment',
        ]);

        $response->assertStatus(422);
        $this->assertSame(2, (int) $product->fresh()->stock);
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, Payment::count());
        $this->assertSame(0, Invoice::count());
    }

    public function test_pos_requires_an_idempotency_key_and_replays_retries_once(): void
    {
        $cashier = $this->cashier();
        $product = $this->product(3, 100);
        $authorization = 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken;
        $payload = $this->payload([$this->productLine($product->id)], 100);

        $this->postJson('/api/cashier/pos/transaction', $payload, [
            'Authorization' => $authorization,
            'Idempotency-Key' => '',
        ])->assertStatus(422);
        $this->assertSame(0, Sale::count());

        $headers = [
            'Authorization' => $authorization,
            'Idempotency-Key' => 'phase2-retry-sale',
        ];
        $saleId = $this->postJson('/api/cashier/pos/transaction', $payload, $headers)
            ->assertOk()
            ->json('transaction.id');
        $this->postJson('/api/cashier/pos/transaction', $payload, $headers)
            ->assertOk()
            ->assertHeader('Idempotent-Replayed', 'true');

        $this->getJson("/api/cashier/pos/transaction/{$saleId}", [
            'Authorization' => $authorization,
        ])->assertOk();
        $this->getJson("/api/cashier/pos/transaction/{$saleId}", [
            'Authorization' => $authorization,
        ])->assertOk();

        $this->assertSame(1, Sale::count());
        $this->assertSame(1, Payment::count());
        $this->assertSame(2, (int) $product->fresh()->stock);
    }

    public function test_same_idempotency_key_with_changed_payload_is_rejected(): void
    {
        $cashier = $this->cashier();
        $product = $this->product(3, 100);
        $headers = [
            'Authorization' => 'Bearer ' . $cashier->createToken('pos-test')->plainTextToken,
            'Idempotency-Key' => 'phase2-changed-payload',
        ];

        $this->postJson('/api/cashier/pos/transaction', $this->payload([
            $this->productLine($product->id),
        ], 100), $headers)->assertOk();
        $this->postJson('/api/cashier/pos/transaction', $this->payload([
            $this->productLine($product->id, 2),
        ], 200), $headers)->assertStatus(409);

        $this->assertSame(1, Sale::count());
        $this->assertSame(1, Payment::count());
        $this->assertSame(2, (int) $product->fresh()->stock);
    }
}
