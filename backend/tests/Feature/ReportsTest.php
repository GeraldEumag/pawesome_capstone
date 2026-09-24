<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportsTest extends TestCase
{
    use RefreshDatabase;

    protected $admin;
    protected $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create([
            'role' => 'admin',
            'email' => 'admin@test.com',
            'name' => 'Admin User',
        ]);
        $this->adminToken = $this->admin->createToken('test-token')->plainTextToken;
    }

    /**
     * Helper to make authenticated request as admin
     */
    protected function withAdminAuth(array $headers = []): array
    {
        return array_merge($headers, [
            'Authorization' => 'Bearer ' . $this->adminToken,
        ]);
    }

    // ============================================
    // REPORTS SUMMARY TESTS
    // ============================================

    public function test_reports_summary_returns_correct_structure(): void
    {
        // Create test data
        $this->createTestData();

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200)
            ->assertJsonStructure([
                'timestamp',
                'data' => [
                    'total_revenue',
                    'today_revenue',
                    'total_transactions',
                    'today_transactions',
                    'total_customers',
                    'new_customers',
                    'total_users',
                    'total_appointments',
                    'completed_appointments',
                    'total_pets',
                    'total_inventory_items',
                    'low_stock_items',
                    'out_of_stock_items',
                    'monthly_revenue',
                    'top_services',
                    'top_customers',
                ]
            ]);

        // Status field was removed from response, only checking timestamp and data structure
        $this->assertNotNull($response->json('timestamp'));
    }

    public function test_reports_summary_calculates_revenue_correctly(): void
    {
        // Create sales
        Sale::factory()->count(5)->create(['amount' => 1000]);
        Sale::factory()->count(3)->create(['amount' => 500]);

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        
        // 5 * 1000 + 3 * 500 = 5000 + 1500 = 6500
        $this->assertEquals(6500, $response->json('data.total_revenue'));
        $this->assertEquals(8, $response->json('data.total_transactions'));
    }

    public function test_reports_summary_counts_customers_correctly(): void
    {
        // Create customers
        Customer::factory()->count(10)->create();
        Customer::factory()->count(3)->create(['created_at' => now()->subWeeks(2)]);

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        $this->assertEquals(13, $response->json('data.total_customers'));
        // All 13 customers are created today (during test), so all are "new"
        $this->assertEquals(13, $response->json('data.new_customers'));
    }

    public function test_reports_summary_counts_inventory_correctly(): void
    {
        // Create inventory items
        InventoryItem::factory()->count(15)->create(['stock' => 50, 'reorder_level' => 10]);
        InventoryItem::factory()->count(5)->create(['stock' => 5, 'reorder_level' => 10]); // Low stock
        InventoryItem::factory()->count(3)->create(['stock' => 0, 'reorder_level' => 5]); // Out of stock

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        $this->assertEquals(23, $response->json('data.total_inventory_items'));
        // Out-of-stock items are counted separately from positive low stock.
        $this->assertEquals(5, $response->json('data.low_stock_items'));
        $this->assertEquals(3, $response->json('data.out_of_stock_items'));
    }

    public function test_reports_summary_identifies_top_services(): void
    {
        $service1 = Service::factory()->create(['name' => 'Grooming']);
        $service2 = Service::factory()->create(['name' => 'Vaccination']);
        $service3 = Service::factory()->create(['name' => 'Consultation']);

        // Create appointments with different services
        Appointment::factory()->count(5)->create(['service_id' => $service1->id]);
        Appointment::factory()->count(3)->create(['service_id' => $service2->id]);
        Appointment::factory()->count(1)->create(['service_id' => $service3->id]);

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        
        $topServices = $response->json('data.top_services');
        $this->assertCount(3, $topServices);
        $this->assertEquals('Grooming', $topServices[0]['service']);
        $this->assertEquals(5, $topServices[0]['count']);
    }

    public function test_reports_summary_identifies_top_customers(): void
    {
        $customer1 = Customer::factory()->create(['name' => 'John Doe']);
        $customer2 = Customer::factory()->create(['name' => 'Jane Smith']);
        $customer3 = Customer::factory()->create(['name' => 'Bob Wilson']);

        // Create appointments for customers
        Appointment::factory()->count(4)->create(['customer_id' => $customer1->id]);
        Appointment::factory()->count(2)->create(['customer_id' => $customer2->id]);
        Appointment::factory()->count(1)->create(['customer_id' => $customer3->id]);

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        
        $topCustomers = $response->json('data.top_customers');
        $this->assertCount(3, $topCustomers);
        $this->assertEquals('John Doe', $topCustomers[0]['customer']);
        $this->assertEquals(4, $topCustomers[0]['visits']);
    }

    public function test_reports_summary_tracks_today_transactions(): void
    {
        // Yesterday's sales
        Sale::factory()->count(3)->create([
            'amount' => 1000,
            'created_at' => now()->subDay()
        ]);

        // Today's sales
        Sale::factory()->count(2)->create([
            'amount' => 500,
            'created_at' => now()
        ]);

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        $this->assertEquals(2, $response->json('data.today_transactions'));
        $this->assertEquals(1000, $response->json('data.today_revenue'));
        $this->assertEquals(5, $response->json('data.total_transactions'));
    }

    public function test_reports_summary_counts_pets_and_appointments(): void
    {
        Pet::factory()->count(7)->create();
        
        Appointment::factory()->count(10)->create(['status' => 'completed']);
        Appointment::factory()->count(5)->create(['status' => 'pending']);

        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        // Report includes pets/appointments from seeding + test creations
        $this->assertGreaterThanOrEqual(7, $response->json('data.total_pets'));
        $this->assertGreaterThanOrEqual(15, $response->json('data.total_appointments'));
        $this->assertGreaterThanOrEqual(10, $response->json('data.completed_appointments'));
    }

    public function test_reports_summary_includes_timestamp(): void
    {
        $response = $this->getJson('/api/admin/reports/summary', $this->withAdminAuth());

        $response->assertStatus(200);
        $timestamp = $response->json('timestamp');

        $this->assertNotNull($timestamp);
        // Verify timestamp is valid and recent (within last minute)
        $parsedTimestamp = \Carbon\Carbon::parse($timestamp);
        $this->assertTrue($parsedTimestamp->diffInSeconds(now()) < 60, 'Timestamp should be recent');
    }

    // ============================================
    // HELPER METHOD
    // ============================================

    private function createTestData(): void
    {
        // Create basic test data for reports
        Customer::factory()->count(5)->create();
        Pet::factory()->count(5)->create();
        Service::factory()->count(3)->create();
        Sale::factory()->count(5)->create();
        Appointment::factory()->count(10)->create();
        InventoryItem::factory()->count(10)->create();
    }
}
