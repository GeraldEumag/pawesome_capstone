<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManagerBatch6SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch6-test')->plainTextToken];
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    public function test_manager_dashboard_requires_the_manager_role(): void
    {
        $this->getJson('/api/manager/dashboard')->assertStatus(401);

        $customer = $this->staff('customer');
        $this->withHeaders($this->headers($customer))->getJson('/api/manager/dashboard')->assertForbidden();

        $cashier = $this->staff('cashier');
        $this->withHeaders($this->headers($cashier))->getJson('/api/manager/dashboard')->assertForbidden();

        $manager = $this->staff('manager');
        $this->withHeaders($this->headers($manager))->getJson('/api/manager/dashboard')->assertOk();
    }

    public function test_manager_staff_and_people_views_respond(): void
    {
        $manager = $this->staff('manager');
        $headers = $this->headers($manager);

        $this->withHeaders($headers)->getJson('/api/manager/staff')->assertOk();
        $this->withHeaders($headers)->getJson('/api/manager/people')->assertOk();
        $this->withHeaders($headers)->getJson('/api/manager/executive-summary')->assertOk();
    }

    public function test_manager_reports_respond(): void
    {
        $manager = $this->staff('manager');
        $headers = $this->headers($manager);

        $this->withHeaders($headers)->getJson('/api/manager/reports/overview')->assertOk();
        $this->withHeaders($headers)->getJson('/api/manager/reports/summary')->assertOk();
        $this->withHeaders($headers)->getJson('/api/manager/reports/live')->assertOk();
        $this->withHeaders($headers)->getJson('/api/manager/reports/room-occupancy')->assertOk();
    }

    public function test_admin_reaches_the_manager_workspace(): void
    {
        $admin = $this->staff('admin');
        $this->withHeaders($this->headers($admin))->getJson('/api/manager/dashboard')->assertOk();
    }
}
