<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Kiosk → Attendance → Payroll integration across the whole of 2026.
 *
 * The attendance kiosk (POST /api/kiosk/punch, unlocked by the shared
 * X-Kiosk-Pin or a staff bearer token) writes `attendance` rows through
 * BarcodeAttendanceController. Payroll compute/generate reads those same
 * rows via PayrollComputationService. These tests prove the wiring is real:
 * a barcode punch lands on an attendance row AND changes the payroll
 * figures for the containing semi-monthly period.
 *
 * Company schedule defaults: Mon–Sat workweek, 08:00–17:00 shift,
 * 60-min break, 15-min late grace, daily rate = base/26, OT after 8 h.
 * Employee fixture: base_salary 26,000 → daily 1,000.00, hourly 125.00.
 */
class PayrollYear2026Test extends TestCase
{
    use RefreshDatabase;

    private const KIOSK_PIN   = '4821';
    private const BASE_SALARY = 26000.0;
    private const DAILY_RATE  = 1000.0;
    private const HOURLY_RATE = 125.0;

    private User $manager;
    private User $employee;
    private string $managerToken;

    protected function setUp(): void
    {
        parent::setUp();

        SystemSetting::set('attendance_kiosk_pin', self::KIOSK_PIN);

        $this->manager = User::factory()->create([
            'role'        => 'manager',
            'is_active'   => true,
            'base_salary' => 45000,
            'employee_no' => 'PAW-0001',
            'department'  => 'Management',
            'position'    => 'Manager',
        ]);
        $this->managerToken = $this->manager->createToken('test-token')->plainTextToken;

        $this->employee = User::factory()->create([
            'role'        => 'cashier',
            'is_active'   => true,
            'base_salary' => self::BASE_SALARY,
            'employee_no' => 'PAW-2601',
            'department'  => 'Operations',
            'position'    => 'Cashier',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    /** Punch the real kiosk endpoint at the current (possibly travelled) time. */
    private function kioskPunch(string $barcode): \Illuminate\Testing\TestResponse
    {
        return $this->postJson(
            '/api/kiosk/punch',
            ['barcode' => $barcode],
            ['X-Kiosk-Pin' => self::KIOSK_PIN]
        );
    }

    /** Dates in [start,end] that the payroll engine treats as workdays. */
    private function workdaysIn(string $start, string $end, User|Employee $person): array
    {
        $dates = [];
        for ($d = Carbon::parse($start); $d->lte(Carbon::parse($end)); $d->addDay()) {
            if (CompanySchedule::isWorkday($d->copy(), $person)) {
                $dates[] = $d->toDateString();
            }
        }
        return $dates;
    }

    private function punchDay(User|Employee $person, string $date, string $in = '08:00', string $out = '17:00'): void
    {
        Attendance::create(array_merge(
            $person instanceof Employee ? ['employee_id' => $person->id] : ['user_id' => $person->id],
            [
                'date'      => $date,
                'check_in'  => $in,
                'check_out' => $out,
                'status'    => 'present',
                'is_late'   => CompanySchedule::lateMinutes($in) > 0,
            ]
        ));
    }

    /** Compute a period through the real endpoint and return this employee's row. */
    private function computeRow(string $start, string $end): array
    {
        $response = $this->postJson('/api/manager/payroll/compute', [
            'period_start' => $start,
            'period_end'   => $end,
        ], $this->managerAuth());

        $response->assertStatus(200)->assertJsonPath('success', true);

        $row = collect($response->json('data'))->firstWhere('user_id', $this->employee->id);
        $this->assertNotNull($row, "Employee row missing from compute for {$start} → {$end}");

        return $row;
    }

    /** The 24 valid semi-monthly cutoff pairs of a calendar year. */
    private static function semiMonthlyPeriods(int $year): array
    {
        $periods = [];
        for ($m = 1; $m <= 12; $m++) {
            $first  = Carbon::createFromDate($year, $m, 1);
            $periods[] = [$first->toDateString(), $first->copy()->day(15)->toDateString()];
            $periods[] = [$first->copy()->day(16)->toDateString(), $first->copy()->endOfMonth()->toDateString()];
        }
        return $periods;
    }

    /**
     * Expected gross for a fully worked period, from the seeded `holidays`
     * table: regular holiday worked = +1 daily rate (unworked still +1 per
     * DOLE Art. 94), special non-working worked = +0.3 daily rate.
     */
    private function expectedPeriodGross(string $start, string $end, User|Employee $person): float
    {
        $gross = self::BASE_SALARY / 2;

        $holidays = \Illuminate\Support\Facades\DB::table('holidays')
            ->whereBetween('date', [$start, $end])
            ->get(['date', 'type']);

        foreach ($holidays as $holiday) {
            $date = Carbon::parse($holiday->date);
            if ($holiday->type === 'regular') {
                $gross += self::DAILY_RATE; // worked premium, or Art. 94 unworked pay
            } elseif (CompanySchedule::isWorkday($date, $person)) {
                $gross += self::DAILY_RATE * 0.3; // special holiday, worked
            }
        }

        return $gross;
    }

    // ------------------------------------------------------------------
    // Connection tests — the real kiosk endpoint must feed payroll.
    // ------------------------------------------------------------------

    /**
     * Punches made through the kiosk PIN endpoint land in `attendance` and
     * are picked up by /manager/payroll/compute for the covering period.
     */
    public function test_kiosk_barcode_punches_flow_into_payroll(): void
    {
        // --- Punch in/out on Mon Jan 5, 2026 via the actual kiosk endpoint ---
        Carbon::setTestNow(Carbon::parse('2026-01-05 08:00:00'));
        $this->kioskPunch('PAW-2601')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('punch_type', 'check_in')
            ->assertJsonPath('data.status', 'present');

        Carbon::setTestNow(Carbon::parse('2026-01-05 17:00:00'));
        $this->kioskPunch('PAW-2601')
            ->assertOk()
            ->assertJsonPath('punch_type', 'check_out')
            ->assertJsonPath('data.total_hours', '8.00');

        // --- A late kiosk punch on Tue Jan 6 (45 min past shift start) ---
        Carbon::setTestNow(Carbon::parse('2026-01-06 08:45:00'));
        $this->kioskPunch('PAW-2601')
            ->assertOk()
            ->assertJsonPath('punch_type', 'check_in')
            ->assertJsonPath('data.status', 'late')
            ->assertJsonPath('data.is_late', true);

        Carbon::setTestNow(Carbon::parse('2026-01-06 17:00:00'));
        $this->kioskPunch('PAW-2601')->assertOk()->assertJsonPath('punch_type', 'check_out');

        Carbon::setTestNow(); // back to real time — all of January is in the past

        // The kiosk wrote exactly what the barcode controller is meant to write.
        $att = Attendance::where('user_id', $this->employee->id)
            ->whereDate('date', '2026-01-05')
            ->firstOrFail();
        $this->assertSame('barcode', $att->source);
        $this->assertSame('present', $att->status);
        $this->assertEquals(8.0, (float) $att->total_hours);
        $this->assertEquals(0.0, (float) $att->overtime_hours);

        $lateAtt = Attendance::where('user_id', $this->employee->id)
            ->whereDate('date', '2026-01-06')
            ->firstOrFail();
        $this->assertSame('late', $lateAtt->status);
        $this->assertTrue((bool) $lateAtt->is_late);

        // --- Payroll compute for Jan 1–15 must see the kiosk days ---
        // Jan 2026, days 1–15: workdays = 1,2,3,5,6,7,8,9,10,12,13,14,15 (13; Sundays 4 & 11 off)
        $row = $this->computeRow('2026-01-01', '2026-01-15');

        $this->assertSame(13, $row['working_days']);
        $this->assertSame(2, $row['present_days'], 'Two kiosk-punched days must count as present');
        $this->assertSame(11, $row['absent_days'], 'Unpunched past workdays auto-count as absent');
        $this->assertSame(1, $row['late_days']);
        $this->assertSame(45, $row['total_late_minutes']);
        $this->assertEqualsWithDelta(15.25, $row['regular_hours'], 0.01); // 8.00 + 7.25
        $this->assertEqualsWithDelta(11000.0, $row['absent_deductions'], 0.01);   // 11 × 1000
        $this->assertEqualsWithDelta(93.75, $row['late_deductions'], 0.01);       // 45 × 125/60
        // Jan 1 (New Year's Day) is a seeded regular holiday — unpunched, so it
        // counts as an absence AND earns the DOLE unworked-holiday day of pay.
        $this->assertEqualsWithDelta(1000.0, $row['regular_holiday_pay'], 0.01);
        // gross = 13,000 + 1,000 holiday − 11,000 absent − 93.75 late
        $this->assertEqualsWithDelta(2906.25, $row['gross_pay'], 0.01);
        // Statutory + attendance deductions exceed the small gross → net floors at 0.
        $this->assertEquals(0, $row['net_pay']);
    }

    /**
     * Non-account employees (staff without login accounts) resolve by the same
     * barcode path and land in the employee-side payroll bucket.
     */
    public function test_non_account_employee_kiosk_punch_flows_into_payroll(): void
    {
        $employee = Employee::create([
            'employee_no'       => 'PAW-9901',
            'first_name'        => 'Juan',
            'last_name'         => 'Dela Cruz',
            'position'          => 'Groomer',
            'department'        => 'Operations',
            'hire_date'         => '2020-01-01',
            'employment_status' => 'regular',
            'is_active'         => true,
            'base_salary'       => 13000,  // daily 500
        ]);

        Carbon::setTestNow(Carbon::parse('2026-02-02 08:00:00')); // Monday
        $this->kioskPunch('PAW-9901')->assertOk()->assertJsonPath('punch_type', 'check_in');
        Carbon::setTestNow(Carbon::parse('2026-02-02 17:00:00'));
        $this->kioskPunch('PAW-9901')->assertOk()->assertJsonPath('punch_type', 'check_out');
        Carbon::setTestNow();

        $this->assertDatabaseHas('attendance', [
            'employee_id' => $employee->id,
            'date'        => '2026-02-02',
            'source'      => 'barcode',
            'status'      => 'present',
        ]);

        // Feb 1–15, 2026: workdays = 2–7 and 9–14 (12; Sundays 1, 8, 15 off)
        $row = collect(
            $this->postJson('/api/manager/payroll/compute', [
                'period_start' => '2026-02-01',
                'period_end'   => '2026-02-15',
            ], $this->managerAuth())->assertOk()->json('data')
        )->firstWhere('employee_id', $employee->id);

        $this->assertNotNull($row, 'Non-account employee must appear in compute');
        $this->assertSame(12, $row['working_days']);
        $this->assertSame(1, $row['present_days']);
        $this->assertSame(11, $row['absent_days']);
        // gross = 6,500 (half of 13,000) − 11 × 500 absent
        $this->assertEqualsWithDelta(1000.0, $row['gross_pay'], 0.01);
    }

    // ------------------------------------------------------------------
    // Full-year coverage — every semi-monthly period of 2026.
    // ------------------------------------------------------------------

    /**
     * All 24 semi-monthly periods of 2026 compute correctly with full
     * attendance: both halves of every month reconcile to the monthly base.
     */
    public function test_payroll_computes_for_all_24_semi_monthly_periods_of_2026(): void
    {
        // Seed every 2026 workday as a full present day for the employee.
        for ($d = Carbon::parse('2026-01-01'); $d->lte(Carbon::parse('2026-12-31')); $d->addDay()) {
            if (CompanySchedule::isWorkday($d->copy(), $this->employee)) {
                $this->punchDay($this->employee, $d->toDateString());
            }
        }

        $yearGross = 0.0;

        foreach (self::semiMonthlyPeriods(2026) as [$start, $end]) {
            $this->assertTrue(
                PayrollComputationService::isSemiMonthlyPeriod($start, $end),
                "{$start} → {$end} must be a valid payroll period"
            );

            $expectedWorkdays = count($this->workdaysIn($start, $end, $this->employee));
            $row = $this->computeRow($start, $end);

            $this->assertSame($expectedWorkdays, $row['working_days'], "working_days {$start}→{$end}");
            $this->assertSame($expectedWorkdays, $row['present_days'], "present_days {$start}→{$end}");
            $this->assertSame(0, $row['absent_days'], "absent_days {$start}→{$end}");
            $this->assertSame(0, $row['late_days']);
            $this->assertEqualsWithDelta($expectedWorkdays * 8.0, $row['regular_hours'], 0.01);
            $this->assertEquals(0.5, $row['period_factor']);

            // Fully worked half-month: half the base salary plus whatever
            // holiday premiums the seeded 2026 calendar puts in this period.
            $expectedGross = $this->expectedPeriodGross($start, $end, $this->employee);
            $this->assertEqualsWithDelta($expectedGross, $row['gross_pay'], 0.01, "gross {$start}→{$end}");
            $this->assertGreaterThan(0, $row['total_deductions']);
            $this->assertEqualsWithDelta(
                $row['gross_pay'] - $row['total_deductions'],
                $row['net_pay'],
                0.02, // each component is rounded to centavos — allow a centavo of double-rounding
                "net = gross − deductions {$start}→{$end}"
            );
            $this->assertGreaterThan(0, $row['net_pay']);

            $yearGross += $row['gross_pay'];
        }

        // Annual gross = 12 × base + all 2026 holiday premiums that apply to
        // this schedule (regular holidays pay a full day worked or not).
        $expectedYear = self::BASE_SALARY * 12;
        $allHolidays = \Illuminate\Support\Facades\DB::table('holidays')
            ->whereBetween('date', ['2026-01-01', '2026-12-31'])
            ->get(['date', 'type']);
        foreach ($allHolidays as $holiday) {
            if ($holiday->type === 'regular') {
                $expectedYear += self::DAILY_RATE;
            } elseif (CompanySchedule::isWorkday(Carbon::parse($holiday->date), $this->employee)) {
                $expectedYear += self::DAILY_RATE * 0.3;
            }
        }
        $this->assertEqualsWithDelta($expectedYear, $yearGross, 0.01);
    }

    /**
     * Deductions and premiums compute correctly inside a 2026 period:
     * late, absent, undertime, overtime, and rest-day work in one cutoff.
     */
    public function test_2026_period_deductions_and_premiums(): void
    {
        // March 1–15, 2026. Workdays: 2–7, 9–14 (12 days; Sundays 1/8/15 off).
        $present = ['2026-03-02', '2026-03-03', '2026-03-09', '2026-03-10',
                    '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14'];
        foreach ($present as $day) {
            $this->punchDay($this->employee, $day);
        }

        $this->punchDay($this->employee, '2026-03-04', '08:45', '17:00'); // late: 45 min
        // 2026-03-05 deliberately unpunched → auto-absent
        $this->punchDay($this->employee, '2026-03-06', '08:00', '19:30'); // 10.5 h → 2.5 h OT
        $this->punchDay($this->employee, '2026-03-07', '08:00', '16:00'); // undertime: 60 min
        $this->punchDay($this->employee, '2026-03-08', '08:00', '17:00'); // Sunday → rest-day work

        $row = $this->computeRow('2026-03-01', '2026-03-15');

        $this->assertSame(12, $row['working_days']);
        $this->assertSame(11, $row['present_days']);
        $this->assertSame(1, $row['absent_days']);
        $this->assertSame(1, $row['late_days']);
        $this->assertSame(45, $row['total_late_minutes']);
        $this->assertSame(60, $row['total_undertime_minutes']);
        $this->assertSame(1, $row['rest_day_days']);
        $this->assertEqualsWithDelta(2.5, $row['ot_workday_hours'], 0.01);
        $this->assertEqualsWithDelta(96.75, $row['regular_hours'], 0.01); // incl. rest-day 8 h

        $this->assertEqualsWithDelta(93.75, $row['late_deductions'], 0.01);        // 45 × 125/60
        $this->assertEqualsWithDelta(1000.0, $row['absent_deductions'], 0.01);    // 1 day × 1000
        $this->assertEqualsWithDelta(125.0, $row['undertime_deductions'], 0.01);  // 1 h × 125
        $this->assertEqualsWithDelta(468.75, $row['overtime_pay'], 0.01);         // 2.5 × 125 × 1.5
        $this->assertEqualsWithDelta(1300.0, $row['rest_day_pay'], 0.01);         // 1 day × 1000 × 1.3

        // gross = 13,000 + 468.75 OT + 1,300 rest − 1,000 absent − 93.75 late − 125 undertime
        $this->assertEqualsWithDelta(13550.0, $row['gross_pay'], 0.01);
        $this->assertGreaterThan(0, $row['net_pay']);
        $this->assertLessThan($row['gross_pay'], $row['net_pay']);
    }

    /**
     * Generated payroll rows persist for a 2026 month with the same figures
     * the compute preview reported; regenerating a period deduplicates.
     */
    public function test_generate_persists_2026_payroll_rows(): void
    {
        foreach ($this->workdaysIn('2026-06-01', '2026-06-30', $this->employee) as $day) {
            $this->punchDay($this->employee, $day);
        }

        foreach ([['2026-06-01', '2026-06-15'], ['2026-06-16', '2026-06-30']] as [$start, $end]) {
            $response = $this->postJson('/api/manager/payroll/generate', [
                'period_start' => $start,
                'period_end'   => $end,
            ], $this->managerAuth());

            $response->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('summary.error_count', 0);
        }

        $payrolls = Payroll::where('user_id', $this->employee->id)
            ->whereYear('pay_period_start', 2026)
            ->orderBy('pay_period_start')
            ->get();

        $this->assertCount(2, $payrolls);
        $this->assertSame('2026-06-01', $payrolls[0]->pay_period_start->toDateString());
        $this->assertSame('2026-06-15', $payrolls[0]->pay_period_end->toDateString());
        $this->assertSame('2026-06-16', $payrolls[1]->pay_period_start->toDateString());
        $this->assertSame('2026-06-30', $payrolls[1]->pay_period_end->toDateString());
        // Jun 12 (Independence Day) is a regular holiday in the seeded table —
        // worked, so the first cutoff carries a +1 day holiday premium.
        $this->assertEqualsWithDelta(14000.0, (float) $payrolls[0]->gross_pay, 0.01);
        $this->assertEqualsWithDelta(13000.0, (float) $payrolls[1]->gross_pay, 0.01);
        $this->assertEqualsWithDelta(
            self::BASE_SALARY + self::DAILY_RATE,
            (float) $payrolls->sum('gross_pay'),
            0.01,
            'June cutoffs = monthly base + worked-holiday premium'
        );

        // Regenerating the same period must not create a duplicate.
        $this->postJson('/api/manager/payroll/generate', [
            'period_start' => '2026-06-01',
            'period_end'   => '2026-06-15',
        ], $this->managerAuth())
            ->assertOk()
            ->assertJsonPath('summary.generated_count', 0);

        $this->assertSame(
            2,
            Payroll::where('user_id', $this->employee->id)->whereYear('pay_period_start', 2026)->count()
        );
    }

    /**
     * The semi-monthly contract holds for all of 2026 and rejects anything
     * that is not the 1st–15th or 16th–end of a single month.
     */
    public function test_2026_period_validation_accepts_only_semi_monthly_cutoffs(): void
    {
        foreach (self::semiMonthlyPeriods(2026) as [$start, $end]) {
            $this->assertTrue(PayrollComputationService::isSemiMonthlyPeriod($start, $end));
        }

        // Feb 2026 has 28 days — 16–28 must validate (not a leap year).
        $this->assertTrue(PayrollComputationService::isSemiMonthlyPeriod('2026-02-16', '2026-02-28'));

        // Invalid spans are rejected by the compute endpoint.
        foreach ([
            ['2026-01-10', '2026-01-20'],  // mid-month
            ['2026-01-16', '2026-02-15'],  // crosses months
            ['2026-04-16', '2026-04-29'],  // not end-of-month (Apr has 30)
        ] as [$start, $end]) {
            $this->postJson('/api/manager/payroll/compute', [
                'period_start' => $start,
                'period_end'   => $end,
            ], $this->managerAuth())->assertStatus(422);
        }
    }
}
