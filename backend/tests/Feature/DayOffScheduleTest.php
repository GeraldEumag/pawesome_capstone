<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeDayOff;
use App\Models\Payroll;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Per-person weekly day-offs: the business operates 7 days, each staff gets
 * assigned rest weekdays. June 2024: Jun 2 & 9 are Sundays.
 */
class DayOffScheduleTest extends TestCase
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
            'base_salary' => 45000,
        ]);
        $this->managerToken = $this->manager->createToken('test')->plainTextToken;
    }

    private function auth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function staff(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 25000,
            'department' => 'Operations',
            'position' => 'Cashier',
        ], $overrides));
    }

    private function punch(User $user, string $date): Attendance
    {
        return Attendance::create([
            'user_id' => $user->id,
            'date' => $date,
            'check_in' => '08:00',
            'check_out' => '17:00',
            'total_hours' => 8,
            'overtime_hours' => 0,
            'status' => 'present',
        ]);
    }

    public function test_people_payload_carries_day_offs(): void
    {
        $user = $this->staff();
        EmployeeDayOff::create(['user_id' => $user->id, 'weekday' => 2]);
        EmployeeDayOff::create(['user_id' => $user->id, 'weekday' => 4]);

        $res = $this->getJson('/api/manager/people', $this->auth());
        $res->assertStatus(200);

        $row = collect($res->json('data'))->firstWhere('user_id', $user->id);
        $this->assertEquals([2, 4], $row['day_offs']);
    }

    public function test_day_off_endpoint_sets_and_replaces(): void
    {
        $user = $this->staff();

        $res = $this->putJson("/api/manager/people/account/{$user->id}/day-offs", [
            'days' => [0, 3],
        ], $this->auth());
        $res->assertStatus(200);
        $this->assertEquals([0, 3], $res->json('data.day_offs'));

        // Replace: drop Sunday, keep Wed, add Fri
        $res = $this->putJson("/api/manager/people/account/{$user->id}/day-offs", [
            'days' => [3, 5],
        ], $this->auth());
        $res->assertStatus(200);
        $this->assertEquals([3, 5], $res->json('data.day_offs'));
        $this->assertEquals([3, 5],
            EmployeeDayOff::where('user_id', $user->id)->orderBy('weekday')->pluck('weekday')->all()
        );
    }

    public function test_day_off_endpoint_works_for_non_account_employees(): void
    {
        $emp = Employee::create([
            'employee_no' => 'PAW-TEST1',
            'first_name' => 'Non', 'last_name' => 'Account',
            'position' => 'Helper', 'department' => 'Ops',
            'base_salary' => 18000,
            'is_active' => true,
        ]);

        $res = $this->putJson("/api/manager/people/employee/{$emp->id}/day-offs", [
            'days' => [1],
        ], $this->auth());
        $res->assertStatus(200);
        $this->assertEquals([1], $res->json('data.day_offs'));
    }

    public function test_day_off_endpoint_rejects_seven_offs_and_bad_values(): void
    {
        $user = $this->staff();

        $this->putJson("/api/manager/people/account/{$user->id}/day-offs", [
            'days' => [0, 1, 2, 3, 4, 5, 6],
        ], $this->auth())->assertStatus(422);

        $this->putJson("/api/manager/people/account/{$user->id}/day-offs", [
            'days' => [9],
        ], $this->auth())->assertStatus(422);

        $this->putJson("/api/manager/people/bogus/{$user->id}/day-offs", [
            'days' => [1],
        ], $this->auth())->assertStatus(404);
    }

    public function test_configured_person_sunday_is_a_workday(): void
    {
        $user = $this->staff();
        EmployeeDayOff::create(['user_id' => $user->id, 'weekday' => 3]); // Wed off

        $sunday = Carbon::parse('2024-06-02');
        $wed    = Carbon::parse('2024-06-05');

        $this->assertTrue(CompanySchedule::isWorkday($sunday, $user));
        $this->assertFalse(CompanySchedule::isWorkday($wed, $user));

        // Sunday punch counts as a normal workday, not a rest day
        $this->punch($user, '2024-06-02');
        $stats = app(PayrollComputationService::class)
            ->attendanceStats($user, Attendance::forUser($user->id)->get(), '2024-06-01', '2024-06-15');
        $this->assertSame(0, $stats['rest_day_days']);
        $this->assertSame(1, $stats['present_days']);
    }

    public function test_unconfigured_person_keeps_sunday_as_rest_day(): void
    {
        $user = $this->staff();

        $sunday = Carbon::parse('2024-06-02');
        $this->assertFalse(CompanySchedule::isWorkday($sunday, $user));

        $this->punch($user, '2024-06-02');
        $stats = app(PayrollComputationService::class)
            ->attendanceStats($user, Attendance::forUser($user->id)->get(), '2024-06-01', '2024-06-15');
        $this->assertSame(1, $stats['rest_day_days']);
        $this->assertSame(0, $stats['present_days']);
    }

    public function test_sunday_absence_counted_for_configured_not_for_unconfigured(): void
    {
        $configured   = $this->staff();
        $unconfigured = $this->staff();
        // Configured person: Thu + Fri off → works Sun–Wed + Sat
        EmployeeDayOff::create(['user_id' => $configured->id, 'weekday' => 4]);
        EmployeeDayOff::create(['user_id' => $configured->id, 'weekday' => 5]);

        $service = app(PayrollComputationService::class);

        // No attendance at all for either, period Jun 1-15
        $statsConf   = $service->attendanceStats($configured, collect(), '2024-06-01', '2024-06-15');
        $statsUnconf = $service->attendanceStats($unconfigured, collect(), '2024-06-01', '2024-06-15');

        // Configured: 15 calendar days − 2 Thu − 2 Fri = 11 scheduled workdays
        // (Sundays Jun 2 & 9 ARE workdays for them → absent when unpunched)
        $this->assertSame(11.0, (float) $statsConf['absent_days']);
        // Unconfigured: legacy Mon–Sat = 13 workdays (Sundays skipped)
        $this->assertSame(13.0, (float) $statsUnconf['absent_days']);
    }

    public function test_day_off_punch_earns_rest_day_rate(): void
    {
        $user = $this->staff();
        EmployeeDayOff::create(['user_id' => $user->id, 'weekday' => 3]); // Wed off

        // Work every scheduled day Jun 1-15 except punch the Wed off-days (Jun 5, 12) too
        $service = app(PayrollComputationService::class);
        foreach (range(1, 15) as $d) {
            $this->punch($user, sprintf('2024-06-%02d', $d));
        }

        $row = $service->computeFromAttendance(
            $user,
            Attendance::forUser($user->id)->get(),
            '2024-06-01',
            '2024-06-15'
        );

        $daily = 25000 / 26;
        $this->assertSame(2, $row['rest_day_days']);
        $this->assertEqualsWithDelta(2 * $daily * 1.30, (float) $row['rest_day_pay'], 0.01);
    }

    public function test_mark_absent_skips_person_day_offs(): void
    {
        $withOff    = $this->staff();
        $withoutOff = $this->staff();
        // Yesterday for the test run — pick a fixed recent workday instead:
        // use Carbon::setTestNow to control "today"
        Carbon::setTestNow(Carbon::parse('2024-06-06')); // Thursday — yesterday = Wed Jun 5

        EmployeeDayOff::create(['user_id' => $withOff->id, 'weekday' => 3]); // Wed off

        $this->artisan('attendance:mark-absent', ['--days' => 1])->assertExitCode(0);

        // withOff had Wed Jun 5 off → no absent row; withoutOff gets one
        $this->assertFalse(
            Attendance::where('user_id', $withOff->id)->whereDate('date', '2024-06-05')->exists()
        );
        $this->assertTrue(
            Attendance::where('user_id', $withoutOff->id)->whereDate('date', '2024-06-05')->exists()
        );

        Carbon::setTestNow();
    }
}
