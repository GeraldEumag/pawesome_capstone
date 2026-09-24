<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private function actingWithToken(User $user): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken]);
    }

    private function pendingServiceRequest(User $customer): ServiceRequest
    {
        return ServiceRequest::create([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
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

    public function test_payment_verification_writes_audit_record(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $customer = User::factory()->create(['role' => 'customer']);
        $request = $this->pendingServiceRequest($customer);

        $this->actingWithToken($cashier)
            ->postJson("/api/cashier/payment-requests/{$request->id}/verify", [
                'type' => 'service_request',
                'reference_number' => 'REF123456',
                'payment_method' => 'GCash',
            ])->assertOk();

        $log = ActivityLog::where('action', 'payment_verified')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame($cashier->id, $log->user_id);
        $this->assertSame('cashier', $log->actor_role);
        $this->assertSame('service_request', $log->reference_type);
        $this->assertSame((string) $request->id, (string) $log->reference_id);
        $this->assertSame('pending', $log->changes['payment_status']['old']);
        $this->assertSame('paid', $log->changes['payment_status']['new']);
        $this->assertNotNull($log->ip_address);
    }

    public function test_payment_rejection_writes_audit_record_with_reason(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $customer = User::factory()->create(['role' => 'customer']);
        $request = $this->pendingServiceRequest($customer);

        $this->actingWithToken($cashier)
            ->postJson("/api/cashier/payment-requests/{$request->id}/reject", [
                'type' => 'service_request',
                'rejection_reason' => 'Illegible proof image',
            ])->assertOk();

        $log = ActivityLog::where('action', 'payment_rejected')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame($cashier->id, $log->user_id);
        $this->assertSame('cashier', $log->actor_role);
        $this->assertSame('rejected', $log->changes['payment_status']['new']);
        $this->assertSame('Illegible proof image', $log->metadata['rejection_reason']);
    }

    public function test_unauthorized_role_cannot_verify_payment_and_nothing_is_logged(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $customer = User::factory()->create(['role' => 'customer']);
        $request = $this->pendingServiceRequest($customer);

        $this->actingWithToken($receptionist)
            ->postJson("/api/cashier/payment-requests/{$request->id}/verify", [
                'reference_number' => 'REF123456',
            ])->assertForbidden();

        $this->assertSame('pending', $request->fresh()->payment_status);
        $this->assertDatabaseMissing('activity_logs', ['action' => 'payment_verified']);
    }

    public function test_boarding_approval_writes_audit_record(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $boarding = Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => now()->addDay()->toDateString(),
            'check_out' => now()->addDays(3)->toDateString(),
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);

        $this->actingWithToken($receptionist)
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")
            ->assertOk();

        $log = ActivityLog::where('action', 'boarding_approved')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame($receptionist->id, $log->user_id);
        $this->assertSame('receptionist', $log->actor_role);
        $this->assertSame('pending', $log->changes['status']['old']);
        $this->assertSame('approved', $log->changes['status']['new']);
    }

    public function test_pos_sale_and_void_are_audited(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $customer = Customer::create(['name' => 'Walk-in', 'email' => 'walkin@example.com']);
        $product = InventoryItem::create([
            'sku' => 'PROD-AUDIT-1',
            'name' => 'Audit Product',
            'category' => 'Food',
            'price' => 500,
            'stock' => 20,
            'reorder_level' => 5,
            'status' => 'active',
        ]);

        $response = $this->actingWithToken($cashier)->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $customer->id,
            'items' => [[
                'item_id' => $product->id,
                'item_type' => 'product',
                'item_name' => $product->name,
                'quantity' => 1,
                'unit_price' => 500,
            ]],
            'payment_method' => 'cash',
            'cash_received' => 500,
        ])->assertOk();

        $saleId = $response->json('transaction.id');

        $saleLog = ActivityLog::where('action', 'pos_sale_completed')->latest('id')->first();
        $this->assertNotNull($saleLog);
        $this->assertSame($cashier->id, $saleLog->user_id);
        $this->assertSame('cashier', $saleLog->actor_role);
        $this->assertSame('sale', $saleLog->reference_type);
        $this->assertSame(500.0, (float) $saleLog->metadata['total_amount']);

        $this->actingWithToken($cashier)
            ->postJson("/api/cashier/pos/transaction/{$saleId}/void", ['reason' => 'Wrong item rung up'])
            ->assertOk();

        $voidLog = ActivityLog::where('action', 'pos_sale_voided')->latest('id')->first();
        $this->assertNotNull($voidLog);
        $this->assertSame('cancelled', $voidLog->changes['status']['new']);
        $this->assertSame('Wrong item rung up', $voidLog->metadata['reason']);
    }

    public function test_admin_user_role_change_is_audited_with_old_and_new(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['role' => 'cashier']);

        $this->actingWithToken($admin)
            ->putJson("/api/admin/users/{$target->id}", ['role' => 'manager'])
            ->assertOk();

        $log = ActivityLog::where('action', 'user_updated')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->user_id);
        $this->assertSame('admin', $log->actor_role);
        $this->assertSame('user', $log->reference_type);
        $this->assertSame('cashier', $log->changes['role']['old']);
        $this->assertSame('manager', $log->changes['role']['new']);
    }

    public function test_confinement_status_change_is_audited(): void
    {
        $veterinarian = User::factory()->create(['role' => 'veterinary']);
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $veterinarian->id,
        ]);
        $confinement = MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'vet_id' => $veterinarian->id,
            'diagnosis' => 'Audit test',
            'reason_for_confinement' => 'Test',
            'status' => 'admitted',
            'payment_status' => 'unpaid',
        ]);

        $this->actingWithToken($veterinarian)
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/mark-under-observation")
            ->assertOk();

        $log = ActivityLog::where('action', 'confinement_status_changed')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame($veterinarian->id, $log->user_id);
        $this->assertSame('veterinary', $log->actor_role);
        $this->assertSame('admitted', $log->changes['status']['old']);
        $this->assertSame('under_observation', $log->changes['status']['new']);
    }

    public function test_audit_log_read_access_is_admin_and_manager_only(): void
    {
        ActivityLog::log(null, 'seed_event', 'seed');

        $admin = User::factory()->create(['role' => 'admin']);
        $manager = User::factory()->create(['role' => 'manager']);
        $cashier = User::factory()->create(['role' => 'cashier']);
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingWithToken($admin)->getJson('/api/admin/activity-logs')->assertOk();
        $this->actingWithToken($manager)->getJson('/api/admin/activity-logs')->assertOk();

        $this->actingWithToken($cashier)->getJson('/api/admin/activity-logs')->assertForbidden();
        $this->actingWithToken($customer)->getJson('/api/admin/activity-logs')->assertForbidden();
        $this->getJson('/api/admin/activity-logs')->assertForbidden();

        // Audit trail is read-only — there is no write endpoint.
        $this->actingWithToken($admin)
            ->postJson('/api/admin/activity-logs', ['action' => 'forged'])
            ->assertStatus(405);
    }

    public function test_sensitive_fields_are_redacted_from_audit_metadata(): void
    {
        $user = User::factory()->create(['role' => 'admin']);

        $log = ActivityLog::log($user->id, 'test_action', 'desc', [
            'metadata' => [
                'password' => 'super-secret',
                'api_token' => 'tok-abc',
                'payment_proof' => 'proofs/secret.png',
                'note' => 'safe value',
            ],
        ]);

        $this->assertSame('[redacted]', $log->metadata['password']);
        $this->assertSame('[redacted]', $log->metadata['api_token']);
        $this->assertSame('[redacted]', $log->metadata['payment_proof']);
        $this->assertSame('safe value', $log->metadata['note']);
        $this->assertSame('admin', $log->actor_role);
    }
}
