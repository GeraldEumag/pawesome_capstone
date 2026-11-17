<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the Manager report reconciliation findings:
 *  - revenue must come from the multi-source RevenueService, not the POS
 *    `sales` table alone (summary / dashboard / executive-summary showed 0
 *    while overview showed the paid service total);
 *  - `service_requests.total_amount` is only populated for boarding rows —
 *    readers must fall back per row to `price` (payments report showed
 *    amount NULL / ₱0 for a paid gcash request);
 *  - the services report must not double-count a request that has a linked
 *    fulfillment record, and the customers report must not double-count a
 *    customer user that already has a `customers` row.
 */
class ManagerReportReconciliationTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected string $adminToken;
    protected User $manager;
    protected string $managerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => 'admin',
            'email' => 'admin@test.com',
            'name' => 'Admin User',
        ]);
        $this->adminToken = $this->admin->createToken('admin-token')->plainTextToken;

        $this->manager = User::factory()->create([
            'role' => 'manager',
            'email' => 'manager@test.com',
            'name' => 'Manager User',
        ]);
        $this->managerToken = $this->manager->createToken('manager-token')->plainTextToken;
    }

    protected function adminAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->adminToken];
    }

    protected function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function paidServiceRequest(array $overrides = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'customer_name' => 'Walk In Customer',
            'customer_email' => 'walkin@example.com',
            'pet_name' => 'Buddy',
            'request_type' => 'grooming',
            'service_name' => 'Full Groom',
            'price' => 700,
            // total_amount intentionally left NULL — regular service rows
            // only carry `price`; boarding rows populate total_amount.
            'status' => 'approved',
            'payment_status' => 'paid',
            'payment_method' => 'gcash',
            'payment_reference' => 'REF-TEST-1',
        ], $overrides));
    }

    public function test_summary_total_revenue_counts_paid_service_requests(): void
    {
        $this->paidServiceRequest();

        $response = $this->getJson('/api/admin/reports/summary', $this->adminAuth());

        $response->assertStatus(200);
        $this->assertSame(700.0, (float) $response->json('data.total_revenue'));
        $this->assertSame(700.0, (float) $response->json('data.today_revenue'));
        $this->assertSame(1, $response->json('data.total_transactions'));
        $this->assertSame(1, $response->json('data.today_transactions'));
    }

    public function test_manager_summary_matches_admin_summary_revenue(): void
    {
        $this->paidServiceRequest();

        $response = $this->getJson('/api/manager/reports/summary', $this->managerAuth());

        $response->assertStatus(200);
        $this->assertSame(700.0, (float) $response->json('data.total_revenue'));
    }

    public function test_payments_report_falls_back_to_price_when_total_amount_null(): void
    {
        $this->paidServiceRequest();

        $response = $this->getJson('/api/admin/reports/payments', $this->adminAuth());

        $response->assertStatus(200);
        $this->assertSame(700.0, (float) $response->json('summary.total_amount'));

        $payment = collect($response->json('data.payments'))->firstWhere('id');
        $this->assertSame(700.0, (float) $payment['amount']);
        $this->assertSame('service_request', $payment['association_type']);
    }

    public function test_services_report_does_not_double_count_fulfilled_request(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $request = $this->paidServiceRequest([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'veterinary',
            'service_name' => 'General Check-up',
        ]);

        Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => Service::factory()->create(['name' => 'General Check-up'])->id,
            'service_request_id' => $request->id,
            'status' => 'completed',
            'scheduled_at' => now(),
            'price' => 700,
            'total_amount' => 700,
            'payment_status' => 'paid',
        ]);

        $response = $this->getJson('/api/admin/reports/services', $this->adminAuth());

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('data.summary.total_requests'));

        $rows = collect($response->json('data.requests'));
        $this->assertCount(1, $rows);
        $this->assertSame('appointment', $rows->first()['source']);
        $this->assertSame('paid', $rows->first()['payment_status']);
    }

    public function test_services_report_keeps_unlinked_request_row(): void
    {
        $this->paidServiceRequest();

        $response = $this->getJson('/api/admin/reports/services', $this->adminAuth());

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('data.summary.total_requests'));

        $row = collect($response->json('data.requests'))->first();
        $this->assertSame('service_request', $row['source']);
        $this->assertSame(700.0, (float) $row['amount']);
    }

    public function test_customers_report_does_not_double_count_linked_users(): void
    {
        $customerUser = User::factory()->create([
            'role' => 'customer',
            'email' => 'customer@test.com',
        ]);
        Customer::factory()->create(['user_id' => $customerUser->id]);

        $response = $this->getJson('/api/admin/reports/customers', $this->adminAuth());

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('data.summary.total_customers'));
    }

    public function test_executive_summary_uses_multi_source_revenue(): void
    {
        $this->paidServiceRequest();

        $response = $this->getJson('/api/manager/executive-summary', $this->managerAuth());

        $response->assertStatus(200);
        $this->assertSame(700.0, (float) $response->json('financial_metrics.today_revenue'));
        $this->assertSame(700.0, (float) $response->json('financial_metrics.monthly_revenue'));
        $this->assertSame(700.0, (float) $response->json('financial_metrics.yearly_revenue'));
    }

    public function test_manager_dashboard_today_revenue_matches_payment(): void
    {
        $this->paidServiceRequest();

        $response = $this->getJson('/api/manager/dashboard', $this->managerAuth());

        $response->assertStatus(200);
        $this->assertSame(700.0, (float) $response->json('today_revenue'));
        $this->assertSame(700.0, (float) $response->json('monthly_revenue'));
    }

    public function test_revenue_is_not_double_counted_for_request_with_paid_appointment(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $request = $this->paidServiceRequest([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'request_type' => 'veterinary',
        ]);

        Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => Service::factory()->create(['name' => 'General Check-up'])->id,
            'service_request_id' => $request->id,
            'status' => 'completed',
            'scheduled_at' => now(),
            'price' => 700,
            'total_amount' => 700,
            'payment_status' => 'paid',
        ]);

        $response = $this->getJson('/api/admin/reports/summary', $this->adminAuth());

        $response->assertStatus(200);
        // One logical payment (₱700) — not ₱1,400.
        $this->assertSame(700.0, (float) $response->json('data.total_revenue'));
    }
}
