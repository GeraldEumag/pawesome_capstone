<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Selective soft-delete retention policy:
 * operational/master-data rows soft-delete (history preserved),
 * financial and audit records remain immutable.
 */
class SoftDeleteRetentionTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'cashier', 'admin'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    public function test_deleted_user_disappears_from_normal_queries_and_api(): void
    {
        $target = User::factory()->create(['role' => 'customer']);

        $this->as('admin')->deleteJson("/api/admin/users/{$target->id}")->assertOk();

        $this->assertSoftDeleted('users', ['id' => $target->id]);
        $this->assertNull(User::find($target->id));

        $ids = collect($this->as('admin')->getJson('/api/admin/users')->json('data'));
        $this->assertFalse($ids->contains('id', $target->id));
    }

    public function test_deleted_user_cannot_authenticate(): void
    {
        $target = User::factory()->create(['role' => 'cashier']);
        $token = $target->createToken('t')->plainTextToken;

        $this->as('admin')->deleteJson("/api/admin/users/{$target->id}")->assertOk();

        $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->getJson('/api/auth/me')
            ->assertUnauthorized();
    }

    public function test_admin_can_restore_soft_deleted_user_and_restore_is_idempotent(): void
    {
        $target = User::factory()->create(['role' => 'customer']);

        $this->as('admin')->deleteJson("/api/admin/users/{$target->id}")->assertOk();
        $this->as('admin')->postJson("/api/admin/users/{$target->id}/restore")->assertOk();

        $this->assertNull($target->fresh()->deleted_at);

        // Repeated restore is a no-op 404, repeated delete still works
        $this->as('admin')->postJson("/api/admin/users/{$target->id}/restore")->assertNotFound();
        $this->as('admin')->deleteJson("/api/admin/users/{$target->id}")->assertOk();
        $this->as('admin')->deleteJson("/api/admin/users/{$target->id}")->assertNotFound();
    }

    public function test_non_admin_cannot_delete_or_restore_users(): void
    {
        $target = User::factory()->create(['role' => 'customer']);

        foreach (['customer', 'receptionist', 'cashier'] as $role) {
            $this->as($role)->deleteJson("/api/admin/users/{$target->id}")->assertForbidden();
            $this->as($role)->postJson("/api/admin/users/{$target->id}/restore")->assertForbidden();
        }
        $this->assertNull($target->fresh()->deleted_at);
    }

    public function test_salary_route_cannot_delete_admin_self_or_users_with_records(): void
    {
        $admin = $this->users['admin'];
        $this->as('admin')->deleteJson("/api/admin/salaries/{$admin->id}")->assertForbidden();
        $this->assertNull($admin->fresh()->deleted_at);

        // Guards traverse User -> Customer (customers.user_id) -> pets/appointments/boardings.
        $owner = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $owner->id]);
        Pet::factory()->create(['customer_id' => $customer->id]);

        $this->as('admin')->deleteJson("/api/admin/salaries/{$owner->id}")->assertStatus(422);
        $this->as('admin')->deleteJson("/api/admin/users/{$owner->id}")->assertStatus(422);
        $this->assertNull($owner->fresh()->deleted_at);
    }

    public function test_user_with_linked_customer_boarding_is_blocked_from_delete(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $owner->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        \App\Models\Boarding::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'check_in' => now()->addDay()->toDateString(),
            'status' => 'approved',
        ]);

        $this->as('admin')->deleteJson("/api/admin/users/{$owner->id}")->assertStatus(422);
        $this->assertNull($owner->fresh()->deleted_at);
    }

    public function test_deleted_customer_disappears_and_can_be_restored(): void
    {
        $customer = Customer::factory()->create();

        $this->as('admin')->deleteJson("/api/admin/customers/{$customer->id}")->assertOk();
        $this->assertSoftDeleted('customers', ['id' => $customer->id]);
        $this->assertNull(Customer::find($customer->id));

        $this->as('admin')->postJson("/api/admin/customers/{$customer->id}/restore")->assertOk();
        $this->assertNull($customer->fresh()->deleted_at);
    }

    public function test_soft_deleted_service_and_supplier_are_hidden_from_queries(): void
    {
        $service = Service::factory()->create();
        $supplier = Supplier::create(['name' => 'Test Supplier', 'email' => 'sup@example.com']);

        $service->delete();
        $supplier->delete();

        $this->assertSoftDeleted('services', ['id' => $service->id]);
        $this->assertSoftDeleted('suppliers', ['id' => $supplier->id]);
        $this->assertNull(Service::find($service->id));
        $this->assertNull(Supplier::find($supplier->id));
    }

    public function test_customer_pet_delete_is_soft_and_preserves_row(): void
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        // Pet with no active bookings → soft delete via portal
        $pet->delete();

        $this->assertSoftDeleted('pets', ['id' => $pet->id]);
        $this->assertNull(Pet::find($pet->id));
        $this->assertNotNull(Pet::withTrashed()->find($pet->id));
    }

    public function test_financial_and_audit_records_have_no_soft_delete(): void
    {
        $this->assertFalse(
            (new Payment)->getConnection()->getSchemaBuilder()->hasColumn('payments', 'deleted_at')
        );
        $this->assertFalse(
            (new Sale)->getConnection()->getSchemaBuilder()->hasColumn('sales', 'deleted_at')
        );
        $this->assertFalse(
            (new ActivityLog)->getConnection()->getSchemaBuilder()->hasColumn('activity_logs', 'deleted_at')
        );

        // No DELETE routes exist for payments/sales/activity-logs (404 or 405)
        foreach (['/api/admin/payments/1', '/api/admin/sales/1', '/api/admin/activity-logs/1'] as $uri) {
            $status = $this->as('admin')->deleteJson($uri)->status();
            $this->assertContains($status, [404, 405], "DELETE {$uri} should not be routable");
        }
    }

    public function test_reports_do_not_count_soft_deleted_records(): void
    {
        $service = Service::factory()->create(['is_active' => true]);
        $initialCount = Service::count();

        $service->delete();

        $this->assertSame($initialCount - 1, Service::count());
        $this->assertNotNull(Service::withTrashed()->find($service->id));

        $service->restore();
        $this->assertSame($initialCount, Service::count());
    }
}
