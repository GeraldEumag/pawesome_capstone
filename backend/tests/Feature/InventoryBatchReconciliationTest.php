<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\User;
use App\Services\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryBatchReconciliationTest extends TestCase
{
    use RefreshDatabase;

    protected User $cashier;
    protected User $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = User::factory()->create(['role' => 'cashier']);
        $this->inventory = User::factory()->create(['role' => 'inventory']);
    }

    private function cashierAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->cashier->createToken('test-token')->plainTextToken];
    }

    private function inventoryAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->inventory->createToken('inventory-test')->plainTextToken];
    }

    private function receiveBatch(InventoryItem $item, array $batch)
    {
        return $this->withHeaders($this->inventoryAuth())
            ->postJson("/api/inventory/items/{$item->id}/batches", $batch);
    }

    private function makeItem(array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'RECON-' . strtoupper(uniqid()),
            'name' => 'Recon Test Item',
            'category' => 'Health',
            'price' => 100,
            'stock' => 0,
            'reorder_level' => 1,
            'status' => 'active',
            'is_sellable' => true,
        ], $overrides));
    }

    private function posSell(InventoryItem $item, int $qty)
    {
        return $this->postJson('/api/cashier/pos/transaction', [
            'items' => [[
                'item_id' => $item->id,
                'item_type' => 'product',
                'item_name' => $item->name,
                'quantity' => $qty,
                'unit_price' => $item->price,
            ]],
            'payment_method' => 'cash',
            'cash_received' => 100000,
        ], $this->cashierAuth());
    }

    public function test_inventory_receiving_creates_distinct_batches_and_fifo_deducts_oldest_received_stock(): void
    {
        $item = $this->makeItem([
            'category' => 'Accessories',
            'requires_expiry_tracking' => false,
            'issue_method' => 'FIFO',
        ]);
        $receivedEarlier = now()->subDays(3)->toDateString();
        $receivedLater = now()->subDay()->toDateString();

        $this->receiveBatch($item, [
            'batch_no' => 'LOT-EARLY',
            'received_date' => $receivedEarlier,
            'quantity' => 5,
            'supplier' => 'Supplier A',
            'unit_cost' => 5.25,
        ])->assertOk();
        $this->receiveBatch($item, [
            'batch_no' => 'LOT-LATE',
            'received_date' => $receivedLater,
            'quantity' => 3,
            'supplier' => 'Supplier B',
            'unit_cost' => 5.75,
        ])->assertOk();

        $item->refresh();
        $this->assertSame(8, (int) $item->stock);
        $this->assertSame(8, $item->getBatchStock());
        $this->assertSame(2, $item->batches()->count());

        (new InventoryService())->deductStock($item->id, 4, 'FIFO verification');

        $this->assertSame(1, (int) $item->fresh()->batches()->where('batch_no', 'LOT-EARLY')->value('remaining_quantity'));
        $this->assertSame(3, (int) $item->fresh()->batches()->where('batch_no', 'LOT-LATE')->value('remaining_quantity'));
    }

    public function test_stock_increase_adjustment_routes_require_batch_receiving(): void
    {
        $item = $this->makeItem(['category' => 'Accessories', 'issue_method' => 'FIFO']);

        $this->withHeaders($this->inventoryAuth())
            ->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
                'type' => 'add',
                'quantity' => 4,
                'reason' => 'New stock received',
            ])
            ->assertUnprocessable();

        $this->withHeaders($this->inventoryAuth())
            ->postJson("/api/inventory/{$item->id}/stock", [
                'type' => 'add',
                'quantity' => 4,
                'reason' => 'New stock received',
            ])
            ->assertUnprocessable();

        $this->assertSame(0, (int) $item->fresh()->stock);
        $this->assertSame(0, $item->batches()->count());
    }

    public function test_expiry_tracked_batches_are_required_and_deducted_fefo(): void
    {
        $item = $this->makeItem([
            'category' => 'Health',
            'requires_expiry_tracking' => true,
            'issue_method' => 'FEFO',
        ]);
        $today = now()->toDateString();

        $this->receiveBatch($item, [
            'batch_no' => 'EXP-LATER',
            'received_date' => $today,
            'expiration_date' => now()->addDays(20)->toDateString(),
            'quantity' => 5,
        ])->assertOk();
        $this->receiveBatch($item, [
            'batch_no' => 'EXP-EARLIER',
            'received_date' => $today,
            'expiration_date' => now()->addDays(10)->toDateString(),
            'quantity' => 4,
        ])->assertOk();

        $this->receiveBatch($item, [
            'batch_no' => 'EXP-MISSING',
            'received_date' => $today,
            'quantity' => 1,
        ])->assertUnprocessable();

        (new InventoryService())->deductStock($item->id, 2, 'FEFO verification');

        $this->assertSame(2, (int) $item->fresh()->batches()->where('batch_no', 'EXP-EARLIER')->value('remaining_quantity'));
        $this->assertSame(5, (int) $item->fresh()->batches()->where('batch_no', 'EXP-LATER')->value('remaining_quantity'));
    }

    /**
     * The reported bug shape: flat counter says stock exists but usable
     * batches are short. The sale must proceed — the gap materializes as a
     * labelled RECON batch instead of a 500.
     */
    public function test_pos_sale_self_heals_drifted_batch_stock(): void
    {
        $item = $this->makeItem(['stock' => 10]);
        $item->batches()->create([
            'batch_no' => 'REAL-1',
            'received_date' => now(),
            'quantity' => 5,
            'remaining_quantity' => 5,
            'status' => 'active',
        ]);

        $response = $this->posSell($item, 8);

        $response->assertStatus(200)->assertJsonPath('success', true);

        $item->refresh();
        $this->assertEquals(2, $item->stock);
        $this->assertEquals(0, $item->getBatchStock());
        $this->assertDatabaseHas('inventory_batches', [
            'inventory_item_id' => $item->id,
            'status' => 'depleted',
            'quantity' => 3, // RECON batch covered the 8 - 5 shortfall
        ]);
        $this->assertTrue(
            $item->batches()->where('batch_no', 'like', 'RECON-%')->exists(),
            'Expected a RECON- reconciliation batch'
        );
    }

    /**
     * A zero-quantity audit marker row must not force an untracked item onto
     * the FEFO path — flat deduction still works for batchless items.
     */
    public function test_marker_batch_does_not_block_sale(): void
    {
        $item = $this->makeItem(['stock' => 50]);
        $item->batches()->create([
            'batch_no' => 'AUDIT-MARKER',
            'received_date' => now(),
            'quantity' => 0,
            'remaining_quantity' => 0,
            'status' => 'audit_adjusted',
        ]);

        $response = $this->posSell($item, 1);

        $response->assertStatus(200)->assertJsonPath('success', true);
        $this->assertEquals(49, $item->fresh()->stock);
        // Still no real batches — the item remains untracked
        $this->assertFalse($item->hasRealBatches());
    }

    /**
     * Monthly audit deficit must write batches down to the physical count,
     * not just move the flat counter.
     */
    public function test_audit_deficit_writes_off_batches(): void
    {
        $item = $this->makeItem(['stock' => 99]);
        $item->batches()->create([
            'batch_no' => 'STOCK-1',
            'received_date' => now(),
            'quantity' => 99,
            'remaining_quantity' => 99,
            'status' => 'active',
        ]);

        $service = new InventoryService();
        $result = $service->applyMonthlyAuditAdjustment($item->fresh(), 50, 'Expired stock', '2026-10');

        $item->refresh();
        $this->assertEquals(50, $item->stock);
        $this->assertEquals(50, $item->getBatchStock());
        $this->assertEquals('discrepancy', $result['audit']->status);
    }

    /**
     * Monthly audit surplus must create a real batch, keeping batches and
     * the flat counter equal.
     */
    public function test_audit_surplus_creates_batch(): void
    {
        $item = $this->makeItem(['stock' => 50]);
        $item->batches()->create([
            'batch_no' => 'STOCK-1',
            'received_date' => now(),
            'quantity' => 50,
            'remaining_quantity' => 50,
            'status' => 'active',
        ]);

        $service = new InventoryService();
        $service->applyMonthlyAuditAdjustment($item->fresh(), 70, 'Found extra stock', '2026-10');

        $item->refresh();
        $this->assertEquals(70, $item->stock);
        $this->assertEquals(70, $item->getBatchStock());
        $this->assertDatabaseHas('inventory_batches', [
            'inventory_item_id' => $item->id,
            'quantity' => 20,
            'remaining_quantity' => 20,
            'status' => 'active',
        ]);
    }

    /**
     * Expired stock must still hard-block sales — self-heal never revives it.
     */
    public function test_expired_batch_still_blocks_sale(): void
    {
        $item = $this->makeItem(['stock' => 10]);
        $item->batches()->create([
            'batch_no' => 'EXPIRED-1',
            'received_date' => now()->subYear(),
            'expiration_date' => now()->subDay(),
            'quantity' => 10,
            'remaining_quantity' => 10,
            'status' => 'active',
        ]);

        $response = $this->posSell($item, 1);

        $response->assertStatus(422);
        $this->assertStringContainsString('expired', $response->json('message'));
        $this->assertEquals(10, $item->fresh()->stock);
    }

    /**
     * The repair command reports drift in dry-run and writes RECON batches
     * with --apply.
     */
    public function test_reconcile_command_repairs_drift(): void
    {
        $item = $this->makeItem(['stock' => 50, 'name' => 'Drifted Item']);
        $item->batches()->create([
            'batch_no' => 'AUDIT-MARKER',
            'received_date' => now(),
            'quantity' => 0,
            'remaining_quantity' => 0,
            'status' => 'audit_adjusted',
        ]);

        // Dry-run: nothing changes
        $this->artisan('inventory:reconcile-stock')->assertExitCode(0);
        $this->assertEquals(1, $item->batches()->count());

        // Apply: RECON batch materializes the untracked stock
        $this->artisan('inventory:reconcile-stock', ['--apply' => true])->assertExitCode(0);
        $this->assertEquals(50, $item->fresh()->getBatchStock());
        $this->assertTrue(
            $item->batches()->where('batch_no', 'like', 'RECON-%')->exists()
        );
    }
}
