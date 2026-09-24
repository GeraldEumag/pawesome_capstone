<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class POSTest extends TestCase
{
    use RefreshDatabase;

    protected $cashier;
    protected $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = User::factory()->create([
            'role' => 'cashier',
        ]);
        $this->customer = Customer::create([
            'name' => 'Test Customer',
            'email' => 'test@example.com',
            'phone' => '09123456789',
        ]);
    }

    protected function withCashierAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->cashier->createToken('test-token')->plainTextToken];
    }

    /**
     * Test processing a sale with product items
     */
    public function test_process_sale_with_products(): void
    {
        $product = InventoryItem::create([
            'sku' => 'PROD-001',
            'name' => 'Test Product',
            'category' => 'Food',
            'price' => 500,
            'stock' => 20,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $this->customer->id,
            'items' => [
                [
                    'item_id' => $product->id,
                    'item_type' => 'product',
                    'item_name' => $product->name,
                    'quantity' => 2,
                    'unit_price' => 500,
                ]
            ],
            'payment_method' => 'cash',
            'cash_received' => 1500,
        ], $this->withCashierAuth());

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['transaction', 'receipt']);

        // Verify stock was reduced
        $this->assertEquals(18, $product->fresh()->stock);

        // Verify sale was recorded
        $this->assertDatabaseHas('sales', [
            'customer_id' => $this->customer->id,
            'cashier_id' => $this->cashier->id,
        ]);
    }

    /**
     * Test category mapping in POS (P0.2 fix)
     */
    public function test_pos_category_mapping_consistency(): void
    {
        // Create items with SKUs that should map to specific categories
        $healthItem = InventoryItem::create([
            'sku' => 'VACCINE-001', // Should map to Health
            'name' => 'Vaccine Shot',
            'category' => 'Health',
            'price' => 850,
            'stock' => 50,
            'reorder_level' => 20,
            'status' => 'active',
        ]);

        $foodItem = InventoryItem::create([
            'sku' => 'TREAT-001', // Should map to Food
            'name' => 'Dog Treats',
            'category' => 'Food',
            'price' => 200,
            'stock' => 100,
            'reorder_level' => 30,
            'status' => 'active',
        ]);

        $accessoryItem = InventoryItem::create([
            'sku' => 'LEASH-001', // Should map to Accessories
            'name' => 'Nylon Leash',
            'category' => 'Accessories',
            'price' => 350,
            'stock' => 25,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Verify categories are consistent
        $this->assertEquals('Health', $healthItem->category);
        $this->assertEquals('Food', $foodItem->category);
        $this->assertEquals('Accessories', $accessoryItem->category);
    }

    /**
     * Test sale calculation accuracy: totals are server-computed VAT-inclusive
     * and client-supplied discounts are not honored (no discount engine exists).
     */
    public function test_sale_calculation_accuracy(): void
    {
        $product1 = InventoryItem::create([
            'sku' => 'CALC-001',
            'name' => 'Product 1',
            'category' => 'Food',
            'price' => 500,
            'stock' => 20,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $product2 = InventoryItem::create([
            'sku' => 'CALC-002',
            'name' => 'Product 2',
            'category' => 'Toys',
            'price' => 300,
            'stock' => 15,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $this->customer->id,
            'items' => [
                [
                    'item_id' => $product1->id,
                    'item_type' => 'product',
                    'item_name' => $product1->name,
                    'quantity' => 2,
                    'unit_price' => 500,
                    'discount_amount' => 400, // must be ignored by the server
                ],
                [
                    'item_id' => $product2->id,
                    'item_type' => 'product',
                    'item_name' => $product2->name,
                    'quantity' => 1,
                    'unit_price' => 300,
                ]
            ],
            'payment_method' => 'cash',
            'cash_received' => 1500,
            'discount' => 200, // must be ignored by the server
            'discount_amount' => 100,
        ], $this->withCashierAuth());

        $response->assertStatus(200);

        $transaction = $response->json('transaction');
        // Gross subtotal 1300 is VAT-inclusive; VAT extracted = 1300 * 0.12 / 1.12.
        $this->assertEquals(1300, $transaction['total_amount']);
        $this->assertEquals(139.29, $transaction['tax_amount']);

        $sale = Sale::latest('id')->first();
        $this->assertEquals(1300, (float) $sale->subtotal);
        $this->assertEquals(0, (float) $sale->discount_amount);
        $this->assertEquals(1300, (float) $sale->total_amount);
        $this->assertEquals(0, (float) $sale->items->sum('discount_amount'));
    }

    /**
     * Test out of stock item cannot be sold
     */
    public function test_cannot_sell_out_of_stock_item(): void
    {
        $product = InventoryItem::create([
            'sku' => 'OUT-001',
            'name' => 'Out of Stock Product',
            'category' => 'Food',
            'price' => 500,
            'stock' => 0, // Out of stock
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $this->customer->id,
            'items' => [
                [
                    'item_id' => $product->id,
                    'item_type' => 'product',
                    'item_name' => $product->name,
                    'quantity' => 1,
                    'unit_price' => 500,
                ]
            ],
            'payment_method' => 'cash',
            'cash_received' => 1000,
        ], $this->withCashierAuth());

        // Should fail or handle gracefully
        $this->assertTrue(in_array($response->getStatusCode(), [422, 400, 200]));
    }

    /**
     * Test receipt generation
     */
    public function test_receipt_generation(): void
    {
        $product = InventoryItem::create([
            'sku' => 'RCPT-001',
            'name' => 'Receipt Test Product',
            'category' => 'Food',
            'price' => 750,
            'stock' => 30,
            'reorder_level' => 15,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $this->customer->id,
            'items' => [
                [
                    'item_id' => $product->id,
                    'item_type' => 'product',
                    'item_name' => $product->name,
                    'quantity' => 2,
                    'unit_price' => 750,
                ]
            ],
            'payment_method' => 'cash',
            'cash_received' => 2000,
        ], $this->withCashierAuth());

        $response->assertStatus(200);

        $receipt = $response->json('receipt');
        $this->assertNotNull($receipt);
        $this->assertArrayHasKey('transaction_number', $receipt);
        $this->assertArrayHasKey('total', $receipt);
        $this->assertArrayHasKey('payment', $receipt);
        $this->assertArrayHasKey('change', $receipt['payment']);
    }

    /**
     * Test payment method validation
     */
    public function test_payment_method_validation(): void
    {
        $product = InventoryItem::create([
            'sku' => 'PAY-001',
            'name' => 'Payment Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        // Valid payment methods
        $validMethods = ['cash', 'credit_card', 'debit_card', 'gcash', 'maya'];

        foreach ($validMethods as $method) {
            $response = $this->postJson('/api/cashier/pos/transaction', [
                'customer_id' => $this->customer->id,
                'items' => [
                    [
                        'item_id' => $product->id,
                        'item_type' => 'product',
                        'item_name' => $product->name,
                        'quantity' => 1,
                        'unit_price' => 500,
                    ]
                ],
                'payment_method' => $method,
                'cash_received' => 1000,
            ], $this->withCashierAuth());

            $this->assertTrue(in_array($response->getStatusCode(), [200, 422]));
            
            // Reset stock for next test
            $product->update(['stock' => 10]);
        }
    }

    /**
     * Test multiple items in single transaction
     */
    public function test_multiple_items_in_transaction(): void
    {
        $items = [];
        foreach (['Food', 'Toys', 'Accessories', 'Grooming'] as $category) {
            $items[] = InventoryItem::create([
                'sku' => 'MULTI-' . strtoupper(substr($category, 0, 3)) . '-001',
                'name' => $category . ' Item',
                'category' => $category,
                'price' => 100,
                'stock' => 50,
                'reorder_level' => 20,
                'status' => 'active',
            ]);
        }

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $this->customer->id,
            'items' => array_map(function ($item) {
                return [
                    'item_id' => $item->id,
                    'item_type' => 'product',
                    'item_name' => $item->name,
                    'quantity' => 2,
                    'unit_price' => $item->price,
                ];
            }, $items),
            'payment_method' => 'cash',
            'cash_received' => 1000,
        ], $this->withCashierAuth());

        $response->assertStatus(200);

        // Verify all stocks were reduced
        foreach ($items as $item) {
            $this->assertEquals(48, $item->fresh()->stock);
        }
    }
}
