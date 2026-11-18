<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Holiday;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * attendance:mark-absent must not create ordinary absence rows on
 * non-working holidays (regular / special_non_working), while still marking
 * absences on special_working holidays and ordinary workdays.
 */
class MarkAbsentHolidayTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        return User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 25000,
        ]);
    }

    private function holiday(string $date, string $type, string $name = 'Test Holiday'): Holiday
    {
        return Holiday::create([
            'date' => $date,
            'name' => $name,
            'type' => $type,
            'year' => (int) substr($date, 0, 4),
            'is_recurring' => false,
        ]);
    }

    public function test_regular_holiday_gets_no_absent_rows(): void
    {
        Carbon::setTestNow(Carbon::parse('2024-06-06')); // Thu; yesterday = Wed Jun 5
        $this->staff();
        $this->holiday('2024-06-05', 'regular', 'Araw ng Kalayaan');

        $this->artisan('attendance:mark-absent', ['--days' => 1])->assertExitCode(0);

        $this->assertSame(0, Attendance::whereDate('date', '2024-06-05')->count());

        Carbon::setTestNow();
    }

    public function test_special_non_working_holiday_gets_no_absent_rows(): void
    {
        Carbon::setTestNow(Carbon::parse('2024-06-06'));
        $this->staff();
        $this->holiday('2024-06-05', 'special_non_working', 'Special Day');

        $this->artisan('attendance:mark-absent', ['--days' => 1])->assertExitCode(0);

        $this->assertSame(0, Attendance::whereDate('date', '2024-06-05')->count());

        Carbon::setTestNow();
    }

    public function test_special_working_holiday_still_marks_absent(): void
    {
        Carbon::setTestNow(Carbon::parse('2024-06-06'));
        $this->staff();
        $this->holiday('2024-06-05', 'special_working', 'Special Working Day');

        $this->artisan('attendance:mark-absent', ['--days' => 1])->assertExitCode(0);

        $this->assertTrue(
            Attendance::whereDate('date', '2024-06-05')->where('status', 'absent')->exists()
        );

        Carbon::setTestNow();
    }

    public function test_ordinary_workday_still_marks_absent(): void
    {
        Carbon::setTestNow(Carbon::parse('2024-06-06'));
        $this->staff();

        $this->artisan('attendance:mark-absent', ['--days' => 1])->assertExitCode(0);

        $this->assertTrue(
            Attendance::whereDate('date', '2024-06-05')->where('status', 'absent')->exists()
        );

        Carbon::setTestNow();
    }

    public function test_rest_day_gets_no_absent_rows(): void
    {
        // Sunday Jun 9 is outside default Mon–Sat work days.
        Carbon::setTestNow(Carbon::parse('2024-06-10'));
        $this->staff();

        $this->artisan('attendance:mark-absent', ['--days' => 1])->assertExitCode(0);

        $this->assertSame(0, Attendance::whereDate('date', '2024-06-09')->count());

        Carbon::setTestNow();
    }
}
