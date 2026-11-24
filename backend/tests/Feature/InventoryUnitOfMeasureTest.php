<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\InventoryStockRequest;
use App\Models\User;
use App\Services\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Units-of-measure coverage (panel §8.3, revision FR-01).
 *
 * Items may declare a base `unit` label plus `pack_size`/`box_size`
 * (base units per packaging unit). Stock In / Stock Out accept a per-line
 * `unit` of base|pack|box and always persist BASE-unit quantities — batches,
 * stock counters, ledger deltas and approval-queue payloads included.
 */
class InventoryUnitOfMeasureTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('uom-test')->plainTextToken];
    }

    private function item(int $stock = 100, array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'UOM-' . uniqid(),
            'name' => 'UOM Test Item',
            'category' => 'Accessories',
            'price' => 100,
            'stock' => $stock,
            'reorder_level' => 5,
            'status' => 'active',
            'is_sellable' => false,
            'issue_method' => 'FIFO',
        ], $overrides));
    }

    private function packedItem(int $stock = 100): InventoryItem
    {
        return $this->item($stock, [
            'name' => 'Packed Item',
            'unit' => 'piece',
            'pack_size' => 12,
            'box_size' => 24,
        ]);
    }

    public function test_item_persists_uom_fields_and_options(): void
    {
        $service = new InventoryService();
        $result = $service->createItem([
            'name' => 'UOM Persist',
            'sku' => null,
            'category' => 'Food',
            'price' => 10,
            'stock' => 0,
            'reorder_level' => 1,
            'unit' => 'tablet',
            'pack_size' => 10,
            'box_size' => 100,
        ]);

        $item = $result['item'];
        $this->assertSame('tablet', $item->unit);
        $this->assertSame(10, $item->pack_size);
        $this->assertSame(100, $item->box_size);

        $units = array_column($item->uomOptions(), 'unit');
        $this->assertSame(['base', 'pack', 'box'], $units);
    }

    public function test_pack_and_box_sizes_are_validated(): void
    {
        $service = new InventoryService();
        $base = [
            'name' => 'Bad UOM', 'sku' => null, 'category' => 'Food', 'price' => 10,
            'stock' => 0, 'reorder_level' => 1,
        ];

        try {
            $service->createItem($base + ['pack_size' => 1]);
            $this->fail('pack_size of 1 should be rejected');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('pack_size', $e->errors());
        }

        try {
            $service->createItem($base + ['name' => 'Bad UOM 2', 'pack_size' => 24, 'box_size' => 12]);
            $this->fail('box smaller than pack should be rejected');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('box_size', $e->errors());
        }
    }

    public function test_stock_in_pack_and_box_convert_to_base_units(): void
    {
        $staff = $this->user('inventory');
        $item = $this->packedItem(0);

        $res = $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'purchase',
            'items' => [
                ['inventory_item_id' => $item->id, 'quantity' => 2, 'unit' => 'pack'],
                ['inventory_item_id' => $item->id, 'quantity' => 1, 'unit' => 'box'],
            ],
        ], $this->headers($staff));

        $res->assertStatus(201);
        // 2 packs (24) + 1 box (24) = 48 base units
        $this->assertSame(48, $item->fresh()->stock);

        $log = InventoryLog::where('inventory_item_id', $item->id)
            ->where('movement_type', 'stock_in')->latest('id')->first();
        $details = json_decode($log->details, true);
        $this->assertSame(24, $details['uom']['base_quantity']);
        $this->assertSame('box', $details['uom']['unit']);
        $this->assertSame(1, $details['uom']['entered_quantity']);
    }

    public function test_stock_in_rejects_unconfigured_or_unknown_units(): void
    {
        $staff = $this->user('inventory');
        $plain = $this->item(0); // no pack/box configured
        $packed = $this->packedItem(0);

        // 'pack' on an item without pack_size → 422
        $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'purchase',
            'items' => [['inventory_item_id' => $plain->id, 'quantity' => 1, 'unit' => 'pack']],
        ], $this->headers($staff))->assertStatus(422);

        // unknown unit token → 422 at request validation
        $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'purchase',
            'items' => [['inventory_item_id' => $packed->id, 'quantity' => 1, 'unit' => 'carton']],
        ], $this->headers($staff))->assertStatus(422);

        $this->assertSame(0, $plain->fresh()->stock);
        $this->assertSame(0, $packed->fresh()->stock);
    }

    public function test_stock_out_pack_executes_immediately_in_base_units(): void
    {
        $staff = $this->user('inventory');
        $item = $this->packedItem(48); // exactly 2 boxes

        // service_consumption is a non-approval reason → immediate deduction.
        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'Grooming appointment #1',
            'items' => [
                ['inventory_item_id' => $item->id, 'quantity' => 1, 'unit' => 'box'],
            ],
        ], $this->headers($staff));

        $res->assertStatus(201)->assertJsonPath('queued', false);
        $this->assertSame(24, $item->fresh()->stock);

        $log = InventoryLog::where('inventory_item_id', $item->id)
            ->where('movement_type', 'stock_out')->latest('id')->first();
        $this->assertSame(-24, (int) $log->delta);
        $details = json_decode($log->details, true);
        $this->assertSame(24, $details['line']['base_quantity']);
        $this->assertSame('box', $details['line']['unit']);
    }

    public function test_stock_out_approval_queue_stores_base_quantity(): void
    {
        $staff = $this->user('inventory');
        $item = $this->packedItem(48);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Water damaged packs',
            'items' => [
                ['inventory_item_id' => $item->id, 'quantity' => 1, 'unit' => 'box'],
            ],
        ], $this->headers($staff));

        $res->assertStatus(202)->assertJsonPath('queued', true);
        // Stock untouched while pending; queued quantity is BASE units (24).
        $this->assertSame(48, $item->fresh()->stock);
        $request = InventoryStockRequest::latest('id')->first();
        $this->assertSame(24, (int) $request->items()->first()->quantity);
        $this->assertSame(24, $request->items()->first()->line_details['base_quantity']);
    }

    public function test_stock_out_rejects_pack_quantity_exceeding_base_stock(): void
    {
        $staff = $this->user('inventory');
        $item = $this->packedItem(24); // 1 box only

        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Test',
            'items' => [
                ['inventory_item_id' => $item->id, 'quantity' => 2, 'unit' => 'box'], // 48 > 24
            ],
        ], $this->headers($staff))->assertStatus(422);

        $this->assertSame(24, $item->fresh()->stock);
    }

    public function test_base_unit_remains_default_and_backward_compatible(): void
    {
        $staff = $this->user('inventory');
        $item = $this->packedItem(10);

        $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'purchase',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 5]], // no unit → base
        ], $this->headers($staff))->assertStatus(201);

        $this->assertSame(15, $item->fresh()->stock);
    }

    public function test_item_search_exposes_uom_options(): void
    {
        $staff = $this->user('inventory');
        $this->packedItem(5);

        $res = $this->getJson('/api/inventory/items/search?q=Packed', $this->headers($staff));
        $res->assertStatus(200);
        $item = collect($res->json('items'))->firstWhere('name', 'Packed Item');
        $this->assertNotNull($item);
        $this->assertSame(12, $item['pack_size']);
        $this->assertSame(24, $item['box_size']);
        $this->assertContains('pack', array_column($item['uom_options'], 'unit'));
    }
}
