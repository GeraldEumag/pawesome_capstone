<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollEndToEndTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $employee;
    private string $managerToken;
    private string $employeeToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager',
            'is_active' => true,
            'base_salary' => 45000,
            'department' => 'Management',
            'position' => 'Manager',
        ]);
        $this->managerToken = $this->manager->createToken('test-token')->plainTextToken;

        $this->employee = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 25000,
            'department' => 'Operations',
            'position' => 'Cashier',
        ]);
        $this->employeeToken = $this->employee->createToken('test-token')->plainTextToken;
    }

    private function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function employeeAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->employeeToken];
    }

    /**
     * FULL E2E: Attendance → Compute → Generate → Edit → Approve → Release →
     * Employee MyPayroll → View Payslip → Verify amounts
     */
    public function test_complete_payroll_lifecycle(): void
    {
        $periodStart = '2024-06-01';
        $periodEnd = '2024-06-15';

        // === STEP 1: Create attendance records ===
        Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2024-06-03',
            'check_in' => '08:00',
            'check_out' => '17:00',
            'total_hours' => 8,
            'overtime_hours' => 2,
            'status' => 'present',
            'is_late' => false,
        ]);
        Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2024-06-04',
            'check_in' => '09:15',
            'check_out' => '17:00',
            'total_hours' => 7.75,
            'overtime_hours' => 0,
            'status' => 'late',
            'is_late' => true,
        ]);
        Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2024-06-05',
            'check_in' => '08:00',
            'check_out' => '17:00',
            'total_hours' => 8,
            'overtime_hours' => 0,
            'status' => 'present',
            'is_late' => false,
        ]);

        // === STEP 2: Compute payroll preview ===
        $computeResponse = $this->postJson('/api/manager/payroll/compute', [
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
        ], $this->managerAuth());

        $computeResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    '*' => [
                        'user_id',
                        'employee_name',
                        'base_salary',
                        'sss_contribution',
                        'philhealth_contribution',
                        'pagibig_contribution',
                        'tax_deduction',
                        'gross_pay',
                        'total_deductions',
                        'net_pay',
                    ],
                ],
            ]);

        $computedRow = collect($computeResponse->json('data'))
            ->firstWhere('user_id', $this->employee->id);

        $this->assertNotNull($computedRow, 'Employee should appear in compute preview');
        $this->assertGreaterThan(0, $computedRow['gross_pay']);
        $this->assertGreaterThan(0, $computedRow['sss_contribution']);
        $this->assertGreaterThan(0, $computedRow['philhealth_contribution']);
        $this->assertEquals(100, $computedRow['pagibig_contribution']);
        // 25,000 salary → taxable ~23,150 → tax ~347.55
        $this->assertGreaterThan(0, $computedRow['tax_deduction']);

        // === STEP 3: Generate payroll ===
        $generateResponse = $this->postJson('/api/manager/payroll/generate', [
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
        ], $this->managerAuth());

        $generateResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $generatedRecords = $generateResponse->json('data');
        $generatedPayroll = collect($generatedRecords)
            ->firstWhere('user_id', $this->employee->id);

        $this->assertNotNull($generatedPayroll, 'Employee should have a generated payroll record');
        $this->assertEquals('draft', $generatedPayroll['status']);

        $payrollId = $generatedPayroll['id'];

        // === STEP 4: Edit bonus/allowances (simulating PayrollComputation edited values) ===
        $editResponse = $this->putJson("/api/manager/payroll/{$payrollId}", [
            'bonus' => 2000,
            'allowances' => 1500,
            'deductions' => 500,
        ], $this->managerAuth());

        $editResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $editedPayroll = Payroll::find($payrollId);
        $this->assertEquals(2000, (float) $editedPayroll->bonus);
        $this->assertEquals(1500, (float) $editedPayroll->allowances);
        $this->assertEquals(500, (float) $editedPayroll->deductions);

        // === STEP 5: Approve payroll ===
        $approveResponse = $this->postJson(
            "/api/manager/payroll/{$payrollId}/approve",
            [],
            $this->managerAuth()
        );

        $approveResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'pending');

        // === STEP 6: Release payment with explicit payment method ===
        $releaseResponse = $this->postJson(
            "/api/manager/payroll/{$payrollId}/release",
            [
                'payment_method' => 'GCash',
                'payment_date' => '2024-06-20',
            ],
            $this->managerAuth()
        );

        $releaseResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.payment_method', 'GCash');

        // === STEP 7: Employee views own payroll list ===
        $myPayrollResponse = $this->getJson('/api/my-payroll', $this->employeeAuth());

        $myPayrollResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $myPayrolls = $myPayrollResponse->json('data');
        $this->assertNotEmpty($myPayrolls, 'Employee should see their payroll records');

        $myRecord = collect($myPayrolls)->firstWhere('id', $payrollId);
        $this->assertNotNull($myRecord, 'Generated payroll should appear in employee MyPayroll');
        $this->assertEquals('paid', $myRecord['status']);

        // === STEP 8: Employee views own payslip ===
        $payslipResponse = $this->getJson(
            "/api/my-payroll/{$payrollId}/payslip",
            $this->employeeAuth()
        );

        $payslipResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'company_name',
                    'payslip_date',
                    'payroll_id',
                    'pay_period',
                    'employee' => ['name', 'id', 'department', 'position'],
                    'earnings' => ['base_salary', 'overtime_pay', 'bonus', 'allowances', 'gross_pay'],
                    'deductions' => [
                        'sss', 'philhealth', 'pagibig', 'tax',
                        'late_deductions', 'absent_deductions', 'other_deductions', 'total_deductions',
                    ],
                    'attendance' => ['working_days', 'present_days', 'absent_days', 'regular_hours', 'overtime_hours'],
                    'net_pay',
                    'payment_date',
                    'payment_method',
                    'status',
                ],
            ]);

        $payslip = $payslipResponse->json('data');

        // Verify statutory breakdown is present and correct
        $this->assertEquals('Pawesome Retreat Inc.', $payslip['company_name']);
        $this->assertGreaterThan(0, $payslip['deductions']['sss']);
        $this->assertGreaterThan(0, $payslip['deductions']['philhealth']);
        $this->assertEquals(100, $payslip['deductions']['pagibig']);
        $this->assertGreaterThan(0, $payslip['deductions']['tax']);
        $this->assertEquals('GCash', $payslip['payment_method']);
        $this->assertEquals('paid', $payslip['status']);

        // === STEP 9: Verify amounts against database ===
        $dbPayroll = Payroll::find($payrollId);
        $this->assertEqualsWithDelta((float) $dbPayroll->gross_pay, $payslip['earnings']['gross_pay'], 0.01);
        $this->assertEqualsWithDelta((float) $dbPayroll->net_pay, $payslip['net_pay'], 0.01);
        $this->assertEqualsWithDelta((float) $dbPayroll->sss_contribution, $payslip['deductions']['sss'], 0.01);
        $this->assertEqualsWithDelta((float) $dbPayroll->philhealth_contribution, $payslip['deductions']['philhealth'], 0.01);
        $this->assertEqualsWithDelta((float) $dbPayroll->tax_deduction, $payslip['deductions']['tax'], 0.01);

        // Verify net pay = gross - total deductions
        $totalDed = $payslip['deductions']['total_deductions'];
        $expectedNet = $payslip['earnings']['gross_pay'] - $totalDed;
        $this->assertEqualsWithDelta($expectedNet, $payslip['net_pay'], 0.01);
    }

    /**
     * Verify employee cannot access another employee's payslip
     */
    public function test_employee_cannot_access_other_employee_payslip(): void
    {
        $otherEmployee = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 20000,
        ]);

        $payroll = Payroll::create([
            'payroll_id' => 'PAY-2024-0001',
            'user_id' => $otherEmployee->id,
            'department' => 'Operations',
            'position' => 'Cashier',
            'base_salary' => 20000,
            'pay_period_start' => '2024-06-01',
            'pay_period_end' => '2024-06-15',
            'pay_period_label' => 'Jun 01 - Jun 15, 2024',
            'status' => 'paid',
            'gross_pay' => 20000,
            'net_pay' => 18000,
            'sss_contribution' => 900,
            'philhealth_contribution' => 500,
            'pagibig_contribution' => 100,
            'tax_deduction' => 0,
        ]);

        $response = $this->getJson(
            "/api/my-payroll/{$payroll->id}/payslip",
            $this->employeeAuth()
        );

        $response->assertStatus(403);
    }

    /**
     * Verify manager can access any employee's payslip
     */
    public function test_manager_can_access_any_employee_payslip(): void
    {
        $payroll = Payroll::create([
            'payroll_id' => 'PAY-2024-0002',
            'user_id' => $this->employee->id,
            'department' => 'Operations',
            'position' => 'Cashier',
            'base_salary' => 25000,
            'pay_period_start' => '2024-06-01',
            'pay_period_end' => '2024-06-15',
            'pay_period_label' => 'Jun 01 - Jun 15, 2024',
            'status' => 'paid',
            'gross_pay' => 25000,
            'net_pay' => 22000,
            'sss_contribution' => 1125,
            'philhealth_contribution' => 625,
            'pagibig_contribution' => 100,
            'tax_deduction' => 347.55,
        ]);

        $response = $this->getJson(
            "/api/manager/payroll/{$payroll->id}/payslip",
            $this->managerAuth()
        );

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.employee.name', $this->employee->name);
    }

    /**
     * Verify duplicate payroll prevention for same user and period
     */
    public function test_duplicate_payroll_prevention(): void
    {
        $periodStart = '2024-07-01';
        $periodEnd = '2024-07-15';

        // First generation
        $first = $this->postJson('/api/manager/payroll/generate', [
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
        ], $this->managerAuth());

        $first->assertStatus(200);

        // Second generation for same period (should update, not duplicate)
        $second = $this->postJson('/api/manager/payroll/generate', [
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
        ], $this->managerAuth());

        $second->assertStatus(200);

        // Should have only one payroll record for this user+period
        $count = Payroll::where('user_id', $this->employee->id)
            ->where('pay_period_start', $periodStart)
            ->where('pay_period_end', $periodEnd)
            ->count();

        $this->assertEquals(1, $count, 'Duplicate payroll should not be created');
    }

    /**
     * Verify status transitions are enforced
     */
    public function test_cannot_approve_already_paid_payroll(): void
    {
        $payroll = Payroll::create([
            'payroll_id' => 'PAY-2024-0003',
            'user_id' => $this->employee->id,
            'department' => 'Operations',
            'position' => 'Cashier',
            'base_salary' => 25000,
            'pay_period_start' => '2024-06-01',
            'pay_period_end' => '2024-06-15',
            'pay_period_label' => 'Jun 01 - Jun 15, 2024',
            'status' => 'paid',
            'gross_pay' => 25000,
            'net_pay' => 22000,
        ]);

        $response = $this->postJson(
            "/api/manager/payroll/{$payroll->id}/approve",
            [],
            $this->managerAuth()
        );

        $response->assertStatus(422);
    }

    /**
     * Verify payment method is persisted correctly
     */
    public function test_payment_method_is_persisted(): void
    {
        $payroll = Payroll::create([
            'payroll_id' => 'PAY-2024-0004',
            'user_id' => $this->employee->id,
            'department' => 'Operations',
            'position' => 'Cashier',
            'base_salary' => 25000,
            'pay_period_start' => '2024-06-01',
            'pay_period_end' => '2024-06-15',
            'pay_period_label' => 'Jun 01 - Jun 15, 2024',
            'status' => 'pending',
            'gross_pay' => 25000,
            'net_pay' => 22000,
        ]);

        $response = $this->postJson(
            "/api/manager/payroll/{$payroll->id}/release",
            [
                'payment_method' => 'Cash',
                'payment_date' => '2024-06-18',
            ],
            $this->managerAuth()
        );

        $response->assertStatus(200)
            ->assertJsonPath('data.payment_method', 'Cash');

        $this->assertStringStartsWith('2024-06-18', $response->json('data.payment_date'));

        $this->assertDatabaseHas('payrolls', [
            'id' => $payroll->id,
            'payment_method' => 'Cash',
            'status' => 'paid',
        ]);
    }
}
