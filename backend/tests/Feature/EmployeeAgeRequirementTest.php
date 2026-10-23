<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeAgeRequirementTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test-token')->plainTextToken];
    }

    private function employeePayload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Juan',
            'last_name' => 'Cruz',
        ], $overrides);
    }

    private function userPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Test Person',
            'email' => 'test.person@example.com',
            'username' => 'testperson',
            'password' => 'Password123!',
            'role' => 'receptionist',
        ], $overrides);
    }

    public function test_employee_creation_rejects_underage_birthdate(): void
    {
        $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);

        $this->postJson('/api/manager/employees', $this->employeePayload([
            'birthdate' => now()->subYears(17)->toDateString(),
        ]), $this->bearer($manager))->assertUnprocessable();
    }

    public function test_employee_creation_rejects_missing_birthdate(): void
    {
        $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);

        $this->postJson('/api/manager/employees', $this->employeePayload(), $this->bearer($manager))
            ->assertUnprocessable();
    }

    public function test_employee_creation_accepts_exactly_eighteen(): void
    {
        $manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);

        $this->postJson('/api/manager/employees', $this->employeePayload([
            'birthdate' => now()->subYears(18)->toDateString(),
        ]), $this->bearer($manager))->assertCreated();
    }

    public function test_staff_user_creation_rejects_underage_birthdate(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->postJson('/api/admin/users', $this->userPayload([
            'date_of_birth' => now()->subYears(17)->subDays(10)->toDateString(),
        ]), $this->bearer($admin))->assertUnprocessable();
    }

    public function test_staff_user_creation_requires_birthdate(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->postJson('/api/admin/users', $this->userPayload(), $this->bearer($admin))
            ->assertUnprocessable();
    }

    public function test_staff_user_creation_accepts_adult(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->postJson('/api/admin/users', $this->userPayload([
            'date_of_birth' => now()->subYears(18)->toDateString(),
        ]), $this->bearer($admin))->assertCreated();
    }

    public function test_customer_user_creation_is_not_age_gated(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->postJson('/api/admin/users', $this->userPayload([
            'role' => 'customer',
            'email' => 'young.customer@example.com',
            'username' => 'youngcustomer',
            'date_of_birth' => now()->subYears(15)->toDateString(),
        ]), $this->bearer($admin))->assertCreated();
    }
}
