<?php

namespace Tests\Feature;

use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Receptionist-role authorization matrix.
 *
 * Verifies that the `receptionist` role can reach its own module surface
 * (`/api/receptionist/*`) and is blocked — by the backend, not just hidden
 * buttons — from cashier, inventory, veterinary, manager, admin, and customer
 * capabilities. Also covers unauthenticated access, cross-role writes,
 * actor-field spoofing, and the approved customer-order descope (410).
 */
class ReceptionistRoleAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('recep-auth-test')->plainTextToken];
    }

    /** @return array<string,string> method => uri */
    private function allowedReads(): array
    {
        return [
            'GET dashboard' => '/api/receptionist/dashboard',
            'GET appointments' => '/api/receptionist/appointments',
            'GET customers' => '/api/receptionist/customers',
            'GET requests' => '/api/receptionist/requests',
            'GET requests/pending' => '/api/receptionist/requests/pending',
            'GET walk-ins' => '/api/receptionist/walk-ins',
            'GET boarding-requests' => '/api/receptionist/boarding-requests',
            'GET medical-confinements' => '/api/receptionist/medical-confinements',
            'GET services' => '/api/receptionist/services',
            'GET boarding-rooms' => '/api/receptionist/boarding-rooms',
            'GET hotel-rooms' => '/api/receptionist/hotel-rooms',
            'GET reports/live' => '/api/receptionist/reports/live',
            'GET reports/overview' => '/api/receptionist/reports/overview',
            'GET reports/service-requests' => '/api/receptionist/reports/service-requests',
            'GET reports/customer-orders' => '/api/receptionist/reports/customer-orders',
        ];
    }

    /** @return array<string,array{0:string,1:string,2:array}> label => [method, uri, payload] */
    private function forbiddenOps(): array
    {
        return [
            // Cashier scope
            'cashier POS transaction' => ['POST', '/api/cashier/pos/transaction', ['items' => [], 'payment_method' => 'cash']],
            'cashier payment queue' => ['GET', '/api/cashier/payment-requests', []],
            'cashier verify payment' => ['POST', '/api/cashier/payment-requests/1/verify', []],
            // Inventory scope
            'inventory items' => ['GET', '/api/inventory/items', []],
            'inventory adjust stock' => ['POST', '/api/inventory/items/1/adjust-stock', ['quantity' => 5, 'reason' => 'x']],
            // Veterinary scope
            'vet appointments' => ['GET', '/api/veterinary/appointments', []],
            // Manager scope
            'manager dashboard' => ['GET', '/api/manager/dashboard', []],
            'manager payroll' => ['GET', '/api/manager/payroll', []],
            // Admin scope
            'admin users' => ['GET', '/api/admin/users', []],
            'admin user create' => ['POST', '/api/admin/users', ['name' => 'x', 'email' => 'x@x.com', 'password' => 'x']],
            // Customer scope
            'customer store orders' => ['GET', '/api/customer/store/orders', []],
        ];
    }

    public function test_receptionist_can_read_own_module(): void
    {
        $headers = $this->headers($this->user('receptionist'));

        foreach ($this->allowedReads() as $label => $uri) {
            $response = $this->getJson($uri, $headers);
            $this->assertTrue(
                in_array($response->getStatusCode(), [200, 201], true),
                "{$label} ({$uri}) returned {$response->getStatusCode()} — expected 2xx for receptionist role"
            );
        }
    }

    public function test_receptionist_is_forbidden_from_other_role_operations(): void
    {
        $headers = $this->headers($this->user('receptionist'));

        foreach ($this->forbiddenOps() as $label => [$method, $uri, $payload]) {
            $response = $this->json($method, $uri, $payload, $headers);
            $this->assertSame(
                403,
                $response->getStatusCode(),
                "{$label} ({$method} {$uri}) returned {$response->getStatusCode()} — expected 403 for receptionist role"
            );
        }
    }

    public function test_unauthenticated_requests_get_401(): void
    {
        $this->getJson('/api/receptionist/dashboard')->assertStatus(401);
        $this->getJson('/api/receptionist/requests')->assertStatus(401);
        $this->postJson('/api/receptionist/requests', [])->assertStatus(401);
    }

    public function test_other_roles_cannot_access_receptionist_endpoints(): void
    {
        foreach (['customer', 'cashier', 'inventory', 'veterinary', 'manager'] as $role) {
            $headers = $this->headers($this->user($role));

            $this->getJson('/api/receptionist/dashboard', $headers)->assertStatus(403);
            $this->getJson('/api/receptionist/requests', $headers)->assertStatus(403);
            $this->postJson('/api/receptionist/requests', [], $headers)->assertStatus(403);
        }
    }

    public function test_admin_can_access_receptionist_endpoints(): void
    {
        $headers = $this->headers($this->user('admin'));

        $this->getJson('/api/receptionist/dashboard', $headers)->assertStatus(200);
        $this->getJson('/api/receptionist/requests', $headers)->assertStatus(200);
    }

    public function test_super_receptionist_composite_reaches_receptionist(): void
    {
        $headers = $this->headers($this->user('super_receptionist'));

        $this->getJson('/api/receptionist/dashboard', $headers)->assertStatus(200);
        $this->getJson('/api/receptionist/requests', $headers)->assertStatus(200);
    }

    public function test_customer_order_mutations_return_410_descoped(): void
    {
        $headers = $this->headers($this->user('receptionist'));

        $this->postJson('/api/receptionist/customer-orders/1/approve', [], $headers)->assertStatus(410);
        $this->postJson('/api/receptionist/customer-orders/1/reject', [], $headers)->assertStatus(410);
        $this->postJson('/api/receptionist/customer-orders/1/cancel', [], $headers)->assertStatus(410);
    }

    public function test_customer_order_reads_remain_available(): void
    {
        $headers = $this->headers($this->user('receptionist'));

        $this->getJson('/api/receptionist/customer-orders', $headers)->assertStatus(200);
        $this->getJson('/api/receptionist/orders/approval-history', $headers)->assertStatus(200);
    }

    public function test_store_rejects_direct_approval_status(): void
    {
        $user = $this->user('receptionist');
        $customer = \App\Models\Customer::factory()->create(['user_id' => $user->id]);
        $pet = \App\Models\Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        $response = $this->postJson('/api/receptionist/requests', [
            'pet_id' => $pet->id,
            'service_name' => 'Grooming',
            'request_type' => 'grooming',
            'status' => 'approved',
        ], $headers);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('service_requests', [
            'service_name' => 'Grooming',
            'status' => 'approved',
        ]);
    }

    public function test_walk_in_defaults_to_unpaid_payment_status(): void
    {
        $user = $this->user('receptionist');
        $customer = \App\Models\Customer::factory()->create(['user_id' => $user->id]);
        $pet = \App\Models\Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        $this->postJson('/api/receptionist/requests', [
            'pet_id' => $pet->id,
            'service_name' => 'Grooming',
            'request_type' => 'grooming',
        ], $headers)->assertStatus(201);

        $this->assertDatabaseHas('service_requests', [
            'service_name' => 'Grooming',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);
    }

    public function test_pet_hotel_type_recognized_as_hotel(): void
    {
        $user = $this->user('receptionist');
        $customer = \App\Models\Customer::factory()->create(['user_id' => $user->id]);
        $pet = \App\Models\Pet::factory()->create(['customer_id' => $customer->id]);
        $headers = $this->headers($user);

        $this->postJson('/api/receptionist/requests', [
            'pet_id' => $pet->id,
            'service_name' => 'Hotel',
            'request_type' => 'pet_hotel',
            'request_date' => '2026-12-01',
            'check_out_date' => '2026-12-03',
        ], $headers)->assertStatus(201);

        $this->assertDatabaseHas('service_requests', [
            'request_type' => 'pet_hotel',
            'status' => 'scheduled',
        ]);
    }
}
