<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryArchiveDeletionTest extends TestCase
{
    use RefreshDatabase;

    private function inventoryUser(): User
    {
        return User::factory()->create([
            'role' => 'inventory',
            'is_active' => true,
        ]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('inventory-delete-test')->plainTextToken];
    }

    private function item(array $attributes = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'MED-' . strtoupper(uniqid()),
            'name' => 'Sample medicine',
            'category' => 'Health',
            'price' => 100,
            'stock' => 0,
            'reorder_level' => 0,
            'status' => 'active',
        ], $attributes));
    }

    public function test_inventory_item_must_be_archived_and_have_a_dropdown_reason_before_permanent_delete(): void
    {
        $user = $this->inventoryUser();
        $item = $this->item();

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/inventory/items/{$item->id}")
            ->assertUnprocessable();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'status' => 'active']);

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/inventory/items/{$item->id}", ['reason' => 'expired'])
            ->assertUnprocessable();

        $this->withHeaders($this->headers($user))
            ->patchJson("/api/inventory/items/{$item->id}/archive", ['reason' => 'Medicine or item discontinued'])
            ->assertOk();

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/inventory/items/{$item->id}", ['reason' => 'expired'])
            ->assertOk()
            ->assertJsonPath('reason', 'Expired medicine or product');

        $this->assertDatabaseMissing('inventory_items', ['id' => $item->id]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'inventory_item_permanently_deleted',
            'reference_type' => 'inventory_item',
            'reference_id' => $item->id,
        ]);
        $log = ActivityLog::where('action', 'inventory_item_permanently_deleted')->sole();
        $this->assertSame('expired', $log->metadata['reason']);
        $this->assertSame('Sample medicine', $log->metadata['item_name']);
    }

    public function test_other_delete_reason_requires_details(): void
    {
        $user = $this->inventoryUser();
        $item = $this->item();
        $this->withHeaders($this->headers($user))
            ->patchJson("/api/inventory/items/{$item->id}/archive", ['reason' => 'Medicine or item discontinued'])
            ->assertOk();

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/inventory/items/{$item->id}", ['reason' => 'other'])
            ->assertUnprocessable();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'status' => 'archived']);

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/inventory/items/{$item->id}", [
                'reason' => 'other',
                'reason_details' => 'Duplicate item was entered in error',
            ])
            ->assertOk();

        $log = ActivityLog::where('action', 'inventory_item_permanently_deleted')->sole();
        $this->assertSame('other', $log->metadata['reason']);
        $this->assertSame('Duplicate item was entered in error', $log->metadata['reason_details']);
    }

    public function test_archived_items_with_transaction_history_remain_archived(): void
    {
        $user = $this->inventoryUser();
        $item = $this->item();
        $this->withHeaders($this->headers($user))
            ->patchJson("/api/inventory/items/{$item->id}/archive", ['reason' => 'Expired or unsafe to use'])
            ->assertOk();

        InventoryLog::create([
            'inventory_item_id' => $item->id,
            'type' => 'sale',
            'movement_type' => 'sale',
            'quantity' => 1,
            'delta' => -1,
            'stock_before' => 0,
            'stock_after' => 0,
            'previous_stock' => 0,
            'new_stock' => 0,
            'reason' => 'Historical sale',
        ]);

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/inventory/items/{$item->id}", ['reason' => 'expired'])
            ->assertUnprocessable();

        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'status' => 'archived']);
    }
}
