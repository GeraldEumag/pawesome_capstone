<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Inventory-role authorization matrix.
 *
 * Verifies that the `inventory` role can reach its own module surface
 * (`/api/inventory/*` plus the intentionally shared product-lookup and
 * attendance endpoints) and is blocked — by the backend, not just hidden
 * buttons — from cashier, receptionist, manager, admin, customer, and
 * veterinary capabilities. Also covers unauthenticated access, cross-role
 * writes into `/api/inventory/*`, and actor-field spoofing on stock
 * mutations.
 */
class InventoryRoleAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('inv-auth-test')->plainTextToken];
    }

    private function inventoryItem(array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'AUTH-' . uniqid(),
            'name' => 'Audit Auth Item',
            'category' => 'Food',
            'price' => 100,
            'stock' => 50,
            'reorder_level' => 10,
            'status' => 'active',
        ], $overrides));
    }

    /** @return array<string,string> method => uri */
    private function allowedReads(): array
    {
        return [
            'GET dashboard' => '/api/inventory/dashboard',
            'GET dashboard/overview' => '/api/inventory/dashboard/overview',
            'GET dashboard/low-stock' => '/api/inventory/dashboard/low-stock',
            'GET dashboard/recent-activity' => '/api/inventory/dashboard/recent-activity',
            'GET items' => '/api/inventory/items',
            'GET items/archived' => '/api/inventory/items/archived',
            'GET logs' => '/api/inventory/logs',
            'GET history' => '/api/inventory/history',
            'GET stock/history' => '/api/inventory/stock/history',
            'GET low-stock' => '/api/inventory/low-stock',
            'GET expiry-alerts' => '/api/inventory/expiry-alerts',
            'GET monthly-audit' => '/api/inventory/monthly-audit',
            'GET monthly-audit-report' => '/api/inventory/monthly-audit-report',
            'GET audit-analytics' => '/api/inventory/audit-analytics',
            'GET monthly-audit/discrepancy-reasons' => '/api/inventory/monthly-audit/discrepancy-reasons',
            'GET reports' => '/api/inventory/reports',
            'GET reports/live' => '/api/inventory/reports/live',
            'GET reports/valuation' => '/api/inventory/reports/valuation',
            'GET suppliers' => '/api/inventory/suppliers',
            'GET public items' => '/api/inventory/public/items',
            'GET products/search (shared POS lookup)' => '/api/products/search?query=x',
        ];
    }

    /** @return array<string,array{0:string,1:string,2:array}> label => [method, uri, payload] */
    private function forbiddenOps(): array
    {
        return [
            // Cashier POS / payment scope
            'cashier POS transaction' => ['POST', '/api/cashier/pos/transaction', ['items' => [], 'payment_method' => 'cash']],
            'cashier void' => ['POST', '/api/cashier/void', ['sale_id' => 1, 'reason' => 'x']],
            'cashier refund' => ['POST', '/api/cashier/refund', []],
            'cashier payment queue' => ['GET', '/api/cashier/payment-requests', []],
            'cashier dashboard' => ['GET', '/api/cashier/dashboard', []],
            'cashier paid/pending report' => ['GET', '/api/cashier/reports/paid-payments', []],
            'billing mark items paid' => ['PATCH', '/api/billing/items/mark-paid', ['item_ids' => [1]]],
            'billing unpaid services' => ['GET', '/api/billing/unpaid-services', []],
            // Receptionist scope
            'receptionist order status' => ['PUT', '/api/receptionist/orders/1/status', ['status' => 'approved']],
            'receptionist customer-orders' => ['GET', '/api/receptionist/customer-orders', []],
            'receptionist create customer' => ['POST', '/api/receptionist/customers', ['name' => 'x']],
            'receptionist dashboard' => ['GET', '/api/receptionist/dashboard', []],
            // Manager scope
            'manager dashboard' => ['GET', '/api/manager/dashboard', []],
            'manager inventory report' => ['GET', '/api/manager/reports/inventory', []],
            'manager payroll' => ['GET', '/api/manager/reports/payroll', []],
            // Admin scope
            'admin users list' => ['GET', '/api/admin/users', []],
            'admin user create' => ['POST', '/api/admin/users', ['name' => 'x', 'email' => 'x@x.com', 'password' => 'x']],
            'admin inventory list' => ['GET', '/api/admin/inventory', []],
            'admin inventory create' => ['POST', '/api/admin/inventory', ['name' => 'x']],
            'admin item delete' => ['DELETE', '/api/admin/inventory/items/1', []],
            // Customer scope
            'customer orders' => ['GET', '/api/customer/store/orders', []],
            'customer checkout' => ['POST', '/api/customer/store/checkout', ['items' => []]],
            // Veterinary scope
            'veterinary appointment create' => ['POST', '/api/veterinary/appointments', []],
            'veterinary dashboard' => ['GET', '/api/veterinary/dashboard', []],
            'billing add item (vet/receptionist only)' => ['POST', '/api/billing/items', ['service_type' => 'veterinary', 'service_id' => 1]],
        ];
    }

    public function test_inventory_can_read_own_module(): void
    {
        $headers = $this->headers($this->user('inventory'));

        foreach ($this->allowedReads() as $label => $uri) {
            $response = $this->getJson($uri, $headers);
            $this->assertTrue(
                in_array($response->getStatusCode(), [200, 201], true),
                "{$label} ({$uri}) returned {$response->getStatusCode()} — expected 2xx for inventory role"
            );
        }
    }

    public function test_inventory_can_mutate_own_module(): void
    {
        $user = $this->user('inventory');
        $headers = $this->headers($user);

        // Create item (barcode required because is_sellable defaults true)
        $create = $this->postJson('/api/inventory/items', [
            'name' => 'AUTH Create Item',
            'sku' => 'AUTH-CREATE-1',
            'barcode' => 'AUTHBC1',
            'category' => 'Food',
            'price' => 50,
            'stock' => 20,
            'reorder_level' => 5,
        ], $headers);
        $this->assertTrue(in_array($create->getStatusCode(), [200, 201], true), 'create returned ' . $create->getStatusCode() . ': ' . $create->getContent());
        $itemId = $create->json('item.id') ?? $create->json('data.id') ?? $create->json('id');
        $this->assertNotNull($itemId, 'create response had no item id: ' . $create->getContent());

        // Edit item
        $this->putJson("/api/inventory/items/{$itemId}", [
            'name' => 'AUTH Create Item (edited)',
            'price' => 55,
        ], $headers)->assertSuccessful();

        // Stock adjust — decrement path (increases go through batch receive)
        $this->postJson("/api/inventory/items/{$itemId}/adjust-stock", [
            'type' => 'decrement',
            'quantity' => 10,
            'reason' => 'Audit authorization probe',
        ], $headers)->assertSuccessful();
        $this->assertEquals(10, InventoryItem::findOrFail($itemId)->stock);

        // Supplier create (shared admin+inventory scope)
        $this->postJson('/api/inventory/suppliers', ['name' => 'AUTH Supplier'], $headers)
            ->assertSuccessful();
    }

    public function test_inventory_is_forbidden_from_other_role_operations(): void
    {
        $headers = $this->headers($this->user('inventory'));

        foreach ($this->forbiddenOps() as $label => [$method, $uri, $payload]) {
            $response = $this->json($method, $uri, $payload, $headers);
            $this->assertSame(
                403,
                $response->getStatusCode(),
                "{$label} ({$method} {$uri}) returned {$response->getStatusCode()} — expected 403 for inventory role: {$response->getContent()}"
            );
        }
    }

    public function test_forbidden_ops_leave_no_state_change(): void
    {
        $headers = $this->headers($this->user('inventory'));

        $orderStatus = $this->putJson('/api/receptionist/orders/1/status', ['status' => 'approved'], $headers);
        $this->assertSame(403, $orderStatus->getStatusCode());
        $this->assertSame(0, InventoryLog::count(), 'blocked request still wrote an inventory log');

        $adminUser = $this->postJson('/api/admin/users', [
            'name' => 'spoof', 'email' => 'spoof@example.com', 'password' => 'password123',
        ], $headers);
        $this->assertSame(403, $adminUser->getStatusCode());
        $this->assertDatabaseMissing('users', ['email' => 'spoof@example.com']);
    }

    public function test_unauthenticated_requests_get_401(): void
    {
        $this->getJson('/api/inventory/items')->assertStatus(401);
        $this->postJson('/api/inventory/items', [])->assertStatus(401);
        $this->getJson('/api/inventory/dashboard')->assertStatus(401);
    }

    public function test_other_roles_cannot_write_inventory(): void
    {
        $item = $this->inventoryItem();

        foreach (['customer', 'receptionist', 'manager', 'veterinary'] as $role) {
            $headers = $this->headers($this->user($role));

            $this->postJson('/api/inventory/items', [
                'name' => "blocked-{$role}", 'sku' => "BLK-{$role}", 'category' => 'Food',
                'price' => 10, 'stock' => 5,
            ], $headers)->assertStatus(403);

            $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
                'quantity' => 999, 'reason' => 'unauthorized attempt',
            ], $headers)->assertStatus(403);

            $this->putJson("/api/inventory/items/{$item->id}", ['name' => 'hijacked'], $headers)
                ->assertStatus(403);
        }

        $this->assertSame(50, $item->fresh()->stock, 'blocked writes still changed stock');
    }

    public function test_cashier_is_read_only_or_blocked_on_inventory_writes(): void
    {
        $item = $this->inventoryItem();
        $headers = $this->headers($this->user('cashier'));

        // Cashier is not in the inventory role group — writes are forbidden.
        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'quantity' => 999, 'reason' => 'cashier attempt',
        ], $headers)->assertStatus(403);
        $this->assertSame(50, $item->fresh()->stock);
    }

    public function test_actor_spoofing_is_ignored(): void
    {
        $user = $this->user('inventory');
        $headers = $this->headers($user);
        $item = $this->inventoryItem(['name' => 'Spoof Target']);

        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'type' => 'decrement',
            'quantity' => 10,
            'reason' => 'audit spoof probe',
            'performed_by' => 'FAKE ADMIN',
            'user_id' => 1,
            'role' => 'admin',
        ], $headers)->assertSuccessful();

        $log = InventoryLog::where('inventory_item_id', $item->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertNotSame('FAKE ADMIN', $log->performed_by, 'performed_by was taken from the request payload');
        $this->assertSame($user->id, $log->user_id, 'log user_id was not the authenticated caller');
        $this->assertSame('inventory', $log->role);
        $this->assertSame(40, $item->fresh()->stock);
    }

    public function test_invalid_item_and_malformed_payloads_rejected(): void
    {
        $headers = $this->headers($this->user('inventory'));
        $item = $this->inventoryItem();

        // Nonexistent item: findOrFail inside the service surfaces as a 422
        // ("No query results") through the controller's catch — must not 500.
        $this->postJson('/api/inventory/items/999999/adjust-stock', [
            'type' => 'decrement', 'quantity' => 5, 'reason' => 'x',
        ], $headers)->assertStatus(422);

        // Non-numeric quantity fails validation before any state change.
        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'type' => 'decrement', 'quantity' => 'abc', 'reason' => 'x',
        ], $headers)->assertStatus(422);

        // Decrement beyond available stock is rejected; no negative stock.
        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'type' => 'decrement', 'quantity' => 9999, 'reason' => 'over-draw',
        ], $headers)->assertStatus(422);

        // Increases via adjust-stock are rejected — batch receive is the path.
        $this->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
            'type' => 'increment', 'quantity' => 5, 'reason' => 'bypass attempt',
        ], $headers)->assertStatus(422);

        $this->assertSame(50, $item->fresh()->stock, 'rejected adjustments still moved stock');
    }

    public function test_super_receptionist_composite_reaches_inventory(): void
    {
        $headers = $this->headers($this->user('super_receptionist'));
        $this->getJson('/api/inventory/items', $headers)->assertStatus(200);
    }

    /** Reorder requests must persist (manager notification), not fabricate an id. */
    public function test_reorder_request_persists_manager_notification(): void
    {
        $manager = $this->user('manager');
        $item = $this->inventoryItem(['stock' => 3, 'reorder_level' => 10]);
        $headers = $this->headers($this->user('inventory'));

        $this->postJson('/api/inventory/reorder-requests', [
            'item_id' => $item->id,
            'suggested_quantity' => 25,
            'priority' => 'high',
        ], $headers)->assertStatus(201);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $manager->id,
            'title' => 'Inventory Reorder Request',
            'related_id' => $item->id,
        ]);
    }
}
