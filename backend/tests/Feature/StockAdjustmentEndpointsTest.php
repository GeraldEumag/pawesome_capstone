<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression tests for the parallel stock-adjustment endpoints audited in
 * the inventory role deep-dive (INV-01..INV-04, INV-06):
 *
 *  - PATCH|POST /api/admin/inventory/{id}/stock        (Admin\InventoryController::updateStock)
 *  - POST|PATCH /api/inventory/{id}/stock              (Inventory\DashboardController::adjustStock)
 *  - POST /api/inventory/items/{id}/adjust-stock       (Admin\InventoryController::adjustStock)
 *
 * All three must share the same contract: no silent over-draw clamp, full
 * movement logs, no writes to the non-existent `quantity` column, and `set`
 * must allow a zero target.
 */
class StockAdjustmentEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('stock-adj-test')->plainTextToken];
    }

    private function nonBatchItem(int $stock = 50): InventoryItem
    {
        return InventoryItem::create([
            'sku' => 'ADJ-' . uniqid(),
            'name' => 'Adj Test Item',
            'category' => 'Accessories',
            'price' => 100,
            'stock' => $stock,
            'reorder_level' => 10,
            'status' => 'active',
            'is_sellable' => false,
        ]);
    }

    /** INV-01: admin /stock endpoint crashed with 42S22 on non-batch items. */
    public function test_admin_stock_remove_works_on_non_batch_item(): void
    {
        $item = $this->nonBatchItem(50);
        $headers = $this->headers($this->user('admin'));

        $this->patchJson("/api/admin/inventory/{$item->id}/stock", [
            'type' => 'remove', 'quantity' => 15, 'reason' => 'count correction',
        ], $headers)->assertStatus(200)->assertJsonPath('new_stock', 35);

        $this->assertSame(35, $item->fresh()->stock);

        // INV-02: log must carry the full movement fields.
        $log = InventoryLog::where('inventory_item_id', $item->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertNotEmpty($log->movement_type);
        $this->assertNotNull($log->stock_before);
        $this->assertNotNull($log->stock_after);
        $this->assertSame(50, (int) $log->stock_before);
        $this->assertSame(35, (int) $log->stock_after);
        $this->assertSame(-15, (int) $log->delta);
    }

    /** INV-03: admin endpoint must reject over-draw instead of clamping to 0. */
    public function test_admin_stock_remove_overdraw_is_rejected(): void
    {
        $item = $this->nonBatchItem(11);
        $headers = $this->headers($this->user('admin'));

        $this->patchJson("/api/admin/inventory/{$item->id}/stock", [
            'type' => 'remove', 'quantity' => 9999, 'reason' => 'over-draw probe',
        ], $headers)->assertStatus(422);

        $this->assertSame(11, $item->fresh()->stock);
    }

    /** INV-03: inventory-role endpoint must also reject over-draw. */
    public function test_inventory_stock_remove_overdraw_is_rejected(): void
    {
        $item = $this->nonBatchItem(11);
        $headers = $this->headers($this->user('inventory'));

        $this->postJson("/api/inventory/{$item->id}/stock", [
            'type' => 'remove', 'quantity' => 9999, 'reason' => 'over-draw probe',
        ], $headers)->assertStatus(422);

        $this->assertSame(11, $item->fresh()->stock);
    }

    public function test_inventory_stock_remove_partial_works(): void
    {
        $item = $this->nonBatchItem(11);
        $headers = $this->headers($this->user('inventory'));

        $this->postJson("/api/inventory/{$item->id}/stock", [
            'type' => 'remove', 'quantity' => 4, 'reason' => 'damaged goods',
        ], $headers)->assertStatus(200)->assertJsonPath('new_stock', 7);

        $log = InventoryLog::where('inventory_item_id', $item->id)->latest('id')->first();
        $this->assertSame(-4, (int) $log->delta);
        $this->assertSame('inventory', $log->role);
    }

    public function test_set_adjustment_reaches_target_on_both_endpoints(): void
    {
        $item = $this->nonBatchItem(40);
        $admin = $this->headers($this->user('admin'));
        $inventory = $this->headers($this->user('inventory'));

        $this->patchJson("/api/admin/inventory/{$item->id}/stock", [
            'type' => 'set', 'quantity' => 25, 'reason' => 'physical count',
        ], $admin)->assertStatus(200);
        $this->assertSame(25, $item->fresh()->stock);

        $this->postJson("/api/inventory/{$item->id}/stock", [
            'type' => 'set', 'quantity' => 12, 'reason' => 'physical count',
        ], $inventory)->assertStatus(200);
        $this->assertSame(12, $item->fresh()->stock);
    }

    /** INV-06: `set` to zero must be allowed — zeroing is a valid correction. */
    public function test_set_to_zero_is_allowed(): void
    {
        $item = $this->nonBatchItem(30);
        $headers = $this->headers($this->user('inventory'));

        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'type' => 'set', 'quantity' => 0, 'reason' => 'all units written off',
        ], $headers)->assertStatus(200);

        $this->assertSame(0, $item->fresh()->stock);
    }

    /** Increases remain batch-receive-only on all three endpoints. */
    public function test_add_is_rejected_on_all_adjustment_endpoints(): void
    {
        $item = $this->nonBatchItem(50);
        $admin = $this->headers($this->user('admin'));
        $inventory = $this->headers($this->user('inventory'));

        $this->patchJson("/api/admin/inventory/{$item->id}/stock", [
            'type' => 'add', 'quantity' => 5, 'reason' => 'x',
        ], $admin)->assertStatus(422);

        $this->postJson("/api/inventory/{$item->id}/stock", [
            'type' => 'add', 'quantity' => 5, 'reason' => 'x',
        ], $inventory)->assertStatus(422);

        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'type' => 'add', 'quantity' => 5, 'reason' => 'x',
        ], $inventory)->assertStatus(422);

        $this->assertSame(50, $item->fresh()->stock);
    }

    /** Batch-tracked items still reconcile batches on the delegated paths. */
    public function test_batch_tracked_item_stays_in_sync(): void
    {
        $item = $this->nonBatchItem(0);
        $item->update(['requires_expiry_tracking' => true, 'issue_method' => 'FEFO']);
        $item->addBatchStock(20, 'B-1', '2030-01-01', 'initial');
        $this->assertSame(20, $item->fresh()->stock);

        $headers = $this->headers($this->user('inventory'));
        $this->postJson("/api/inventory/{$item->id}/stock", [
            'type' => 'set', 'quantity' => 15, 'reason' => 'physical count 15',
        ], $headers)->assertStatus(200);

        $item = $item->fresh();
        $this->assertSame(15, $item->stock);
        $this->assertSame(15, (int) $item->batches()->where('status', 'active')->sum('remaining_quantity'));
    }
}
