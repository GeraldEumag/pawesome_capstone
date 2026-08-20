<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollCalculationTest extends TestCase
{
    use RefreshDatabase;

    private function createEmployee(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 25000,
            'department' => 'Operations',
            'position' => 'Cashier',
        ], $overrides));
    }

    private function createPayroll(User $user, float $baseSalary): Payroll
    {
        $payroll = new Payroll();
        $payroll->user_id = $user->id;
        $payroll->base_salary = $baseSalary;
        $payroll->bonus = 0;
        $payroll->allowances = 0;
        $payroll->deductions = 0;
        $payroll->pay_period_start = '2024-01-01';
        $payroll->pay_period_end = '2024-01-15';
        $payroll->pay_period_label = 'Jan 01 - Jan 15, 2024';
        return $payroll;
    }

    public function test_sss_contribution_for_low_salary(): void
    {
        $user = $this->createEmployee(['base_salary' => 5000]);
        $payroll = $this->createPayroll($user, 5000);
        $payroll->calculatePayroll();

        // SSS 2025: salary <= 5,250 → MSC 5,000 → 5% = 250
        $this->assertEquals(250, (float) $payroll->sss_contribution);
    }

    public function test_sss_contribution_for_high_salary(): void
    {
        $user = $this->createEmployee(['base_salary' => 50000]);
        $payroll = $this->createPayroll($user, 50000);
        $payroll->calculatePayroll();

        // SSS 2025 max: 35,000 MSC * 5% = 1,750
        $this->assertEquals(1750, (float) $payroll->sss_contribution);
    }

    public function test_philhealth_contribution_2025_rates(): void
    {
        $user = $this->createEmployee(['base_salary' => 30000]);
        $payroll = $this->createPayroll($user, 30000);
        $payroll->calculatePayroll();

        // PhilHealth 2025: 5% premium, employee share 50%
        // 30,000 * 0.05 = 1,500 premium, employee = 750
        $this->assertEquals(750, (float) $payroll->philhealth_contribution);
    }

    public function test_philhealth_min_premium(): void
    {
        $user = $this->createEmployee(['base_salary' => 5000]);
        $payroll = $this->createPayroll($user, 5000);
        $payroll->calculatePayroll();

        // Min premium = 500, employee share = 250
        $this->assertEquals(250, (float) $payroll->philhealth_contribution);
    }

    public function test_philhealth_max_premium(): void
    {
        $user = $this->createEmployee(['base_salary' => 150000]);
        $payroll = $this->createPayroll($user, 150000);
        $payroll->calculatePayroll();

        // Max premium = 5,000, employee share = 2,500
        $this->assertEquals(2500, (float) $payroll->philhealth_contribution);
    }

    public function test_withholding_tax_exempt_below_threshold(): void
    {
        $user = $this->createEmployee(['base_salary' => 15000]);
        $payroll = $this->createPayroll($user, 15000);
        $payroll->calculatePayroll();

        // SSS 2025: 15,000 → MSC 15,000 → 750
        // PhilHealth: 15,000 * 0.05 = 750, employee = 375
        // Pag-IBIG: 100
        // Taxable = 15000 - 750 - 375 - 100 = 13,775 (below 20,833 → tax exempt)
        $this->assertEquals(0, (float) $payroll->tax_deduction);
    }

    public function test_withholding_tax_in_15_percent_bracket(): void
    {
        $user = $this->createEmployee(['base_salary' => 25000]);
        $payroll = $this->createPayroll($user, 25000);
        $payroll->calculatePayroll();

        // SSS 2025: 25,000 → MSC 25,000 → 1,250
        // PhilHealth: 25,000 * 0.05 = 1,250, employee = 625
        // Pag-IBIG: 100
        // Taxable = 25000 - 1250 - 625 - 100 = 23,025
        // Tax = (23,025 - 20,833) * 0.15 = 2,192 * 0.15 = 328.80
        $this->assertEqualsWithDelta(328.80, (float) $payroll->tax_deduction, 0.01);
    }

    public function test_withholding_tax_in_20_percent_bracket(): void
    {
        $user = $this->createEmployee(['base_salary' => 45000]);
        $payroll = $this->createPayroll($user, 45000);
        $payroll->calculatePayroll();

        // SSS 2025: 45,000 → max MSC 35,000 → 1,750
        // PhilHealth: 45,000 * 0.05 = 2,250, employee = 1,125
        // Pag-IBIG: 100
        // Taxable = 45000 - 1750 - 1125 - 100 = 42,025
        // Tax = 1,875 + (42,025 - 33,333) * 0.20 = 1,875 + 8,692 * 0.20 = 1,875 + 1,738.40 = 3,613.40
        $this->assertEqualsWithDelta(3613.40, (float) $payroll->tax_deduction, 0.01);
    }

    public function test_withholding_tax_in_25_percent_bracket(): void
    {
        $user = $this->createEmployee(['base_salary' => 80000]);
        $payroll = $this->createPayroll($user, 80000);
        $payroll->calculatePayroll();

        // SSS 2025: max 1,750
        // PhilHealth: 80,000 * 0.05 = 4,000, employee = 2,000
        // Pag-IBIG: 100
        // Taxable = 80000 - 1750 - 2000 - 100 = 76,150
        // Tax = 8,541.80 + (76,150 - 66,667) * 0.25 = 8,541.80 + 9,483 * 0.25 = 8,541.80 + 2,370.75 = 10,912.55
        $this->assertEqualsWithDelta(10912.55, (float) $payroll->tax_deduction, 0.01);
    }

    public function test_net_pay_is_positive_after_all_deductions(): void
    {
        $user = $this->createEmployee(['base_salary' => 25000]);
        $payroll = $this->createPayroll($user, 25000);
        $payroll->calculatePayroll();

        $this->assertGreaterThan(0, (float) $payroll->net_pay);
        $this->assertLessThan((float) $payroll->gross_pay, (float) $payroll->net_pay);
    }

    public function test_net_pay_calculation_is_consistent(): void
    {
        $user = $this->createEmployee(['base_salary' => 35000]);
        $payroll = $this->createPayroll($user, 35000);
        $payroll->calculatePayroll();

        $expectedDeductions = (float) $payroll->sss_contribution
            + (float) $payroll->philhealth_contribution
            + (float) $payroll->pagibig_contribution
            + (float) $payroll->tax_deduction
            + (float) $payroll->late_deductions
            + (float) $payroll->absent_deductions
            + (float) $payroll->deductions;

        $expectedNet = (float) $payroll->gross_pay - $expectedDeductions;
        $this->assertEqualsWithDelta($expectedNet, (float) $payroll->net_pay, 0.01);
    }
}
