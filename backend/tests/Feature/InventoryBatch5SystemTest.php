<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryBatch5SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch5-test')->plainTextToken];
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    public function test_inventory_dashboard_requires_the_inventory_role(): void
    {
        $this->getJson('/api/inventory/dashboard')->assertStatus(401);

        $customer = $this->staff('customer');
        $this->withHeaders($this->headers($customer))->getJson('/api/inventory/dashboard')->assertForbidden();

        $cashier = $this->staff('cashier');
        $this->withHeaders($this->headers($cashier))->getJson('/api/inventory/dashboard')->assertForbidden();

        $inventory = $this->staff('inventory');
        $this->withHeaders($this->headers($inventory))->getJson('/api/inventory/dashboard')->assertOk();
    }

    public function test_inventory_lists_items_and_stock_views(): void
    {
        $inventory = $this->staff('inventory');
        $headers = $this->headers($inventory);

        $this->withHeaders($headers)->getJson('/api/inventory/items')->assertOk();
        $this->withHeaders($headers)->getJson('/api/inventory/low-stock')->assertOk();
        $this->withHeaders($headers)->getJson('/api/inventory/expiry-alerts')->assertOk();
        $this->withHeaders($headers)->getJson('/api/inventory/history')->assertOk();
    }

    public function test_inventory_reports_and_audit_views_respond(): void
    {
        $inventory = $this->staff('inventory');
        $headers = $this->headers($inventory);

        $this->withHeaders($headers)->getJson('/api/inventory/reports/overview')->assertOk();
        $this->withHeaders($headers)->getJson('/api/inventory/reports/stock-levels')->assertOk();
        $this->withHeaders($headers)->getJson('/api/inventory/monthly-audit')->assertOk();
        $this->withHeaders($headers)->getJson('/api/inventory/audit-analytics')->assertOk();
    }

    public function test_inventory_item_creation_validates_input(): void
    {
        $inventory = $this->staff('inventory');
        $invalid = $this->withHeaders($this->headers($inventory))->postJson('/api/inventory/items', []);
        $invalid->assertStatus(422);
    }

    public function test_admin_and_super_receptionist_reach_inventory(): void
    {
        $admin = $this->staff('admin');
        $this->withHeaders($this->headers($admin))->getJson('/api/inventory/items')->assertOk();

        // The composite role resolves inventory access through the role middleware.
        $super = $this->staff('super_receptionist');
        $this->withHeaders($this->headers($super))->getJson('/api/inventory/items')->assertOk();
    }
}
