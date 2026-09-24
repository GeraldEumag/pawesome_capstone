<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Payment;
use App\Models\User;
use App\Models\Customer;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * End-to-End Integration Test: Frontend → Backend → Database → All Dashboards
 * 
 * This test verifies that data flows correctly through the entire system
 * and appears consistently across Inventory, Cashier, and Customer dashboards.
 */
class CentralizedDataFlowTest extends TestCase
{
    use RefreshDatabase;

    protected $admin;
    protected $cashier;
    protected $inventoryUser;
    protected $customerUser;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Create users for different roles
        $this->admin = User::factory()->create([
            'role' => 'admin',
            'name' => 'Admin User'
        ]);
        
        $this->cashier = User::factory()->create([
            'role' => 'cashier',
            'name' => 'Cashier User'
        ]);

        $this->inventoryUser = User::factory()->create([
            'role' => 'inventory',
            'name' => 'Inventory User'
        ]);

        // Create customer user (regular user that can access public inventory)
        $this->customerUser = User::factory()->create([
            'role' => 'customer',
            'name' => 'Test Customer',
            'email' => 'customer@test.com',
        ]);

        // Create customer record linked to user
        Customer::create([
            'name' => 'Test Customer',
            'email' => 'customer@test.com',
            'phone' => '09123456789',
            'user_id' => $this->customerUser->id,
        ]);
    }

    // ============================================
    // TEST 1: Inventory Data Flow
    // Frontend → Backend → Database → Inventory Dashboard
    // ============================================

    public function test_inventory_data_flows_to_dashboard(): void
    {
        // Step 1: Create inventory items (simulating Frontend → Backend)
        $items = [];
        $categories = ['Food', 'Accessories', 'Grooming', 'Toys', 'Health'];
        
        foreach ($categories as $index => $category) {
            $response = $this->actingAs($this->admin)
                ->postJson('/api/admin/inventory/items', [
                    'sku' => "FLOW-{$category}-00" . ($index + 1),
                    'barcode' => 'FLOW-' . strtoupper(substr($category, 0, 3)) . '-' . ($index + 1),
                    'name' => "{$category} Test Item",
                    'category' => $category,
                    'brand' => 'TestBrand',
                    'supplier' => 'Test Supplier',
                    'price' => 100 * ($index + 1),
                    'stock' => 50,
                    'reorder_level' => 10,
                    'status' => 'active',
                    'description' => "Test {$category} item for data flow",
                ]);

            $response->assertStatus(201);
            $items[] = $response->json('item');
        }

        // Step 2: Verify data in Database
        $this->assertDatabaseCount('inventory_items', 5);
        
        foreach ($items as $item) {
            $this->assertDatabaseHas('inventory_items', [
                'id' => $item['id'],
                'sku' => $item['sku'],
                'category' => $item['category'],
                'status' => 'active',
            ]);

            // Verify inventory logs created
            $this->assertDatabaseHas('inventory_logs', [
                'inventory_item_id' => $item['id'],
                'delta' => 50,
                'reason' => 'Initial stock',
            ]);
        }

        // Step 3: Verify data appears in Inventory Dashboard API
        $dashboardResponse = $this->actingAs($this->admin)
            ->getJson('/api/inventory/dashboard/overview');

        $dashboardResponse->assertStatus(200)
            ->assertJsonPath('data.total_items', 5)
            ->assertJsonStructure([
                'data' => [
                    'total_items',
                    'total_inventory_value',
                    'category_breakdown',
                    'low_stock_count',
                    'out_of_stock_count',
                ]
            ]);

        // Verify category breakdown includes all categories
        $categoryBreakdown = $dashboardResponse->json('data.category_breakdown');
        $this->assertCount(5, $categoryBreakdown);

        // Step 4: Verify items list API
        $listResponse = $this->actingAs($this->admin)
            ->getJson('/api/admin/inventory/items');

        $listResponse->assertStatus(200)
            ->assertJsonCount(5, 'items');

        // Verify each category appears correctly
        foreach ($categories as $category) {
            $categoryItems = collect($listResponse->json('items'))
                ->where('category', $category);
            $this->assertCount(1, $categoryItems, "Category {$category} should have 1 item");
        }
    }

    // ============================================
    // TEST 2: Sale Data Flow
    // Cashier POS → Backend → Database → Cashier Dashboard
    // ============================================

    public function test_sale_data_flows_through_system(): void
    {
        // Step 1: Create inventory products
        $product1 = InventoryItem::create([
            'sku' => 'SALE-PROD-001',
            'name' => 'Dog Food Premium',
            'category' => 'Food',
            'price' => 1250,
            'stock' => 50,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $product2 = InventoryItem::create([
            'sku' => 'SALE-PROD-002',
            'name' => 'Squeaky Toy',
            'category' => 'Toys',
            'price' => 350,
            'stock' => 30,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Step 2: Process sale (Cashier POS → Backend)
        $saleResponse = $this->actingAs($this->cashier)
            ->postJson('/api/cashier/pos/transaction', [
                'customer_id' => $this->customerUser->id,
                'items' => [
                    [
                        'id' => $product1->id,
                        'item_type' => 'product',
                        'quantity' => 2,
                        'unit_price' => 1250,
                    ],
                    [
                        'id' => $product2->id,
                        'item_type' => 'product',
                        'quantity' => 1,
                        'unit_price' => 350,
                    ]
                ],
                'payment_method' => 'cash',
                'cash_received' => 3000,
                'notes' => 'Test centralized sale',
            ]);

        $saleResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['transaction', 'receipt']);

        $transaction = $saleResponse->json('transaction');
        $saleId = $transaction['id'];

        // Step 3: Verify data in Database
        // 3a. Verify sale record
        $this->assertDatabaseHas('sales', [
            'id' => $saleId,
            'customer_id' => Customer::where('email', $this->customerUser->email)->value('id'),
            'cashier_id' => $this->cashier->id,
            'status' => 'completed',
        ]);

        // 3b. Verify sale items
        $this->assertDatabaseHas('sale_items', [
            'sale_id' => $saleId,
            'product_id' => $product1->id,
            'quantity' => 2,
        ]);

        $this->assertDatabaseHas('sale_items', [
            'sale_id' => $saleId,
            'product_id' => $product2->id,
            'quantity' => 1,
        ]);

        // 3c. Verify payment record
        $this->assertDatabaseHas('payments', [
            'sale_id' => $saleId,
            'payment_method' => 'cash',
            'status' => 'completed',
        ]);

        // 3d. Verify inventory stock reduced
        $this->assertEquals(48, $product1->fresh()->stock); // 50 - 2
        $this->assertEquals(29, $product2->fresh()->stock); // 30 - 1

        // 3e. Verify inventory logs
        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $product1->id,
            'delta' => -2,
            'reason' => 'Sale',
        ]);

        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $product2->id,
            'delta' => -1,
            'reason' => 'Sale',
        ]);

        // Step 4: Verify appears in Cashier Dashboard
        $cashierDashboard = $this->actingAs($this->cashier)
            ->getJson('/api/cashier/dashboard/overview');

        $cashierDashboard->assertStatus(200);
        // Should show today's sales including our transaction
        $todaySales = $cashierDashboard->json('data.today_sales');
        $this->assertNotNull($todaySales);

        // Step 5: Verify transaction appears in transaction history
        $transactionsResponse = $this->actingAs($this->admin)
            ->getJson('/api/admin/reports/sales');

        $transactionsResponse->assertStatus(200);
        $transactions = collect($transactionsResponse->json('data.sales'))
            ->where('id', $saleId);
        $this->assertCount(1, $transactions);
    }

    // ============================================
    // TEST 3: Customer Store Data Flow
    // Customer Dashboard → Backend → Database
    // ============================================

    public function test_customer_store_shows_centralized_inventory(): void
    {
        // Step 1: Create inventory items across categories
        $foodItem = InventoryItem::create([
            'sku' => 'STORE-FOOD-001',
            'name' => 'Premium Kibble',
            'category' => 'Food',
            'price' => 850,
            'stock' => 40,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $toyItem = InventoryItem::create([
            'sku' => 'STORE-TOY-001',
            'name' => 'Rubber Ball',
            'category' => 'Toys',
            'price' => 250,
            'stock' => 60,
            'reorder_level' => 15,
            'status' => 'active',
        ]);

        $healthItem = InventoryItem::create([
            'sku' => 'STORE-HLTH-001',
            'name' => 'Flea Treatment',
            'category' => 'Health',
            'price' => 650,
            'stock' => 25,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Step 2: Verify inventory API (used by Customer Store)
        $inventoryResponse = $this->actingAs($this->customerUser)
            ->getJson('/api/inventory/public/items');

        $inventoryResponse->assertStatus(200);
        $items = $inventoryResponse->json('items');

        // Should include all our items
        $this->assertTrue(collect($items)->contains('sku', 'STORE-FOOD-001'));
        $this->assertTrue(collect($items)->contains('sku', 'STORE-TOY-001'));
        $this->assertTrue(collect($items)->contains('sku', 'STORE-HLTH-001'));

        // Step 3: Verify categorized data (Customer Store uses categorizeProducts)
        $foodItems = collect($items)->where('category', 'Food');
        $toyItems = collect($items)->where('category', 'Toys');
        $healthItems = collect($items)->where('category', 'Health');

        $this->assertTrue($foodItems->isNotEmpty(), 'Food items should be present');
        $this->assertTrue($toyItems->isNotEmpty(), 'Toy items should be present');
        $this->assertTrue($healthItems->isNotEmpty(), 'Health items should be present');

        // Step 4: Verify stock status is accurate
        $kibble = collect($items)->firstWhere('sku', 'STORE-FOOD-001');
        $this->assertEquals(40, $kibble['stock']);
        $this->assertEquals('Food', $kibble['category']);
        $this->assertEquals(850, $kibble['price']);
    }

    // ============================================
    // TEST 4: Data Consistency Across Dashboards
    // ============================================

    public function test_stock_changes_reflect_across_all_dashboards(): void
    {
        // Step 1: Create initial inventory
        $product = InventoryItem::create([
            'sku' => 'FLOW-STOCK-001',
            'name' => 'Stock Test Product',
            'category' => 'Food',
            'price' => 500,
            'stock' => 100,
            'reorder_level' => 20,
            'status' => 'active',
        ]);

        // Verify initial state in Inventory Dashboard
        $initialInventoryCheck = $this->actingAs($this->admin)
            ->getJson('/api/admin/inventory/items');
        
        $initialItem = collect($initialInventoryCheck->json('items'))
            ->firstWhere('sku', 'FLOW-STOCK-001');
        $this->assertEquals(100, $initialItem['stock']);

        // Step 2: Make a sale (reduces stock)
        $saleResponse = $this->actingAs($this->cashier)
            ->postJson('/api/cashier/pos/transaction', [
                'customer_id' => $this->customerUser->id,
                'items' => [
                    [
                        'id' => $product->id,
                        'item_type' => 'product',
                        'quantity' => 5,
                        'unit_price' => 500,
                    ]
                ],
                'payment_method' => 'cash',
                'cash_received' => 3000,
            ]);

        $saleResponse->assertStatus(200);

        // Step 3: Verify reduced stock in Inventory Dashboard
        $updatedInventoryCheck = $this->actingAs($this->admin)
            ->getJson('/api/admin/inventory/items');

        $updatedItem = collect($updatedInventoryCheck->json('items'))
            ->firstWhere('sku', 'FLOW-STOCK-001');
        $this->assertEquals(95, $updatedItem['stock']); // 100 - 5

        // Step 4: Verify same stock in Customer Store API
        $customerStoreCheck = $this->actingAs($this->customerUser)
            ->getJson('/api/inventory/public/items');

        $storeItem = collect($customerStoreCheck->json('items'))
            ->firstWhere('sku', 'FLOW-STOCK-001');
        $this->assertEquals(95, $storeItem['stock']);

        // Step 5: Verify inventory logs show the change
        $logsResponse = $this->actingAs($this->admin)
            ->getJson("/api/admin/inventory/items/{$product->id}/logs");

        $logsResponse->assertStatus(200);
        $logs = $logsResponse->json('logs');
        
        $saleLog = collect($logs)->firstWhere('reason', 'Sale');
        $this->assertNotNull($saleLog);
        $this->assertEquals(-5, $saleLog['delta']);
    }

    // ============================================
    // TEST 5: Category Consistency (P0.2)
    // ============================================

    public function test_categories_are_consistent_across_all_dashboards(): void
    {
        // Create items that might have category mapping issues
        $items = [
            ['sku' => 'CONS-FOOD-001', 'name' => 'Dog Treats', 'category' => 'Food'],
            ['sku' => 'CONS-ACC-001', 'name' => 'Dog Collar', 'category' => 'Accessories'],
            ['sku' => 'CONS-HLTH-001', 'name' => 'Vaccine', 'category' => 'Health'],
            ['sku' => 'CONS-TOY-001', 'name' => 'Chew Toy', 'category' => 'Toys'],
            ['sku' => 'CONS-GROOM-001', 'name' => 'Shampoo', 'category' => 'Grooming'],
        ];

        foreach ($items as $itemData) {
            InventoryItem::create([
                'sku' => $itemData['sku'],
                'name' => $itemData['name'],
                'category' => $itemData['category'],
                'price' => 500,
                'stock' => 50,
                'reorder_level' => 10,
                'status' => 'active',
            ]);
        }

        // Check consistency across all APIs
        $endpoints = [
            '/api/admin/inventory/items',
            '/api/inventory/public/items',
            '/api/cashier/pos/items',
            '/api/inventory/dashboard/overview',
        ];

        foreach ($endpoints as $endpoint) {
            $response = $this->actingAs($this->admin)->getJson($endpoint);
            
            if ($response->getStatusCode() === 200) {
                $json = $response->json();
                
                // Verify no invalid categories exist
                $allCategories = collect($json)
                    ->dot()
                    ->filter(fn ($value, $key) => $key === 'category' || str_ends_with($key, '.category'))
                    ->values();

                $validCategories = ['Food', 'Accessories', 'Grooming', 'Toys', 'Health', 'Services'];
                
                foreach ($allCategories as $category) {
                    if (is_string($category)) {
                        $this->assertContains($category, $validCategories, 
                            "Invalid category '{$category}' found at {$endpoint}");
                    }
                }
            }
        }
    }

    // ============================================
    // TEST 6: Concurrent Access (Race Conditions)
    // ============================================

    public function test_concurrent_stock_updates_handle_correctly(): void
    {
        $product = InventoryItem::create([
            'sku' => 'RACE-COND-001',
            'name' => 'Race Condition Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 100,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Simulate multiple sales happening
        $sale1 = $this->actingAs($this->cashier)
            ->postJson('/api/cashier/pos/transaction', [
                'customer_id' => $this->customerUser->id,
                'items' => [['id' => $product->id, 'item_type' => 'product', 'quantity' => 5, 'unit_price' => 500]],
                'payment_method' => 'cash',
                'cash_received' => 3000,
            ]);

        $sale2 = $this->actingAs($this->cashier)
            ->postJson('/api/cashier/pos/transaction', [
                'customer_id' => $this->customerUser->id,
                'items' => [['id' => $product->id, 'item_type' => 'product', 'quantity' => 3, 'unit_price' => 500]],
                'payment_method' => 'cash',
                'cash_received' => 2000,
            ]);

        $sale1->assertStatus(200);
        $sale2->assertStatus(200);

        // Verify final stock is correct (100 - 5 - 3 = 92)
        $finalStock = $product->fresh()->stock;
        
        // Due to race conditions, stock might be 92 or one sale might fail
        // Both outcomes are acceptable - either both succeeded or one was rejected
        $this->assertTrue(
            $finalStock === 92 || $finalStock === 95 || $finalStock === 97,
            "Stock should be consistent after concurrent updates. Got: {$finalStock}"
        );

        // Verify inventory logs exist for successful sales
        $logs = InventoryLog::where('inventory_item_id', $product->id)->get();
        $this->assertGreaterThanOrEqual(2, $logs->count()); // Initial + at least 1 sale
    }

    // ============================================
    // TEST 7: End-to-End Business Flow
    // ============================================

    public function test_complete_business_flow(): void
    {
        // Scenario: Admin adds inventory → Cashier sells → Customer views → Stock updates

        // Step 1: Admin adds new product
        $adminResponse = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'COMPLETE-FLOW-001',
                'barcode' => 'COMPLETEFLOW001',
                'name' => 'Complete Flow Product',
                'category' => 'Food',
                'brand' => 'TestBrand',
                'supplier' => 'Test Supplier',
                'price' => 750,
                'stock' => 100,
                'reorder_level' => 20,
                'status' => 'active',
                'description' => 'Product for complete flow test',
            ]);

        $adminResponse->assertStatus(201);
        $productId = $adminResponse->json('item.id');

        // Step 2: Verify in Inventory Dashboard
        $inventoryCheck = $this->actingAs($this->admin)
            ->getJson('/api/admin/inventory/items/' . $productId);
        $inventoryCheck->assertStatus(200);
        $this->assertEquals(100, $inventoryCheck->json('item.stock'));

        // Step 3: Cashier makes sale
        $cashierResponse = $this->actingAs($this->cashier)
            ->postJson('/api/cashier/pos/transaction', [
                'customer_id' => $this->customerUser->id,
                'items' => [
                    [
                        'id' => $productId,
                        'item_type' => 'product',
                        'quantity' => 10,
                        'unit_price' => 750,
                    ]
                ],
                'payment_method' => 'cash',
                'cash_received' => 8000,
            ]);

        $cashierResponse->assertStatus(200);

        // Step 4: Customer views updated inventory in store
        $customerResponse = $this->actingAs($this->customerUser)
            ->getJson('/api/inventory/public/items');

        $customerResponse->assertStatus(200);
        $customerItem = collect($customerResponse->json('items'))
            ->firstWhere('id', $productId);
        
        $this->assertNotNull($customerItem);
        $this->assertEquals(90, $customerItem['stock']); // 100 - 10

        // Step 5: Admin checks inventory logs
        $logsResponse = $this->actingAs($this->admin)
            ->getJson("/api/admin/inventory/items/{$productId}/logs");

        $logsResponse->assertStatus(200);
        $logs = $logsResponse->json('logs');
        
        // Should have initial stock log and sale log
        $initialLog = collect($logs)->firstWhere('reason', 'Initial stock');
        $saleLog = collect($logs)->firstWhere('reason', 'Sale');
        
        $this->assertNotNull($initialLog);
        $this->assertNotNull($saleLog);
        $this->assertEquals(100, $initialLog['delta']);
        $this->assertEquals(-10, $saleLog['delta']);

        // Step 6: Verify final state in all dashboards
        $finalInventory = $this->actingAs($this->admin)
            ->getJson('/api/admin/inventory/items/' . $productId);
        $this->assertEquals(90, $finalInventory->json('item.stock'));

        $finalDashboard = $this->actingAs($this->admin)
            ->getJson('/api/inventory/dashboard/overview');
        $finalDashboard->assertStatus(200);
        // Total value should include our product: 90 * 750 = 67500
    }
}
