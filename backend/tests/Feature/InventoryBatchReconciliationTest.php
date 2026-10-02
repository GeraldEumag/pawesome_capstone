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

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = User::factory()->create(['role' => 'cashier']);
    }

    private function cashierAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->cashier->createToken('test-token')->plainTextToken];
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

        $response->assertStatus(500);
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
