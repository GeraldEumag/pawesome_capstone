<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Baseline evidence only. These assertions describe the current system and
 * must not be read as business approval of overtime.
 */
class OvertimeGovernanceBaselineTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->employee = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 26000,
        ]);
    }

    private function payrollFor(Attendance $attendance): array
    {
        return app(PayrollComputationService::class)->computeFromAttendance(
            $this->employee,
            collect([$attendance]),
            '2026-06-01',
            '2026-06-15'
        );
    }

    public function test_day_without_calculated_overtime_has_no_overtime_pay(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2026-06-03',
            'check_in' => '08:00',
            'check_out' => '17:00',
            'status' => 'present',
            'review_status' => 'approved',
        ]);

        $payroll = $this->payrollFor($attendance);

        $this->assertSame(0.0, (float) $attendance->fresh()->overtime_hours);
        $this->assertSame(0.0, (float) $payroll['overtime_hours']);
        $this->assertSame(0.0, (float) $payroll['overtime_pay']);
    }

    public function test_current_payroll_pays_calculated_overtime_without_an_approval_state(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2026-06-03',
            'check_in' => '08:00',
            'check_out' => '18:00',
            'status' => 'present',
            'review_status' => 'pending',
        ]);

        $payroll = $this->payrollFor($attendance);

        $this->assertSame(1.0, (float) $attendance->fresh()->overtime_hours);
        $this->assertSame(1.0, (float) $payroll['overtime_hours']);
        $this->assertSame(187.5, (float) $payroll['overtime_pay']);
    }
}
