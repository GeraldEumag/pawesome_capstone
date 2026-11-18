<?php

namespace Tests\Feature;

use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollEligibilityTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private string $managerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager',
            'is_active' => true,
            'employment_status' => 'active',
            'base_salary' => 45000,
        ]);
        $this->managerToken = $this->manager->createToken('payroll-eligibility')->plainTextToken;
    }

    private function authHeaders(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function staff(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'cashier',
            'is_active' => true,
            'employment_status' => 'active',
            'base_salary' => 25000,
        ], $overrides));
    }

    private function period(): array
    {
        return ['period_start' => '2026-11-01', 'period_end' => '2026-11-15'];
    }

    public function test_missing_salary_blocks_preview_and_generation_without_creating_rows(): void
    {
        $missing = $this->staff(['name' => 'Missing Salary', 'base_salary' => null]);

        $preview = $this->postJson('/api/manager/payroll/compute', $this->period(), $this->authHeaders())
            ->assertStatus(422);
        $this->assertStringContainsString('MISSING SALARY', $preview->json('message'));

        $generation = $this->postJson('/api/manager/payroll/generate', $this->period(), $this->authHeaders())
            ->assertStatus(422);
        $this->assertStringContainsString('MISSING SALARY', $generation->json('message'));

        $this->assertSame(0, Payroll::where('user_id', $missing->id)->count());
    }

    public function test_zero_or_negative_salary_is_blocked_instead_of_treated_as_configured(): void
    {
        $zero = $this->staff(['name' => 'Zero Salary', 'base_salary' => 0]);

        $zeroResponse = $this->postJson('/api/manager/payroll/compute', $this->period(), $this->authHeaders())
            ->assertStatus(422);
        $this->assertStringContainsString('ZERO SALARY', $zeroResponse->json('message'));
        $this->assertSame(0, Payroll::where('user_id', $zero->id)->count());

        $invalid = $this->staff(['name' => 'Invalid Salary', 'base_salary' => -1]);
        $invalidResponse = $this->postJson('/api/manager/payroll/generate', $this->period(), $this->authHeaders())
            ->assertStatus(422);
        $messages = json_encode($invalidResponse->json('errors.employees'));
        $this->assertStringContainsString('ZERO SALARY', $messages);
        $this->assertStringContainsString('INVALID SALARY', $messages);
        $this->assertSame(0, Payroll::where('user_id', $invalid->id)->count());
    }

    public function test_inactive_and_terminated_accounts_are_not_payroll_eligible(): void
    {
        $inactive = $this->staff([
            'name' => 'Inactive Staff',
            'is_active' => false,
            'base_salary' => null,
        ]);
        $terminated = $this->staff([
            'name' => 'Terminated Staff',
            'employment_status' => 'terminated',
            'base_salary' => null,
        ]);

        $response = $this->postJson('/api/manager/payroll/compute', $this->period(), $this->authHeaders())
            ->assertOk();

        $ids = collect($response->json('data'))->pluck('user_id');
        $this->assertFalse($ids->contains($inactive->id));
        $this->assertFalse($ids->contains($terminated->id));
    }

    public function test_valid_salary_is_included_in_preview(): void
    {
        $staff = $this->staff(['name' => 'Valid Salary']);

        $response = $this->postJson('/api/manager/payroll/compute', $this->period(), $this->authHeaders())
            ->assertOk();

        $row = collect($response->json('data'))->firstWhere('user_id', $staff->id);
        $this->assertNotNull($row);
        $this->assertEquals(25000, (float) $row['base_salary']);
    }

    public function test_linked_daily_or_hourly_payroll_is_rejected_until_policy_exists(): void
    {
        $staff = $this->staff();

        $this->postJson('/api/manager/payroll', [
            'user_id' => $staff->id,
            'rate_type' => 'hourly',
            'base_salary' => 25000,
            'pay_period_start' => '2026-11-01',
            'pay_period_end' => '2026-11-15',
        ], $this->authHeaders())
            ->assertStatus(422)
            ->assertJsonFragment(['Daily and hourly payroll require an approved rate calculation policy and are not supported by this payroll run.']);
    }
}
