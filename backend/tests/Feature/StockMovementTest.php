<?php

namespace Tests\Feature;

use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\InventoryReturn;
use App\Models\InventoryStockRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Feature tests for the Stock Movement & Control system:
 * dedicated Stock In / Stock Out endpoints, the sensitive-reason approval
 * queue, movement reversals, customer-product returns, role enforcement
 * and idempotency.
 */
class StockMovementTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('stock-movement-test')->plainTextToken];
    }

    private function item(int $stock = 50, array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'SM-' . uniqid(),
            'name' => 'Movement Test Item',
            'category' => 'Accessories',
            'price' => 100,
            'stock' => $stock,
            'reorder_level' => 5,
            'status' => 'active',
            'is_sellable' => false,
            // DB default is FEFO which forces expiration_date on stock-in;
            // these non-perishable fixtures issue FIFO.
            'issue_method' => 'FIFO',
        ], $overrides));
    }

    private function fefoItem(int $stock = 50): InventoryItem
    {
        return $this->item($stock, [
            'name' => 'FEFO Vitamin',
            'category' => 'Health',
            'requires_expiry_tracking' => true,
            'issue_method' => 'FEFO',
        ]);
    }

    // ---------------------------------------------------------------
    // Stock In
    // ---------------------------------------------------------------

    public function test_stock_in_multi_item_posts_one_transaction(): void
    {
        $staff = $this->user('inventory');
        $a = $this->item(10);
        $b = $this->item(20);

        $res = $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'purchase',
            'supplier' => 'Pet Supplies Co',
            'reference' => 'PO-100',
            'items' => [
                ['inventory_item_id' => $a->id, 'quantity' => 5],
                ['inventory_item_id' => $b->id, 'quantity' => 3],
            ],
        ], $this->headers($staff));

        $res->assertStatus(201)->assertJsonPath('success', true);
        $txn = $res->json('transaction_no');
        $this->assertNotEmpty($txn);

        $this->assertSame(15, $a->fresh()->stock);
        $this->assertSame(23, $b->fresh()->stock);

        $logs = InventoryLog::where('transaction_no', $txn)->get();
        $this->assertCount(2, $logs);
        foreach ($logs as $log) {
            $this->assertSame('stock_in', $log->movement_type);
            $this->assertSame('purchase', $log->reason_code);
            $this->assertSame($staff->name, $log->performed_by);
            $this->assertNotNull($log->stock_before);
            $this->assertNotNull($log->stock_after);
        }
    }

    public function test_stock_in_requires_expiration_for_fefo_items(): void
    {
        $staff = $this->user('inventory');
        $item = $this->fefoItem(10);

        $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'supplier_delivery',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 5]],
        ], $this->headers($staff))->assertStatus(422);

        $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'supplier_delivery',
            'items' => [[
                'inventory_item_id' => $item->id,
                'quantity' => 5,
                'expiration_date' => now()->addMonths(6)->toDateString(),
            ]],
        ], $this->headers($staff))->assertStatus(201);

        $this->assertSame(15, $item->fresh()->stock);
        $this->assertSame(1, $item->fresh()->batches()->count());
    }

    public function test_stock_in_other_requires_description(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        $this->postJson('/api/inventory/stock-in', [
            'transaction_type' => 'other',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 2]],
        ], $this->headers($staff))->assertStatus(422);

        $this->assertSame(10, $item->fresh()->stock);
    }

    // ---------------------------------------------------------------
    // Stock Out
    // ---------------------------------------------------------------

    public function test_stock_out_immediate_reason_deducts(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(30);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'SVC-55',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 4]],
        ], $this->headers($staff));

        $res->assertStatus(201)->assertJsonPath('queued', false);
        $this->assertSame(26, $item->fresh()->stock);

        $log = InventoryLog::where('transaction_no', $res->json('transaction_no'))->firstOrFail();
        $this->assertSame('stock_out', $log->movement_type);
        $this->assertSame('service_consumption', $log->reason_code);
        $this->assertSame(-4, (int) $log->delta);
        $this->assertSame(30, (int) $log->stock_before);
        $this->assertSame(26, (int) $log->stock_after);
    }

    public function test_stock_out_rejects_overdraw(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(3);

        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'SVC-1',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 10]],
        ], $this->headers($staff))->assertStatus(422);

        $this->assertSame(3, $item->fresh()->stock);
    }

    public function test_stock_out_requires_reason_specific_fields(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        // damaged without damage_details
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ], $this->headers($staff))->assertStatus(422);

        // internal_usage missing purpose
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'internal_usage',
            'department' => 'Grooming',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ], $this->headers($staff))->assertStatus(422);

        $this->assertSame(10, $item->fresh()->stock);
    }

    // ---------------------------------------------------------------
    // Approval queue
    // ---------------------------------------------------------------

    public function test_sensitive_reason_queues_then_approval_deducts_once(): void
    {
        $staff = $this->user('inventory');
        $manager = $this->user('manager');
        $item = $this->item(20);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Chewed packaging',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 6]],
        ], $this->headers($staff));

        $res->assertStatus(202)->assertJsonPath('queued', true);
        $this->assertSame(20, $item->fresh()->stock, 'queued request must not touch stock');

        $request = InventoryStockRequest::findOrFail($res->json('request.id'));
        $this->assertSame('pending', $request->status);

        // Manager approval executes the deduction exactly once.
        $this->postJson("/api/manager/inventory/stock-requests/{$request->id}/approve", [
            'remarks' => 'ok',
        ], $this->headers($manager))->assertStatus(200);

        $this->assertSame(14, $item->fresh()->stock);
        $request->refresh();
        $this->assertSame('approved', $request->status);
        $this->assertNotNull($request->executed_at);

        $log = InventoryLog::where('inventory_item_id', $item->id)->latest('id')->firstOrFail();
        $this->assertSame('stock_out', $log->movement_type);
        $this->assertSame('damaged', $log->reason_code);
        $this->assertSame('stock_request', $log->reference_type);
        $this->assertSame($request->id, (int) $log->reference_id);
        $this->assertSame($request->transaction_no, $log->transaction_no);

        // Second approval is rejected — no double deduction.
        $this->postJson("/api/manager/inventory/stock-requests/{$request->id}/approve", [], $this->headers($manager))
            ->assertStatus(422);
        $this->assertSame(14, $item->fresh()->stock);
    }

    public function test_requester_cannot_approve_own_request(): void
    {
        $admin = $this->user('admin');
        $item = $this->item(10);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'disposal',
            'disposal_method' => 'incineration',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 2]],
        ], $this->headers($admin));
        $res->assertStatus(202);

        $request = InventoryStockRequest::findOrFail($res->json('request.id'));
        $this->postJson("/api/manager/inventory/stock-requests/{$request->id}/approve", [], $this->headers($admin))
            ->assertStatus(422);

        $this->assertSame(10, $item->fresh()->stock);
    }

    public function test_reject_request_keeps_stock_and_records_review(): void
    {
        $staff = $this->user('inventory');
        $manager = $this->user('manager');
        $item = $this->item(10);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'lost_missing',
            'incident_details' => 'Missing from storage shelf 3',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 4]],
        ], $this->headers($staff));
        $res->assertStatus(202);
        $request = InventoryStockRequest::findOrFail($res->json('request.id'));

        // remarks are required
        $this->postJson("/api/manager/inventory/stock-requests/{$request->id}/reject", [], $this->headers($manager))
            ->assertStatus(422);

        $this->postJson("/api/manager/inventory/stock-requests/{$request->id}/reject", [
            'remarks' => 'Insurer report required first',
        ], $this->headers($manager))->assertStatus(200);

        $request->refresh();
        $this->assertSame('rejected', $request->status);
        $this->assertSame('Insurer report required first', $request->review_remarks);
        $this->assertSame(10, $item->fresh()->stock);
        $this->assertSame(0, InventoryLog::where('inventory_item_id', $item->id)->where('movement_type', 'stock_out')->count());
    }

    // ---------------------------------------------------------------
    // Inventory correction (physical count, set semantics)
    // ---------------------------------------------------------------

    public function test_correction_reconciles_to_physical_count(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(20);

        // Decrease: counted 12
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'correction',
            'explanation' => 'Cycle count discrepancy',
            'items' => [['inventory_item_id' => $item->id, 'physical_count' => 12]],
        ], $this->headers($staff))->assertStatus(201);
        $this->assertSame(12, $item->fresh()->stock);

        // Increase: counted 18 — corrections can adjust upward too.
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'correction',
            'explanation' => 'Found unlogged stock',
            'items' => [['inventory_item_id' => $item->id, 'physical_count' => 18]],
        ], $this->headers($staff))->assertStatus(201);
        $this->assertSame(18, $item->fresh()->stock);

        // Same count → nothing recorded.
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'correction',
            'explanation' => 'Count matches',
            'items' => [['inventory_item_id' => $item->id, 'physical_count' => 18]],
        ], $this->headers($staff))->assertStatus(422);
        $this->assertSame(18, $item->fresh()->stock);
    }

    // ---------------------------------------------------------------
    // Reversal
    // ---------------------------------------------------------------

    public function test_reversal_restores_and_is_capped(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(20);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'SVC-9',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 8]],
        ], $this->headers($staff));
        $res->assertStatus(201);
        $movementId = $res->json('movements.0.id');
        $this->assertSame(12, $item->fresh()->stock);

        // Partial reversal (3)
        $rev = $this->postJson("/api/inventory/movements/{$movementId}/reverse", [
            'quantity' => 3, 'reason' => 'Consumed quantity overstated',
        ], $this->headers($staff));
        $rev->assertStatus(200)->assertJsonPath('reversed', 3);
        $this->assertSame(15, $item->fresh()->stock);

        $reversal = InventoryLog::findOrFail($rev->json('movement.id'));
        $this->assertSame('stock_reversal', $reversal->movement_type);
        $this->assertSame($movementId, (int) $reversal->original_movement_id);
        $this->assertSame(12, (int) $reversal->stock_before);
        $this->assertSame(15, (int) $reversal->stock_after);

        // Can't reverse beyond remaining (5 left)
        $this->postJson("/api/inventory/movements/{$movementId}/reverse", [
            'quantity' => 6, 'reason' => 'too many',
        ], $this->headers($staff))->assertStatus(422);
        $this->assertSame(15, $item->fresh()->stock);

        // Finish reversing (5) then any further attempt fails.
        $this->postJson("/api/inventory/movements/{$movementId}/reverse", [
            'quantity' => 5, 'reason' => 'rest',
        ], $this->headers($staff))->assertStatus(200);
        $this->assertSame(20, $item->fresh()->stock);

        $this->postJson("/api/inventory/movements/{$movementId}/reverse", [
            'quantity' => 1, 'reason' => 'again',
        ], $this->headers($staff))->assertStatus(422);
        $this->assertSame(20, $item->fresh()->stock);
    }

    public function test_sale_deduction_is_not_reversible_through_movements(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        $log = InventoryLog::create([
            'inventory_item_id' => $item->id,
            'delta' => -2,
            'quantity' => 2,
            'type' => 'sale',
            'movement_type' => 'sale_deduction',
            'reason' => 'POS sale',
            'reference_type' => 'sale',
            'stock_before' => 12,
            'stock_after' => 10,
            'performed_by' => 'Cashier',
        ]);

        $this->postJson("/api/inventory/movements/{$log->id}/reverse", [
            'quantity' => 2, 'reason' => 'try',
        ], $this->headers($staff))->assertStatus(422);
        $this->assertSame(10, $item->fresh()->stock);
    }

    // ---------------------------------------------------------------
    // Returns
    // ---------------------------------------------------------------

    public function test_return_lifecycle_restock_and_terminal_states(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        $create = $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 2,
            'source_type' => 'manual',
            'return_reason' => 'Customer changed mind',
        ], $this->headers($staff));
        $create->assertStatus(201);
        $return = InventoryReturn::findOrFail($create->json('return.id'));
        $this->assertSame('pending_inspection', $return->status);
        $this->assertSame(10, $item->fresh()->stock, 'a return never auto-restockes');

        // Restock → linked positive movement.
        $this->postJson("/api/inventory/returns/{$return->id}/disposition", [
            'disposition' => 'restock',
            'inspection_notes' => 'sealed, resalable',
        ], $this->headers($staff))->assertStatus(200);
        $this->assertSame(12, $item->fresh()->stock);
        $return->refresh();
        $this->assertSame('restocked', $return->status);
        $this->assertNotNull($return->movement_id);

        // Terminal — cannot disposition again.
        $this->postJson("/api/inventory/returns/{$return->id}/disposition", [
            'disposition' => 'dispose',
        ], $this->headers($staff))->assertStatus(422);
        $this->assertSame(12, $item->fresh()->stock);
    }

    public function test_quarantine_then_dispose_keeps_stock_unchanged(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        $create = $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 1,
            'return_reason' => 'Damaged seal',
        ], $this->headers($staff));
        $return = InventoryReturn::findOrFail($create->json('return.id'));

        $this->postJson("/api/inventory/returns/{$return->id}/disposition", [
            'disposition' => 'quarantine',
        ], $this->headers($staff))->assertStatus(200);
        $this->assertSame(10, $item->fresh()->stock);
        $this->assertSame('quarantined', $return->fresh()->status);

        $this->postJson("/api/inventory/returns/{$return->id}/disposition", [
            'disposition' => 'dispose',
            'inspection_notes' => 'contaminated',
        ], $this->headers($staff))->assertStatus(200);
        $this->assertSame(10, $item->fresh()->stock);
        $this->assertSame('disposed', $return->fresh()->status);
    }

    // ---------------------------------------------------------------
    // Search + auth + idempotency
    // ---------------------------------------------------------------

    public function test_item_search_matches_name_sku_barcode(): void
    {
        $staff = $this->user('inventory');
        $this->item(5, ['name' => 'Puppy Shampoo', 'sku' => 'SHM-77', 'barcode' => '880001']);
        $this->item(5, ['name' => 'Cat Toy', 'sku' => 'TOY-1']);

        $res = $this->getJson('/api/inventory/items/search?q=shampoo', $this->headers($staff));
        $res->assertStatus(200);
        $names = collect($res->json('items'))->pluck('name');
        $this->assertTrue($names->contains('Puppy Shampoo'));
        $this->assertFalse($names->contains('Cat Toy'));

        $res = $this->getJson('/api/inventory/items/search?q=880001', $this->headers($staff));
        $this->assertCount(1, $res->json('items'));
    }

    public function test_roles_and_auth_are_enforced(): void
    {
        $item = $this->item(10);

        // Unauthenticated
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'X',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ])->assertStatus(401);

        // Cashier is not an inventory operator — backend must reject.
        $cashier = $this->user('cashier');
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'X',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ], $this->headers($cashier))->assertStatus(403);

        // Inventory staff cannot approve requests.
        $staff = $this->user('inventory');
        $this->postJson('/api/manager/inventory/stock-requests/1/approve', [], $this->headers($staff))
            ->assertStatus(403);

        $this->assertSame(10, $item->fresh()->stock);
    }

    public function test_idempotency_key_replays_single_execution(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);
        $headers = array_merge($this->headers($staff), ['Idempotency-Key' => 'stockin-once-123']);
        $payload = [
            'transaction_type' => 'purchase',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 4]],
        ];

        $first = $this->postJson('/api/inventory/stock-in', $payload, $headers);
        $first->assertStatus(201);

        $replay = $this->postJson('/api/inventory/stock-in', $payload, $headers);
        $replay->assertStatus(201)->assertHeader('Idempotent-Replayed', 'true');
        $this->assertSame($first->json('transaction_no'), $replay->json('transaction_no'));

        $this->assertSame(14, $item->fresh()->stock, 'stock applied exactly once');
        $this->assertSame(1, InventoryLog::where('inventory_item_id', $item->id)->where('movement_type', 'stock_in')->count());
    }

    // ---------------------------------------------------------------
    // Production-readiness audit fixes
    // ---------------------------------------------------------------

    public function test_reversal_of_approved_request_requires_manager_or_admin(): void
    {
        $staff = $this->user('inventory');
        $manager = $this->user('manager');
        $item = $this->item(20);

        $res = $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Water damage',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 5]],
        ], $this->headers($staff));
        $res->assertStatus(202);

        $request = InventoryStockRequest::findOrFail($res->json('request.id'));
        $this->postJson("/api/manager/inventory/stock-requests/{$request->id}/approve", [], $this->headers($manager))
            ->assertStatus(200);
        $this->assertSame(15, $item->fresh()->stock);

        $movementId = InventoryLog::where('reference_type', 'stock_request')
            ->where('reference_id', $request->id)->value('id');

        // The requester must not silently undo a manager-approved removal.
        $this->postJson("/api/inventory/movements/{$movementId}/reverse", [
            'quantity' => 2, 'reason' => 'undo',
        ], $this->headers($staff))->assertStatus(422);
        $this->assertSame(15, $item->fresh()->stock);

        // A manager may reverse it.
        $this->postJson("/api/inventory/movements/{$movementId}/reverse", [
            'quantity' => 2, 'reason' => 'Damage assessment overturned',
        ], $this->headers($manager))->assertStatus(200);
        $this->assertSame(17, $item->fresh()->stock);
    }

    public function test_source_linked_return_validates_against_original_sale(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        // source_id is required for linked returns.
        $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 1,
            'source_type' => 'sale',
            'return_reason' => 'Defective',
        ], $this->headers($staff))->assertStatus(422);

        // The item must actually be part of the referenced sale.
        $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 1,
            'source_type' => 'sale',
            'source_id' => 999999,
            'return_reason' => 'Defective',
        ], $this->headers($staff))->assertStatus(422);

        // Real sale fixture: 5 units of the item.
        $saleId = \Illuminate\Support\Facades\DB::table('sales')->insertGetId([
            'amount' => 500,
            'type' => 'product',
            'transaction_number' => 'TXN-' . uniqid(),
            'payment_method' => 'cash',
            'status' => 'completed',
            'subtotal' => 500,
            'total_amount' => 500,
            'cashier_id' => $staff->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('sale_items')->insert([
            'sale_id' => $saleId,
            'item_type' => 'product',
            'item_name' => $item->name,
            'product_id' => $item->id,
            'quantity' => 5,
            'unit_price' => 100,
            'total_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // 3 of 5 returned — ok.
        $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 3,
            'source_type' => 'sale',
            'source_id' => $saleId,
            'return_reason' => 'Defective',
        ], $this->headers($staff))->assertStatus(201);

        // 3 more exceeds the remaining returnable quantity (2).
        $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 3,
            'source_type' => 'sale',
            'source_id' => $saleId,
            'return_reason' => 'Also defective',
        ], $this->headers($staff))->assertStatus(422);

        // The remaining 2 can still be returned.
        $this->postJson('/api/inventory/returns', [
            'inventory_item_id' => $item->id,
            'quantity' => 2,
            'source_type' => 'sale',
            'source_id' => $saleId,
            'return_reason' => 'Also defective',
        ], $this->headers($staff))->assertStatus(201);
    }

    public function test_stock_out_batch_id_must_belong_to_item(): void
    {
        $staff = $this->user('inventory');
        $a = $this->item(10);
        $b = $this->item(10);

        $batch = InventoryBatch::create([
            'inventory_item_id' => $b->id,
            'batch_no' => 'B-FOREIGN',
            'quantity' => 5,
            'remaining_quantity' => 5,
            'received_date' => now()->toDateString(),
            'status' => 'active',
        ]);

        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'service_consumption',
            'service_reference' => 'SVC-1',
            'items' => [['inventory_item_id' => $a->id, 'quantity' => 1, 'batch_id' => $batch->id]],
        ], $this->headers($staff))->assertStatus(422);

        $this->assertSame(10, $a->fresh()->stock);
        $this->assertSame(5, $batch->fresh()->remaining_quantity);
    }

    public function test_evidence_upload_view_and_path_validation(): void
    {
        $staff = $this->user('inventory');
        $item = $this->item(10);

        // Upload a real (tiny) PNG — GD may be unavailable, so bytes are embedded.
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('damage.png', $png);

        $up = $this->postJson('/api/inventory/evidence', ['photo' => $file], $this->headers($staff));
        $up->assertStatus(201)->assertJsonPath('success', true);
        $path = $up->json('path');
        $this->assertStringStartsWith('inventory-evidence/', $path);

        // Uploaded path is accepted on a stock-out payload.
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Chewed packaging',
            'photo' => $path,
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ], $this->headers($staff))->assertStatus(202);

        // Legacy free-text references still pass validation.
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Chewed packaging',
            'photo' => 'shelf-photo-2024.jpg',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ], $this->headers($staff))->assertStatus(202);

        // An inventory-evidence path that doesn't exist is rejected.
        $this->postJson('/api/inventory/stock-out', [
            'reason_code' => 'damaged',
            'damage_details' => 'Chewed packaging',
            'photo' => 'inventory-evidence/evd_20990101_000000_missing.png',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 1]],
        ], $this->headers($staff))->assertStatus(422);

        // Authenticated staff can view stored evidence.
        $this->getJson("/api/inventory/evidence/" . basename($path), $this->headers($staff))
            ->assertStatus(200);
        $this->getJson('/api/inventory/evidence/../../.env', $this->headers($staff))
            ->assertStatus(404);
        $this->getJson('/api/inventory/evidence/evil.php', $this->headers($staff))
            ->assertStatus(404);

        // Non-image uploads are rejected.
        $exe = \Illuminate\Http\UploadedFile::fake()->createWithContent('evil.php', '<?php echo 1;');
        $this->postJson('/api/inventory/evidence', ['photo' => $exe], $this->headers($staff))
            ->assertStatus(422);
    }

    /**
     * Anonymous access must be denied. Kept in its own test: Auth::setUser
     * persists on the guard across requests within a single test, so an
     * "anonymous" request issued after an authenticated one is not truly
     * anonymous.
     */
    public function test_evidence_endpoints_require_authentication(): void
    {
        $this->getJson('/api/inventory/evidence/evd_any.png')->assertStatus(401);
        $this->postJson('/api/inventory/evidence', [])->assertStatus(401);
    }
}
