<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\User;
use App\Services\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Barcode integration feature tests (Phase 26 test matrix).
 *
 * Covers:
 *  - barcode lookup: valid, unknown, whitespace normalization, archived,
 *    non-sellable, out-of-stock
 *  - role authorization: cashier/inventory/admin allowed; customer rejected;
 *    unauthenticated rejected
 *  - duplicate barcode rejection at the service layer
 *  - scan does NOT deduct stock (lookup leaves inventory_logs untouched)
 *  - successful POS checkout deducts stock exactly once and logs once
 *  - concurrent checkout with stock=1: only one succeeds, final stock=0
 */
class BarcodeLookupTest extends TestCase
{
    use RefreshDatabase;

    protected $cashier;
    protected $inventoryManager;
    protected $admin;
    protected $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->cashier = User::factory()->create(['role' => 'cashier']);
        $this->inventoryManager = User::factory()->create(['role' => 'inventory']);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->customer = User::factory()->create(['role' => 'customer']);
    }

    protected function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test-token')->plainTextToken];
    }

    protected function makeItem(array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'TEST-' . strtoupper(uniqid()),
            'name' => 'Test Product ' . uniqid(),
            'category' => 'Food',
            'price' => 100,
            'stock' => 10,
            'reorder_level' => 5,
            'status' => 'active',
            'is_sellable' => true,
        ], $overrides));
    }

    /* ----------------------------------------------------------------
     * Barcode lookup — happy path + safety
     * ---------------------------------------------------------------- */

    public function test_lookup_valid_barcode_returns_item(): void
    {
        $item = $this->makeItem(['barcode' => '8938501234567']);

        $response = $this->withExceptionHandling()
            ->getJson('/api/products/barcode/8938501234567', $this->authHeaders($this->cashier));

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('item.id', $item->id)
            ->assertJsonPath('item.barcode', '8938501234567')
            ->assertJsonPath('item.is_sellable', true);
    }

    public function test_lookup_unknown_barcode_returns_404(): void
    {
        $response = $this->getJson('/api/products/barcode/NOPE9999', $this->authHeaders($this->cashier));

        $response->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    public function test_lookup_normalizes_whitespace_and_newline(): void
    {
        $item = $this->makeItem(['barcode' => '8938501234567']);

        // Trailing space + newline (typical HID scanner suffix) must resolve
        // to the same item as the clean barcode.
        $response = $this->getJson('/api/products/barcode/' . rawurlencode(" 8938501234567 \n"), $this->authHeaders($this->cashier));

        $response->assertStatus(200)
            ->assertJsonPath('item.id', $item->id);
    }

    public function test_lookup_excludes_archived_item(): void
    {
        $item = $this->makeItem([
            'barcode' => 'ARCHIVED001',
            'status' => 'active',
            'archived_at' => now(),
            'archived_by' => $this->admin->id,
        ]);

        $response = $this->getJson('/api/products/barcode/ARCHIVED001', $this->authHeaders($this->cashier));

        $response->assertStatus(404);
    }

    public function test_lookup_reports_non_sellable_item_so_pos_can_block(): void
    {
        $item = $this->makeItem(['barcode' => 'NOTSELLABLE1', 'is_sellable' => false]);

        // Non-sellable items are still returned (so the POS can show a clear
        // "not available for POS sale" message) but sellable=false is exposed.
        $response = $this->getJson('/api/products/barcode/NOTSELLABLE1', $this->authHeaders($this->cashier));

        $response->assertStatus(200)
            ->assertJsonPath('item.is_sellable', false);
    }

    public function test_lookup_reports_out_of_stock_item_so_pos_can_block(): void
    {
        $item = $this->makeItem(['barcode' => 'OOS0000001', 'stock' => 0]);

        $response = $this->getJson('/api/products/barcode/OOS0000001', $this->authHeaders($this->cashier));

        $response->assertStatus(200)
            ->assertJsonPath('item.stock', 0)
            ->assertJsonPath('item.in_stock', false);
    }

    /* ----------------------------------------------------------------
     * Role authorization
     * ---------------------------------------------------------------- */

    public function test_lookup_rejects_unauthenticated_request(): void
    {
        $response = $this->getJson('/api/products/barcode/ANYBARCODE');
        $response->assertStatus(401);
    }

    public function test_lookup_rejects_customer_role(): void
    {
        $this->makeItem(['barcode' => 'CUSTBLOCK01']);

        $response = $this->getJson('/api/products/barcode/CUSTBLOCK01', $this->authHeaders($this->customer));

        $response->assertStatus(403);
    }

    public function test_lookup_allows_inventory_manager(): void
    {
        $item = $this->makeItem(['barcode' => 'INVMGR00001']);

        $response = $this->getJson('/api/products/barcode/INVMGR00001', $this->authHeaders($this->inventoryManager));

        $response->assertStatus(200)
            ->assertJsonPath('item.id', $item->id);
    }

    public function test_lookup_allows_admin(): void
    {
        $item = $this->makeItem(['barcode' => 'ADMIN0000001']);

        $response = $this->getJson('/api/products/barcode/ADMIN0000001', $this->authHeaders($this->admin));

        $response->assertStatus(200)
            ->assertJsonPath('item.id', $item->id);
    }

    /* ----------------------------------------------------------------
     * Duplicate barcode rejection (service layer)
     * ---------------------------------------------------------------- */

    public function test_create_item_rejects_duplicate_barcode(): void
    {
        $service = new InventoryService();

        $service->createItem([
            'name' => 'First Item',
            'sku' => 'FIRST-001',
            'barcode' => 'DUP000000001',
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);

        $this->expectException(ValidationException::class);

        $service->createItem([
            'name' => 'Second Item',
            'sku' => 'SECOND-002',
            'barcode' => 'DUP000000001',
            'category' => 'Toys',
            'price' => 75,
            'stock' => 3,
            'reorder_level' => 1,
            'status' => 'active',
        ]);
    }

    public function test_create_item_normalizes_and_allows_blank_barcode_for_non_sellable(): void
    {
        $service = new InventoryService();

        // Non-sellable items can have blank barcodes. Whitespace-only barcode
        // becomes null, so multiple unbarcoded non-sellable items do not
        // collide on the unique index.
        $first = $service->createItem([
            'name' => 'Unbarcoded A',
            'sku' => 'NOBAR-A',
            'barcode' => '   ',
            'is_sellable' => false,
            'category' => 'Food',
            'price' => 50,
            'stock' => 1,
            'reorder_level' => 1,
            'status' => 'active',
        ]);

        $second = $service->createItem([
            'name' => 'Unbarcoded B',
            'sku' => 'NOBAR-B',
            'barcode' => '',
            'is_sellable' => false,
            'category' => 'Food',
            'price' => 50,
            'stock' => 1,
            'reorder_level' => 1,
            'status' => 'active',
        ]);

        $this->assertNull($first['item']->barcode);
        $this->assertNull($second['item']->barcode);
    }

    /* ----------------------------------------------------------------
     * Barcode required for sellable items
     * ---------------------------------------------------------------- */

    public function test_create_sellable_item_without_barcode_is_rejected(): void
    {
        $service = new InventoryService();

        $this->expectException(ValidationException::class);

        // is_sellable defaults to true, so omitting barcode should fail
        $service->createItem([
            'name' => 'Sellable No Barcode',
            'sku' => 'SELLNOBAR-1',
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);
    }

    public function test_create_non_sellable_item_without_barcode_is_allowed(): void
    {
        $service = new InventoryService();

        $result = $service->createItem([
            'name' => 'Non-Sellable No Barcode',
            'sku' => 'NONSELLNOBAR-1',
            'is_sellable' => false,
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);

        $this->assertNull($result['item']->barcode);
        $this->assertFalse((bool) $result['item']->is_sellable);
    }

    /* ----------------------------------------------------------------
     * Barcode format validation
     * ---------------------------------------------------------------- */

    public function test_create_item_rejects_barcode_with_spaces(): void
    {
        $service = new InventoryService();

        $this->expectException(ValidationException::class);

        $service->createItem([
            'name' => 'Space Barcode',
            'sku' => 'SPACEBAR-1',
            'barcode' => '123 456',
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);
    }

    public function test_create_item_allows_alphanumeric_barcode(): void
    {
        $service = new InventoryService();

        $result = $service->createItem([
            'name' => 'Alphanumeric Barcode',
            'sku' => 'ALPHABAR-1',
            'barcode' => 'RC-ADULT-001',
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);

        $this->assertSame('RC-ADULT-001', $result['item']->barcode);
    }

    /* ----------------------------------------------------------------
     * Duplicate barcode on UPDATE
     * ---------------------------------------------------------------- */

    public function test_update_item_rejects_duplicate_barcode(): void
    {
        $service = new InventoryService();

        $itemA = $service->createItem([
            'name' => 'Item A',
            'sku' => 'UPDUP-A',
            'barcode' => 'UPDDUP001',
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);

        $itemB = $service->createItem([
            'name' => 'Item B',
            'sku' => 'UPDUP-B',
            'barcode' => 'UPDDUP002',
            'category' => 'Toys',
            'price' => 75,
            'stock' => 3,
            'reorder_level' => 1,
            'status' => 'active',
        ]);

        // Try to update item B's barcode to item A's barcode
        $this->expectException(ValidationException::class);

        $service->updateItem($itemB['item']->id, [
            'barcode' => 'UPDDUP001',
        ]);
    }

    public function test_update_item_allows_changing_barcode_to_new_value(): void
    {
        $service = new InventoryService();

        $item = $service->createItem([
            'name' => 'Update Barcode Item',
            'sku' => 'UPDNEW-1',
            'barcode' => 'UPDNEW001',
            'category' => 'Food',
            'price' => 50,
            'stock' => 5,
            'reorder_level' => 2,
            'status' => 'active',
        ]);

        $result = $service->updateItem($item['item']->id, [
            'barcode' => 'UPDNEW002',
        ]);

        $this->assertSame('UPDNEW002', $result['item']->barcode);

        // Old barcode should no longer find the item
        $oldLookup = $this->getJson('/api/products/barcode/UPDNEW001', $this->authHeaders($this->cashier));
        $oldLookup->assertStatus(404);

        // New barcode should find the item
        $newLookup = $this->getJson('/api/products/barcode/UPDNEW002', $this->authHeaders($this->cashier));
        $newLookup->assertStatus(200)
            ->assertJsonPath('item.id', $item['item']->id);
    }

    /* ----------------------------------------------------------------
     * Archive item → barcode cannot be scanned
     * ---------------------------------------------------------------- */

    public function test_archived_item_barcode_cannot_be_scanned(): void
    {
        $item = $this->makeItem(['barcode' => 'ARCHTEST001', 'stock' => 0]);

        // Archive the item directly
        $item->update([
            'archived_at' => now(),
            'archived_by' => $this->admin->id,
        ]);

        $response = $this->getJson('/api/products/barcode/ARCHTEST001', $this->authHeaders($this->cashier));

        $response->assertStatus(404);
    }

    /* ----------------------------------------------------------------
     * History / Traceability
     * ---------------------------------------------------------------- */

    public function test_pos_sale_creates_traceable_history(): void
    {
        $item = $this->makeItem(['barcode' => 'HISTTEST01', 'stock' => 10, 'is_sellable' => true]);
        $stockBefore = (int) $item->stock;

        // Process a sale
        $response = $this->postJson('/api/cashier/pos/transaction', [
            'items' => [
                [
                    'item_type' => 'product',
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'quantity' => 3,
                    'unit_price' => $item->price,
                ],
            ],
            'payment_method' => 'cash',
            'cash_received' => 1000,
            'subtotal' => $item->price * 3,
            'tax' => 0,
            'discount' => 0,
            'total' => $item->price * 3,
        ], $this->authHeaders($this->cashier));

        $response->assertStatus(200)->assertJsonPath('success', true);
        $saleId = $response->json('transaction.id');

        // 1. Stock decreased correctly
        $this->assertSame($stockBefore - 3, (int) $item->fresh()->stock);

        // 2. Inventory log exists with correct fields
        $log = InventoryLog::where('inventory_item_id', $item->id)
            ->where('movement_type', 'pos_sale')
            ->latest('id')
            ->first();
        $this->assertNotNull($log, 'Inventory log must exist for POS sale.');
        $this->assertSame(3, (int) $log->quantity, 'Log quantity must match sold quantity.');
        $this->assertSame($stockBefore, (int) $log->stock_before, 'Log stock_before must be correct.');
        $this->assertSame($stockBefore - 3, (int) $log->stock_after, 'Log stock_after must be correct.');

        // 3. Sale record exists and can be traced to the item
        $this->assertDatabaseHas('sales', ['id' => $saleId]);
        $this->assertDatabaseHas('sale_items', [
            'sale_id' => $saleId,
            'product_id' => $item->id,
        ]);
    }

    /* ----------------------------------------------------------------
     * Scan does NOT deduct stock
     * ---------------------------------------------------------------- */

    public function test_scan_does_not_deduct_stock_or_create_log(): void
    {
        $item = $this->makeItem(['barcode' => 'NOSCANDEDUCT', 'stock' => 7]);
        $logsBefore = InventoryLog::where('inventory_item_id', $item->id)->count();

        $this->getJson('/api/products/barcode/NOSCANDEDUCT', $this->authHeaders($this->cashier));

        $this->assertSame(7, (int) $item->fresh()->stock, 'Stock must not change after a scan.');
        $this->assertSame($logsBefore, InventoryLog::where('inventory_item_id', $item->id)->count(), 'No inventory log must be created by a scan.');
    }

    /* ----------------------------------------------------------------
     * Checkout deducts stock exactly once and logs once
     * ---------------------------------------------------------------- */

    public function test_checkout_deducts_stock_once_and_creates_one_log(): void
    {
        $item = $this->makeItem(['barcode' => 'CHECKOUT001', 'stock' => 5, 'is_sellable' => true]);
        $logsBefore = InventoryLog::where('inventory_item_id', $item->id)->count();

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'items' => [
                [
                    'item_type' => 'product',
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'quantity' => 2,
                    'unit_price' => $item->price,
                ],
            ],
            'payment_method' => 'cash',
            'cash_received' => 1000,
            'subtotal' => 200,
            'tax' => 0,
            'discount' => 0,
            'total' => 200,
        ], $this->authHeaders($this->cashier));

        $response->assertStatus(200)->assertJsonPath('success', true);

        $this->assertSame(3, (int) $item->fresh()->stock, 'Stock must decrease by exactly the sold quantity.');
        $newLogs = InventoryLog::where('inventory_item_id', $item->id)->count() - $logsBefore;
        $this->assertSame(1, $newLogs, 'Exactly one inventory log must be created per deducted item.');
    }

    /* ----------------------------------------------------------------
     * Concurrent checkout: no negative stock
     * ---------------------------------------------------------------- */

    public function test_concurrent_checkout_cannot_create_negative_stock(): void
    {
        // Stock = 1. Two checkouts each request quantity = 1. Exactly one
        // must succeed; final stock must be 0, never -1.
        $item = $this->makeItem(['barcode' => 'RACE000000001', 'stock' => 1, 'is_sellable' => true]);

        $payload = fn () => [
            'items' => [
                [
                    'item_type' => 'product',
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'quantity' => 1,
                    'unit_price' => $item->price,
                ],
            ],
            'payment_method' => 'cash',
            'cash_received' => 500,
            'subtotal' => 100,
            'tax' => 0,
            'discount' => 0,
            'total' => 100,
        ];

        $headers = $this->authHeaders($this->cashier);

        // SQLite in-memory + sync queue means true parallelism isn't possible
        // in a single test process, but lockForUpdate + the stock check still
        // enforce the invariant sequentially: the second request must observe
        // stock=0 and fail safely.
        $first = $this->postJson('/api/cashier/pos/transaction', $payload(), $headers);
        $second = $this->postJson('/api/cashier/pos/transaction', $payload(), $headers);

        $this->assertSame(200, $first->status(), 'First checkout should succeed.');
        $this->assertNotSame(200, $second->status(), 'Second checkout should fail safely.');

        $this->assertSame(0, (int) $item->fresh()->stock, 'Final stock must be 0, never negative.');
        $this->assertGreaterThanOrEqual(0, (int) $item->fresh()->stock);
    }
}
