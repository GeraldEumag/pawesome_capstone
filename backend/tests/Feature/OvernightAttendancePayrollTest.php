<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Overnight-shift (22:00–06:00) payroll accuracy.
 *
 * Regression coverage for the defect where late/undertime were computed by
 * comparing bare clock times on the same calendar day, producing ~840 late
 * and ~660 undertime minutes for an on-time overnight shift.
 */
class OvernightAttendancePayrollTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        // Overnight company schedule: 22:00 → 06:00 next day, open every day.
        foreach ([
            'shift_start' => '22:00',
            'shift_end'   => '06:00',
            'work_days'   => '[0,1,2,3,4,5,6]',
            'grace_period_minutes' => '15',
            'break_minutes' => '60',
            'daily_rate_divisor' => '26',
            'overtime_threshold_hours' => '8',
        ] as $key => $value) {
            DB::table('system_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => $value, 'created_at' => now(), 'updated_at' => now()]
            );
        }
        CompanySchedule::clearCache();

        $this->staff = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 26000, // daily 1000, hourly 125
        ]);
    }

    private function overnightPunch(string $date, string $in, ?string $out, float $hours = 7): Attendance
    {
        return Attendance::create([
            'user_id' => $this->staff->id,
            'date' => $date,
            'check_in' => $in,
            'check_out' => $out,
            'total_hours' => $hours,
            'overtime_hours' => max(0, $hours - 8),
            'status' => 'present',
        ]);
    }

    private function stats(Attendance $record): array
    {
        return app(PayrollComputationService::class)->attendanceStats(
            $this->staff,
            collect([$record]),
            $record->date->toDateString(),
            $record->date->toDateString()
        );
    }

    public function test_on_time_overnight_shift_has_zero_deductions(): void
    {
        $record = $this->overnightPunch('2024-06-03', '22:00', '06:00');
        $stats = $this->stats($record);

        $this->assertSame(0, $stats['total_late_minutes']);
        $this->assertSame(0, $stats['total_undertime_minutes']);
        $this->assertSame(0, $stats['late_days']);
        $this->assertSame(0, $stats['early_leave_days']);
        // Full night window 22:00→06:00 = 480 night-diff minutes
        $this->assertSame(480, $stats['night_diff_minutes']);
    }

    public function test_late_arrival_overnight_counts_only_late_minutes(): void
    {
        $record = $this->overnightPunch('2024-06-03', '22:30', '06:00');
        $stats = $this->stats($record);

        $this->assertSame(30, $stats['total_late_minutes']);
        $this->assertSame(0, $stats['total_undertime_minutes']);
    }

    public function test_early_departure_overnight_counts_only_undertime(): void
    {
        $record = $this->overnightPunch('2024-06-03', '22:00', '05:30');
        $stats = $this->stats($record);

        $this->assertSame(0, $stats['total_late_minutes']);
        $this->assertSame(30, $stats['total_undertime_minutes']);
        $this->assertSame(1, $stats['early_leave_days']);
    }

    public function test_late_and_early_overnight_counts_both(): void
    {
        $record = $this->overnightPunch('2024-06-03', '22:30', '05:30');
        $stats = $this->stats($record);

        $this->assertSame(30, $stats['total_late_minutes']);
        $this->assertSame(30, $stats['total_undertime_minutes']);
    }

    public function test_overtime_after_scheduled_end_is_not_undertime(): void
    {
        // 22:00 → 07:30 = 9.5h span − 1h break = 8.5h worked → 0.5h OT
        $record = $this->overnightPunch('2024-06-03', '22:00', '07:30', 8.5);
        $stats = $this->stats($record);

        $this->assertSame(0, $stats['total_undertime_minutes']);
        $this->assertSame(0.5, (float) $stats['overtime_hours']);
    }

    public function test_missing_overnight_checkout_is_incomplete_not_deducted(): void
    {
        $record = $this->overnightPunch('2024-06-03', '22:00', null);
        $stats = $this->stats($record);

        $this->assertSame(0, $stats['total_undertime_minutes']);
        $this->assertSame(1, $stats['incomplete_punch_days']);
    }

    public function test_overnight_peso_deductions_match_minutes(): void
    {
        $record = $this->overnightPunch('2024-06-03', '22:30', '05:30');
        $row = app(PayrollComputationService::class)->computeFromAttendance(
            $this->staff,
            collect([$record]),
            '2024-06-01',
            '2024-06-15'
        );

        // hourly = 26000 / 26 / 8 = 125
        $this->assertEqualsWithDelta(30 * (125 / 60), (float) $row['late_deductions'], 0.01);
        $this->assertEqualsWithDelta(30 * (125 / 60), (float) $row['undertime_deductions'], 0.01);
    }

    public function test_daytime_shift_regression_unchanged(): void
    {
        // Switch back to the default day schedule for this test only.
        foreach ([
            'shift_start' => '08:00',
            'shift_end'   => '17:00',
        ] as $key => $value) {
            DB::table('system_settings')->where('key', $key)->update(['value' => $value]);
        }
        CompanySchedule::clearCache();

        $this->assertFalse(CompanySchedule::isOvernightShift());

        $record = Attendance::create([
            'user_id' => $this->staff->id,
            'date' => '2024-06-03',
            'check_in' => '08:20',
            'check_out' => '16:30',
            'total_hours' => 7,
            'overtime_hours' => 0,
            'status' => 'late',
        ]);
        $stats = $this->stats($record);

        // 20 min late (past 15-min grace), 30 min undertime — same as before.
        $this->assertSame(20, $stats['total_late_minutes']);
        $this->assertSame(30, $stats['total_undertime_minutes']);
    }

    public function test_overnight_spanning_payroll_boundary_uses_checkin_date(): void
    {
        // 22:00 on Jun 15 → 06:00 on Jun 16 crosses the semi-monthly boundary.
        // The record is dated Jun 15 and must be evaluated against Jun 15's
        // schedule (it is — helpers take the attendance date explicitly).
        $record = $this->overnightPunch('2024-06-15', '22:00', '06:00');
        $stats = app(PayrollComputationService::class)->attendanceStats(
            $this->staff,
            collect([$record]),
            '2024-06-01',
            '2024-06-15'
        );

        $this->assertSame(0, $stats['total_late_minutes']);
        $this->assertSame(0, $stats['total_undertime_minutes']);
    }
}
