<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryTest extends TestCase
{
    use RefreshDatabase;

    protected $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create([
            'role' => 'admin',
            'email' => 'admin@test.com',
            'name' => 'Admin User',
        ]);
    }

    /**
     * Helper to make authenticated request as admin
     */
    protected function withAdminAuth(array $headers = []): array
    {
        return array_merge($headers, [
            'Authorization' => 'Bearer ' . $this->admin->createToken('test-token')->plainTextToken,
        ]);
    }

    // ============================================
    // CRUD OPERATIONS
    // ============================================

    public function test_can_create_inventory_item(): void
    {
        $response = $this->postJson('/api/admin/inventory/items', [
                'sku' => 'FOOD-TEST-001',
                'barcode' => 'FOODTEST001',
                'name' => 'Test Dog Food 5kg',
                'category' => 'Food',
                'brand' => 'TestBrand',
                'supplier' => 'Test Supplier',
                'price' => 500,
                'stock' => 10,
                'reorder_level' => 5,
                'description' => 'Test description',
                'status' => 'active',
            ], $this->withAdminAuth());

        $response->assertStatus(201)
            ->assertJsonPath('item.sku', 'FOOD-TEST-001')
            ->assertJsonPath('item.name', 'Test Dog Food 5kg')
            ->assertJsonPath('item.category', 'Food');

        $this->assertDatabaseHas('inventory_items', [
            'sku' => 'FOOD-TEST-001',
            'name' => 'Test Dog Food 5kg',
        ]);

        // Verify inventory log was created
        $this->assertDatabaseHas('inventory_logs', [
            'delta' => 10,
            'reason' => 'Initial stock',
        ]);
    }

    public function test_can_read_inventory_item(): void
    {
        $item = InventoryItem::create([
            'sku' => 'FOOD-TEST-002',
            'name' => 'Test Cat Food',
            'category' => 'Food',
            'price' => 300,
            'stock' => 20,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/admin/inventory/items/{$item->id}");

        $response->assertStatus(200)
            ->assertJsonPath('item.id', $item->id)
            ->assertJsonPath('item.sku', 'FOOD-TEST-002')
            ->assertJsonPath('item.name', 'Test Cat Food');
    }

    public function test_can_update_inventory_item(): void
    {
        $item = InventoryItem::create([
            'sku' => 'FOOD-TEST-003',
            'name' => 'Original Name',
            'category' => 'Food',
            'price' => 400,
            'stock' => 15,
            'reorder_level' => 8,
            'status' => 'active',
        ]);

        // Non-stock fields update directly; stock increases go through
        // batch receiving (stock 15 + 5 = 20).
        $response = $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'name' => 'Updated Name',
                'price' => 450,
                'category' => 'Food',
            ]);

        $response->assertStatus(200);

        $batchResponse = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/items/{$item->id}/batches", [
                'batch_no' => 'B-UPD-001',
                'received_date' => now()->toDateString(),
                'expiration_date' => now()->addMonths(6)->toDateString(),
                'quantity' => 5,
            ]);

        $batchResponse->assertOk();

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'name' => 'Updated Name',
            'price' => 450,
            'stock' => 20,
        ]);
    }

    public function test_can_delete_inventory_item_with_zero_stock(): void
    {
        // Production behavior: DELETE is a soft-delete (archive), not a hard-delete.
        // Items with zero stock can be archived successfully.
        $item = InventoryItem::create([
            'sku' => 'FOOD-TEST-004',
            'barcode' => 'FOODTEST004',
            'name' => 'To Be Deleted',
            'category' => 'Food',
            'price' => 200,
            'stock' => 0,
            'reorder_level' => 3,
            'status' => 'active',
        ]);

        $response = $this->actingAs($this->admin)
            ->deleteJson("/api/admin/inventory/items/{$item->id}");

        $response->assertStatus(200);

        // Item is archived (soft-deleted), not removed from the database
        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
        ]);
        $this->assertNotNull($item->fresh()->archived_at);
    }

    public function test_cannot_delete_item_with_stock_must_archive_instead(): void
    {
        // Production rule: items with stock > 0 cannot be archived/deleted
        // until stock is adjusted to 0. This prevents accidental data loss.
        $item = InventoryItem::create([
            'sku' => 'FOOD-TEST-005',
            'barcode' => 'FOODTEST005',
            'name' => 'Has Stock',
            'category' => 'Food',
            'price' => 200,
            'stock' => 5,
            'reorder_level' => 3,
            'status' => 'active',
        ]);

        // Delete/archive should be rejected because stock > 0
        $response = $this->actingAs($this->admin)
            ->deleteJson("/api/admin/inventory/items/{$item->id}");

        $response->assertStatus(422);

        // Item should still exist and not be archived
        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
        ]);
        $this->assertNull($item->fresh()->archived_at);

        // After setting stock to 0, archive should work
        $item->update(['stock' => 0]);
        $archiveResponse = $this->actingAs($this->admin)
            ->patchJson("/api/inventory/items/{$item->id}/archive", [
                'reason' => 'Discontinued product',
            ]);

        $archiveResponse->assertStatus(200);
        $this->assertNotNull($item->fresh()->archived_at);
    }

    public function test_can_list_all_inventory_items(): void
    {
        InventoryItem::create(['sku' => 'A1', 'name' => 'Item A', 'category' => 'Food', 'price' => 100, 'stock' => 10, 'reorder_level' => 5, 'status' => 'active']);
        InventoryItem::create(['sku' => 'A2', 'name' => 'Item B', 'category' => 'Toys', 'price' => 200, 'stock' => 20, 'reorder_level' => 10, 'status' => 'active']);
        InventoryItem::create(['sku' => 'A3', 'name' => 'Item C', 'category' => 'Health', 'price' => 300, 'stock' => 30, 'reorder_level' => 15, 'status' => 'active']);

        $response = $this->actingAs($this->admin)
            ->getJson('/api/admin/inventory/items');

        $response->assertStatus(200)
            ->assertJsonCount(3, 'items');
    }

    // ============================================
    // CATEGORY VALIDATION (P0.2 Fix)
    // ============================================

    public function test_invalid_category_gets_corrected_to_accessories(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'FOOD-INVALID-CAT',
                'barcode' => 'FOODINVCAT01',
                'name' => 'Test Item Invalid Category',
                'category' => 'InvalidCategory', // Invalid category
                'price' => 500,
                'stock' => 10,
                'reorder_level' => 5,
                'status' => 'active',
            ]);

        $response->assertStatus(201);

        // Model validation should correct this to 'Accessories'
        $this->assertDatabaseHas('inventory_items', [
            'sku' => 'FOOD-INVALID-CAT',
            'category' => 'Accessories', // Auto-corrected
        ]);
    }

    public function test_all_valid_categories_accepted(): void
    {
        $validCategories = ['Food', 'Accessories', 'Grooming', 'Toys', 'Health', 'Services'];
        
        foreach ($validCategories as $category) {
            $sku = 'TEST-CAT-' . strtoupper(substr($category, 0, 3)) . rand(100, 999);
            $barcode = 'TESTCAT' . strtoupper(substr($category, 0, 3)) . rand(100, 999);

            $response = $this->actingAs($this->admin)
                ->postJson('/api/admin/inventory/items', [
                    'sku' => $sku,
                    'barcode' => $barcode,
                    'name' => "Test {$category} Item",
                    'category' => $category,
                    'price' => 100,
                    'stock' => 10,
                    'reorder_level' => 5,
                    'status' => 'active',
                ]);

            $response->assertStatus(201);
            
            $this->assertDatabaseHas('inventory_items', [
                'sku' => $sku,
                'category' => $category,
            ]);
        }
    }

    // ============================================
    // FIELD NAME HANDLING (P0.3 Fix)
    // ============================================

    public function test_can_create_with_quantity_field(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'QUANTITY-TEST',
                'barcode' => 'QTYTEST001',
                'name' => 'Test Quantity Field',
                'category' => 'Food',
                'price' => 500,
                'quantity' => 25, // Using 'quantity' instead of 'stock'
                'reorder_level' => 5,
                'status' => 'active',
            ]);

        $response->assertStatus(201);

        // Should be stored as stock
        $this->assertDatabaseHas('inventory_items', [
            'sku' => 'QUANTITY-TEST',
            'stock' => 25,
        ]);
    }

    public function test_can_update_with_quantity_field(): void
    {
        $item = InventoryItem::create([
            'sku' => 'UPDATE-QTY-TEST',
            'name' => 'Update Test',
            'category' => 'Food',
            'price' => 400,
            'stock' => 15,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        // 'quantity' is a stock-mutation field: product updates now reject it
        // outright. Decreases go through the stock adjustment endpoint.
        $response = $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'quantity' => 10, // Using 'quantity' instead of 'stock'
            ]);

        $response->assertStatus(422);

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 15,
        ]);

        $adjustResponse = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/{$item->id}/adjust-stock", [
                'type' => 'remove',
                'quantity' => 5,
                'reason' => 'Test decrement',
            ]);

        $adjustResponse->assertOk();

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 10,
        ]);

        $batchResponse = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/items/{$item->id}/batches", [
                'batch_no' => 'B-QTY-001',
                'received_date' => now()->toDateString(),
                'expiration_date' => now()->addMonths(6)->toDateString(),
                'quantity' => 25,
            ]);

        $batchResponse->assertOk();

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 35,
        ]);
    }

    // ============================================
    // STOCK ADDITION BEHAVIOR (50 + 25 = 75)
    // ============================================

    public function test_add_stock_true_increments_existing_stock(): void
    {
        $item = InventoryItem::create([
            'sku' => 'ADD-STOCK-TEST',
            'name' => 'Stock Addition Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 50,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Direct updates can no longer raise stock — increases go through
        // batch receiving. Add 25 to existing 50 = 75.
        $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'stock' => 25,
                'add_stock' => true,
            ])
            ->assertStatus(422);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/items/{$item->id}/batches", [
                'batch_no' => 'B-ADD-001',
                'received_date' => now()->toDateString(),
                'expiration_date' => now()->addMonths(6)->toDateString(),
                'quantity' => 25,
            ]);

        $response->assertOk();

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 75, // 50 + 25 = 75
        ]);

        // Verify inventory log — batch receiving records a restock entry
        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'delta' => 25,
            'reason' => 'Stock received',
            'reference_type' => 'restock',
        ]);
    }

    public function test_expired_item_stock_replaced_through_dedicated_workflow(): void
    {
        $item = InventoryItem::create([
            'sku' => 'EXPIRED-STOCK-TEST',
            'name' => 'Expired Item Stock Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 50,
            'reorder_level' => 10,
            'status' => 'active',
            'expiry_date' => now()->subDays(5), // Expired 5 days ago
        ]);

        $expiredBatch = $item->batches()->create([
            'batch_no' => 'B-EXPIRED-001',
            'received_date' => now()->subMonths(6)->toDateString(),
            'expiration_date' => now()->subDays(5)->toDateString(),
            'quantity' => 50,
            'remaining_quantity' => 50,
            'status' => 'expired',
        ]);

        // Product updates can no longer carry stock fields — even for expired
        // items. Replacement is done through the dedicated stock workflow.
        $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'stock' => 25,
                'add_stock' => true,
            ])
            ->assertStatus(422);

        // Step 1: dispose the expired batch — the batch row is preserved as
        // 'disposed' and the write-off is logged.
        $disposeResponse = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/batches/{$expiredBatch->id}/dispose", [
                'reason' => 'Expired',
            ]);

        $disposeResponse->assertOk();

        $this->assertDatabaseHas('inventory_batches', [
            'id' => $expiredBatch->id,
            'status' => 'disposed',
            'remaining_quantity' => 0,
        ]);

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 0,
        ]);

        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'movement_type' => 'batch_disposal',
            'delta' => -50,
        ]);

        // Step 2: receive the replacement stock as a new batch.
        $receiveResponse = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/items/{$item->id}/batches", [
                'batch_no' => 'B-REPLACE-001',
                'received_date' => now()->toDateString(),
                'expiration_date' => now()->addMonths(6)->toDateString(),
                'quantity' => 25,
            ]);

        $receiveResponse->assertOk();

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 25,
        ]);

        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'movement_type' => 'batch_restock',
            'delta' => 25,
        ]);
    }

    public function test_replace_stock_without_add_flag(): void
    {
        $item = InventoryItem::create([
            'sku' => 'REPLACE-STOCK-TEST',
            'name' => 'Stock Replacement Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 50,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Stock fields are prohibited on product updates — 422, stock stays 50.
        $response = $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'stock' => 25,
            ]);

        $response->assertStatus(422);

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 50,
        ]);
    }

    public function test_no_expiry_item_always_adds_stock(): void
    {
        // Item WITHOUT expiry date - should ADD stock even if expired logic would apply
        $item = InventoryItem::create([
            'sku' => 'NO-EXPIRY-ADD-TEST',
            'name' => 'Accessory No Expiry',
            'category' => 'Accessories', // Non-perishable
            'price' => 350,
            'stock' => 50,
            'reorder_level' => 10,
            'status' => 'active',
            'expiry_date' => null, // NO expiry date
        ]);

        // Item without expiry still receives stock through batch receiving
        // (50 + 25 = 75); direct increases are rejected.
        $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'stock' => 25,
                'add_stock' => true,
            ])
            ->assertStatus(422);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/admin/inventory/items/{$item->id}/batches", [
                'batch_no' => 'B-NOEXP-001',
                'received_date' => now()->toDateString(),
                'expiration_date' => now()->addMonths(6)->toDateString(),
                'quantity' => 25,
            ]);

        $response->assertOk();

        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 75, // 50 + 25 = 75
        ]);
    }

    // ============================================
    // DATA CONSTRAINTS (P0.5 Fix)
    // ============================================

    public function test_negative_stock_gets_corrected(): void
    {
        $item = InventoryItem::create([
            'sku' => 'NEG-STOCK-TEST',
            'name' => 'Negative Stock Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        // Simulate a manual update with negative value
        $item->stock = -5;
        $item->save();

        // Model validation should correct to 0
        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'stock' => 0,
        ]);
    }

    public function test_negative_price_gets_corrected(): void
    {
        $item = InventoryItem::create([
            'sku' => 'NEG-PRICE-TEST',
            'name' => 'Negative Price Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $item->price = -100;
        $item->save();

        // Model validation should correct to 0
        $this->assertDatabaseHas('inventory_items', [
            'id' => $item->id,
            'price' => 0,
        ]);
    }

    public function test_empty_sku_gets_auto_generated(): void
    {
        $item = InventoryItem::create([
            'sku' => '',
            'name' => 'Auto SKU Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $this->assertNotNull($item->fresh()->sku);
        $this->assertNotEmpty($item->fresh()->sku);
    }

    // ============================================
    // LOW STOCK ALERTS
    // ============================================

    public function test_low_stock_items_returned(): void
    {
        // Normal stock item
        InventoryItem::create([
            'sku' => 'NORMAL-001',
            'name' => 'Normal Stock',
            'category' => 'Food',
            'price' => 500,
            'stock' => 100,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Low stock item
        InventoryItem::create([
            'sku' => 'LOW-001',
            'name' => 'Low Stock Item',
            'category' => 'Food',
            'price' => 500,
            'stock' => 3,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        // Out of stock item
        InventoryItem::create([
            'sku' => 'OUT-001',
            'name' => 'Out of Stock',
            'category' => 'Food',
            'price' => 500,
            'stock' => 0,
            'reorder_level' => 10,
            'status' => 'active',
        ]);

        $lowStock = InventoryItem::whereColumn('stock', '<=', 'reorder_level')
            ->where('stock', '>', 0)
            ->get();

        $this->assertCount(1, $lowStock);
        $this->assertEquals('LOW-001', $lowStock->first()->sku);
    }

    // ============================================
    // INVENTORY LOGS
    // ============================================

    public function test_stock_changes_are_logged(): void
    {
        $item = InventoryItem::create([
            'sku' => 'LOG-TEST-001',
            'name' => 'Log Test',
            'category' => 'Food',
            'price' => 500,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $initialLogCount = InventoryLog::where('inventory_item_id', $item->id)->count();
        $this->assertEquals(1, $initialLogCount); // Initial stock log

        // Update stock
        $item->updateStock(5, 'Restock from supplier');

        $finalLogCount = InventoryLog::where('inventory_item_id', $item->id)->count();
        $this->assertEquals(2, $finalLogCount);

        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'delta' => 5,
            'reason' => 'Restock from supplier',
        ]);
    }

    public function test_initial_stock_is_logged(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'INITIAL-LOG-TEST',
                'barcode' => 'INITLOG001',
                'name' => 'Initial Log Test',
                'category' => 'Food',
                'price' => 500,
                'stock' => 50,
                'reorder_level' => 10,
                'status' => 'active',
            ]);

        $response->assertStatus(201);

        $item = InventoryItem::where('sku', 'INITIAL-LOG-TEST')->first();

        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'delta' => 50,
            'reason' => 'Initial stock',
        ]);
    }

    // ============================================
    // FILTERING AND SEARCH
    // ============================================

    public function test_can_filter_by_category(): void
    {
        InventoryItem::create(['sku' => 'F1', 'name' => 'Food 1', 'category' => 'Food', 'price' => 100, 'stock' => 10, 'reorder_level' => 5, 'status' => 'active']);
        InventoryItem::create(['sku' => 'F2', 'name' => 'Food 2', 'category' => 'Food', 'price' => 200, 'stock' => 20, 'reorder_level' => 10, 'status' => 'active']);
        InventoryItem::create(['sku' => 'T1', 'name' => 'Toy 1', 'category' => 'Toys', 'price' => 150, 'stock' => 15, 'reorder_level' => 8, 'status' => 'active']);

        $foodItems = InventoryItem::where('category', 'Food')->get();
        $this->assertCount(2, $foodItems);

        $toyItems = InventoryItem::where('category', 'Toys')->get();
        $this->assertCount(1, $toyItems);
    }

    public function test_can_filter_by_status(): void
    {
        InventoryItem::create(['sku' => 'ACT1', 'name' => 'Active Item', 'category' => 'Food', 'price' => 100, 'stock' => 10, 'reorder_level' => 5, 'status' => 'active']);
        InventoryItem::create(['sku' => 'INA1', 'name' => 'Inactive Item', 'category' => 'Food', 'price' => 200, 'stock' => 5, 'reorder_level' => 3, 'status' => 'inactive']);
        InventoryItem::create(['sku' => 'DIS1', 'name' => 'Discontinued Item', 'category' => 'Food', 'price' => 150, 'stock' => 0, 'reorder_level' => 0, 'status' => 'discontinued']);

        $activeItems = InventoryItem::where('status', 'active')->get();
        $this->assertCount(1, $activeItems);

        $inactiveItems = InventoryItem::where('status', 'inactive')->get();
        $this->assertCount(1, $inactiveItems);
    }

    public function test_can_search_by_name(): void
    {
        InventoryItem::create(['sku' => 'S1', 'name' => 'Premium Dog Food', 'category' => 'Food', 'price' => 100, 'stock' => 10, 'reorder_level' => 5, 'status' => 'active']);
        InventoryItem::create(['sku' => 'S2', 'name' => 'Premium Cat Food', 'category' => 'Food', 'price' => 200, 'stock' => 20, 'reorder_level' => 10, 'status' => 'active']);
        InventoryItem::create(['sku' => 'S3', 'name' => 'Basic Dog Toy', 'category' => 'Toys', 'price' => 150, 'stock' => 15, 'reorder_level' => 8, 'status' => 'active']);

        $results = InventoryItem::where('name', 'like', '%Premium%')->get();
        $this->assertCount(2, $results);

        $results = InventoryItem::where('name', 'like', '%Dog%')->get();
        $this->assertCount(2, $results);
    }

    // ============================================
    // VALIDATION ERRORS
    // ============================================

    public function test_required_fields_validated(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                // Missing required fields: sku, name, category, price
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['sku', 'name', 'category', 'price']);
    }

    public function test_duplicate_sku_rejected(): void
    {
        InventoryItem::create([
            'sku' => 'DUPLICATE-SKU',
            'name' => 'First Item',
            'category' => 'Food',
            'price' => 500,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'DUPLICATE-SKU', // Same SKU
                'name' => 'Second Item',
                'category' => 'Food',
                'price' => 600,
                'stock' => 15,
                'reorder_level' => 5,
                'status' => 'active',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['sku']);
    }

    public function test_price_must_be_numeric(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'PRICE-TEST',
                'name' => 'Price Test',
                'category' => 'Food',
                'price' => 'not-a-number',
                'stock' => 10,
                'reorder_level' => 5,
                'status' => 'active',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['price']);
    }

    // ============================================
    // ZERO-STOCK PRODUCT CREATION
    // ============================================

    public function test_can_create_product_with_zero_stock(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'ZERO-STOCK-001',
                'barcode' => 'ZEROSTOCK001',
                'name' => 'Catalog Only Product',
                'category' => 'Accessories',
                'price' => 350,
                'stock' => 0,
                'reorder_level' => 5,
                'status' => 'active',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('item.sku', 'ZERO-STOCK-001');

        $item = InventoryItem::where('sku', 'ZERO-STOCK-001')->firstOrFail();

        $this->assertSame(0, (int) $item->stock);
        $this->assertSame(0, $item->batches()->count());

        // A catalog-only product must not fabricate an opening-stock movement.
        $this->assertSame(0, InventoryLog::where('inventory_item_id', $item->id)->count());
    }

    public function test_can_create_product_without_stock_field(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/inventory/items', [
                'sku' => 'ZERO-STOCK-002',
                'barcode' => 'ZEROSTOCK002',
                'name' => 'No Stock Field Product',
                'category' => 'Accessories',
                'price' => 350,
                'reorder_level' => 5,
                'status' => 'active',
            ]);

        $response->assertStatus(201);

        $item = InventoryItem::where('sku', 'ZERO-STOCK-002')->firstOrFail();

        $this->assertSame(0, (int) $item->stock);
        $this->assertSame(0, $item->batches()->count());
        $this->assertSame(0, InventoryLog::where('inventory_item_id', $item->id)->count());
    }

    // ============================================
    // PRODUCT UPDATES CANNOT MOVE STOCK
    // ============================================

    public function test_product_update_rejects_all_stock_fields(): void
    {
        foreach (['stock', 'quantity', 'stock_quantity', 'add_stock'] as $field) {
            $item = InventoryItem::create([
                'sku' => 'NO-STOCK-UPD-' . strtoupper($field),
                'name' => 'Stock Field Probe ' . $field,
                'category' => 'Food',
                'price' => 400,
                'stock' => 15,
                'reorder_level' => 5,
                'status' => 'active',
            ]);

            $value = $field === 'add_stock' ? true : 10;

            $response = $this->actingAs($this->admin)
                ->putJson("/api/admin/inventory/items/{$item->id}", [
                    $field => $value,
                ]);

            $response->assertStatus(422)
                ->assertJsonValidationErrors(['stock']);

            // Nothing may move: stock, batches and logs all stay untouched.
            $this->assertSame(15, (int) $item->fresh()->stock);
            $this->assertSame(0, InventoryLog::where('inventory_item_id', $item->id)
                ->where('movement_type', '!=', 'initial_stock')
                ->count());
        }
    }

    public function test_product_update_rejects_stock_even_with_other_changes(): void
    {
        $item = InventoryItem::create([
            'sku' => 'NO-PARTIAL-WRITE',
            'name' => 'Original Name',
            'category' => 'Food',
            'price' => 400,
            'stock' => 15,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        // A payload mixing a valid product change with a prohibited stock
        // field must fail entirely — no partial product write either.
        $response = $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'name' => 'Renamed',
                'stock' => 10,
            ]);

        $response->assertStatus(422);

        $fresh = $item->fresh();
        $this->assertSame('Original Name', $fresh->name);
        $this->assertSame(15, (int) $fresh->stock);
    }

    public function test_product_update_leaves_stock_and_logs_untouched(): void
    {
        $item = InventoryItem::create([
            'sku' => 'EDIT-NO-STOCK',
            'name' => 'Before Edit',
            'category' => 'Food',
            'price' => 400,
            'stock' => 15,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $logCountBefore = InventoryLog::where('inventory_item_id', $item->id)->count();

        $response = $this->actingAs($this->admin)
            ->putJson("/api/admin/inventory/items/{$item->id}", [
                'name' => 'After Edit',
                'description' => 'Updated description',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('stock_action', 'unchanged')
            ->assertJsonPath('new_stock', 15);

        $fresh = $item->fresh();
        $this->assertSame('After Edit', $fresh->name);
        $this->assertSame(15, (int) $fresh->stock);
        $this->assertSame(
            $logCountBefore,
            InventoryLog::where('inventory_item_id', $item->id)->count()
        );
    }
}
