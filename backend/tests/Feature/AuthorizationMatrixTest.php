<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Models\VetAppointment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * RBAC matrix enforcement: every critical operation must reject unauthorized
 * roles with 403 AND produce no state change.
 */
class AuthorizationMatrixTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'manager', 'admin', 'super_admin', 'super_receptionist'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    private function pendingServiceRequest(): ServiceRequest
    {
        return ServiceRequest::create([
            'customer_id' => $this->users['customer']->id,
            'customer_name' => $this->users['customer']->name,
            'customer_email' => $this->users['customer']->email,
            'pet_name' => 'Buddy',
            'request_type' => 'grooming',
            'service_name' => 'Full Groom',
            'price' => 500,
            'total_amount' => 500,
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_proof' => 'payment-proofs/proof_test.png',
        ]);
    }

    private function pendingBoarding(): Boarding
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => now()->addDay()->toDateString(),
            'check_out' => now()->addDays(3)->toDateString(),
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);
    }

    private function admittedConfinement(): MedicalConfinement
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $this->users['veterinary']->id,
        ]);

        return MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'vet_id' => $this->users['veterinary']->id,
            'diagnosis' => 'RBAC test',
            'reason_for_confinement' => 'Test',
            'status' => 'admitted',
            'payment_status' => 'unpaid',
        ]);
    }

    public function test_payment_verification_is_cashier_only(): void
    {
        foreach (['customer', 'receptionist', 'inventory', 'veterinary', 'manager'] as $role) {
            $request = $this->pendingServiceRequest();

            $this->as($role)->postJson("/api/cashier/payment-requests/{$request->id}/verify", [
                'type' => 'service_request',
                'reference_number' => 'REF123456',
            ])->assertForbidden();

            $this->assertSame('pending', $request->fresh()->payment_status, "{$role} must not change payment_status");
        }

        // Positive control
        $request = $this->pendingServiceRequest();
        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$request->id}/verify", [
            'type' => 'service_request',
            'reference_number' => 'REF123456',
        ])->assertOk();
        $this->assertSame('paid', $request->fresh()->payment_status);
    }

    public function test_payment_rejection_is_cashier_only(): void
    {
        foreach (['customer', 'receptionist', 'inventory', 'veterinary', 'manager'] as $role) {
            $request = $this->pendingServiceRequest();

            $this->as($role)->postJson("/api/cashier/payment-requests/{$request->id}/reject", [
                'type' => 'service_request',
                'rejection_reason' => 'Not valid',
            ])->assertForbidden();

            $this->assertSame('pending', $request->fresh()->payment_status, "{$role} must not change payment_status");
        }
    }

    public function test_pos_checkout_and_void_are_cashier_only(): void
    {
        $product = InventoryItem::create([
            'sku' => 'RBAC-001', 'name' => 'RBAC Product', 'category' => 'Food',
            'price' => 100, 'stock' => 10, 'reorder_level' => 2, 'status' => 'active',
        ]);
        $customer = Customer::create(['name' => 'W', 'email' => 'w@example.com']);
        $payload = [
            'customer_id' => $customer->id,
            'items' => [['item_id' => $product->id, 'item_type' => 'product', 'item_name' => 'RBAC Product', 'quantity' => 1, 'unit_price' => 100]],
            'payment_method' => 'cash',
            'cash_received' => 100,
        ];

        foreach (['customer', 'receptionist', 'inventory', 'veterinary', 'manager'] as $role) {
            $this->as($role)->postJson('/api/cashier/pos/transaction', $payload)->assertForbidden();
            $this->assertSame(10, $product->fresh()->stock, "{$role} must not deduct stock");
            $this->assertDatabaseCount('sales', 0);
        }

        // Positive control + void negative checks
        $saleId = $this->as('cashier')->postJson('/api/cashier/pos/transaction', $payload)->assertOk()->json('transaction.id');

        foreach (['receptionist', 'manager', 'customer'] as $role) {
            $this->as($role)->postJson("/api/cashier/pos/transaction/{$saleId}/void", ['reason' => 'nope'])->assertForbidden();
        }
        $this->assertNotSame('cancelled', \App\Models\Sale::find($saleId)->status);
    }

    public function test_inventory_adjustment_is_inventory_or_admin_only(): void
    {
        $item = InventoryItem::create([
            'sku' => 'RBAC-002', 'name' => 'RBAC Item', 'category' => 'Food',
            'price' => 50, 'stock' => 10, 'reorder_level' => 2, 'status' => 'active',
        ]);

        foreach (['customer', 'receptionist', 'cashier', 'veterinary', 'manager'] as $role) {
            $this->as($role)->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
                'quantity' => 5, 'type' => 'in', 'reason' => 'nope',
            ])->assertForbidden();
            $this->assertSame(10, $item->fresh()->stock, "{$role} must not adjust stock");
        }
    }

    public function test_boarding_approval_is_receptionist_only(): void
    {
        foreach (['customer', 'cashier', 'inventory', 'veterinary', 'manager'] as $role) {
            $boarding = $this->pendingBoarding();

            $this->as($role)->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")->assertForbidden();
            $this->assertSame('pending', $boarding->fresh()->status, "{$role} must not approve boardings");
        }
    }

    public function test_confinement_status_change_is_veterinary_only(): void
    {
        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'manager'] as $role) {
            $confinement = $this->admittedConfinement();

            $this->as($role)->postJson("/api/veterinary/medical-confinements/{$confinement->id}/mark-under-observation")->assertForbidden();
            $this->assertSame('admitted', $confinement->fresh()->status, "{$role} must not change confinement status");
        }
    }

    public function test_user_management_is_admin_only(): void
    {
        $payload = [
            'name' => 'New User', 'email' => 'new@example.com', 'username' => 'newuser',
            'password' => 'Password123!', 'role' => 'cashier',
        ];

        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'manager'] as $role) {
            $this->as($role)->postJson('/api/admin/users', $payload)->assertForbidden();
            $this->as($role)->putJson("/api/admin/users/{$this->users['customer']->id}", ['role' => 'admin'])->assertForbidden();
            $this->as($role)->deleteJson("/api/admin/users/{$this->users['customer']->id}")->assertForbidden();
        }

        $this->assertDatabaseMissing('users', ['email' => 'new@example.com']);
        $this->assertSame('customer', $this->users['customer']->fresh()->role);
    }

    public function test_vet_appointment_hard_delete_is_admin_only(): void
    {
        $appt = VetAppointment::create([
            'pet_name' => 'Buddy', 'service' => 'Checkup',
            'appointment_date' => now()->addDay()->toDateString(), 'status' => 'pending',
        ]);

        $this->as('receptionist')->deleteJson("/api/vet/{$appt->id}")->assertForbidden();
        $this->as('customer')->deleteJson("/api/vet/{$appt->id}")->assertForbidden();
        $this->assertDatabaseHas('vet_appointments', ['id' => $appt->id]);

        $this->as('admin')->deleteJson("/api/vet/{$appt->id}")->assertOk();
        $this->assertSoftDeleted('vet_appointments', ['id' => $appt->id]);
    }

    public function test_attendance_punch_is_staff_only(): void
    {
        $this->as('customer')->postJson('/api/attendance/check-in')->assertForbidden();
        $this->assertDatabaseCount('attendance', 0);

        $this->as('cashier')->postJson('/api/attendance/check-in')->assertOk();
    }

    public function test_public_sellable_catalog_does_not_expose_internal_fields(): void
    {
        InventoryItem::create([
            'sku' => 'RBAC-003', 'name' => 'Public Item', 'category' => 'Food',
            'price' => 50, 'stock' => 5, 'reorder_level' => 2, 'status' => 'active',
            'is_sellable' => true, 'supplier' => 'Secret Supplier Co',
        ]);

        $product = $this->getJson('/api/inventory/sellable')->assertOk()->json('products.0');

        $this->assertArrayNotHasKey('supplier', $product);
        $this->assertArrayNotHasKey('reorder_level', $product);
        $this->assertSame('Public Item', $product['name']);
    }

    public function test_super_admin_reaches_staff_routes_but_not_customer_routes(): void
    {
        // Staff route bypass
        $this->as('super_admin')->getJson('/api/cashier/payment-requests')->assertOk();
        $this->as('super_admin')->getJson('/api/admin/users')->assertOk();

        // Customer-only routes are still blocked
        $this->as('super_admin')->getJson('/api/customer/pets')->assertForbidden();
    }

    public function test_super_receptionist_expands_to_receptionist_cashier_inventory_only(): void
    {
        $this->as('super_receptionist')->getJson('/api/cashier/payment-requests')->assertOk();
        $this->as('super_receptionist')->getJson('/api/receptionist/requests')->assertOk();
        $this->as('super_receptionist')->getJson('/api/inventory/items')->assertOk();

        $this->as('super_receptionist')->getJson('/api/admin/users')->assertForbidden();
        $this->as('super_receptionist')->getJson('/api/manager/dashboard')->assertForbidden();
        $this->as('super_receptionist')->getJson('/api/customer/pets')->assertForbidden();
        $this->as('super_receptionist')->getJson('/api/veterinary/appointments')->assertForbidden();
    }
}
