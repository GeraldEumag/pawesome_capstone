<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Industry payroll features + the zero-attendance absence bug fix.
 * June 1–15 2024 = 13 Mon–Sat workdays; Jun 2 & 9 are Sunday rest days.
 */
class PayrollIndustryTest extends TestCase
{
    use RefreshDatabase;

    private const START = '2024-06-01';
    private const END = '2024-06-15';

    // Every Mon–Sat workday inside the test period
    private const WORKDAYS = [
        '2024-06-01', '2024-06-03', '2024-06-04', '2024-06-05',
        '2024-06-06', '2024-06-07', '2024-06-08', '2024-06-10',
        '2024-06-11', '2024-06-12', '2024-06-13', '2024-06-14',
        '2024-06-15',
    ];

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

    private function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function staffUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 25000,
            'department' => 'Operations',
            'position' => 'Cashier',
        ], $overrides));
    }

    private function punch(User $user, string $date, ?string $in, ?string $out, array $extra = []): Attendance
    {
        return Attendance::create(array_merge([
            'user_id' => $user->id,
            'date' => $date,
            'check_in' => $in,
            'check_out' => $out,
            'total_hours' => $in && $out ? 8 : null,
            'overtime_hours' => 0,
            'status' => 'present',
        ], $extra));
    }

    private function punchAllWorkdays(User $user, array $except = []): void
    {
        foreach (self::WORKDAYS as $day) {
            if (in_array($day, $except, true)) {
                continue;
            }
            $this->punch($user, $day, '08:00', '17:00');
        }
    }

    /** @return array<string, mixed>|null */
    private function generateRow(User $user, string $start = self::START, string $end = self::END): ?array
    {
        $res = $this->postJson('/api/manager/payroll/generate', [
            'period_start' => $start,
            'period_end' => $end,
        ], $this->managerAuth());
        $res->assertStatus(200);

        return collect($res->json('data'))->firstWhere('user_id', $user->id);
    }

    private function computeRow(User $user, string $start = self::START, string $end = self::END): ?array
    {
        $res = $this->postJson('/api/manager/payroll/compute', [
            'period_start' => $start,
            'period_end' => $end,
        ], $this->managerAuth());
        $res->assertStatus(200);

        return collect($res->json('data'))->firstWhere('user_id', $user->id);
    }

    /** The core bug: no kiosk punches must mean absences, not full salary. */
    public function test_zero_attendance_generation_counts_absences(): void
    {
        $user = $this->staffUser();

        $row = $this->generateRow($user);

        $this->assertNotNull($row);
        $this->assertEquals(13, (float) $row['absent_days']);
        // 25,000 / 26 daily rate × 13 days = 12,500.02 ≈ entire period base
        $this->assertEqualsWithDelta(12500.02, (float) $row['absent_deductions'], 0.05);
        $this->assertEqualsWithDelta(0, (float) $row['gross_pay'], 0.05);
        $this->assertEquals(0, (float) $row['net_pay']);
    }

    /** Generated payroll must equal the preview the manager approved. */
    public function test_generated_payroll_matches_preview(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user);

        $computed = $this->computeRow($user);
        $generated = $this->generateRow($user);

        $this->assertNotNull($computed);
        $this->assertNotNull($generated);

        foreach (['gross_pay', 'net_pay', 'absent_days', 'absent_deductions', 'overtime_pay', 'sss_contribution', 'tax_deduction'] as $field) {
            $this->assertEqualsWithDelta(
                (float) $computed[$field],
                (float) $generated[$field],
                0.01,
                "Preview vs generated mismatch on {$field}"
            );
        }
    }

    /** Premium fields must persist through generate → database. */
    public function test_premium_fields_persist_on_generated_payroll(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user);

        // Sunday rest day worked
        $this->punch($user, '2024-06-02', '08:00', '17:00');

        // Regular holiday on a workday, worked
        DB::table('holidays')->insert([
            'date' => '2024-06-12',
            'name' => 'Independence Day',
            'type' => 'regular',
            'year' => 2024,
        ]);

        $row = $this->generateRow($user);
        $daily = 25000 / 26;

        // DOLE rest-day rate: 130% of the daily rate (base doesn't cover rest days)
        $this->assertEqualsWithDelta($daily * 1.30, (float) $row['rest_day_pay'], 0.01);
        $this->assertEqualsWithDelta($daily, (float) $row['regular_holiday_pay'], 0.01);

        $payroll = Payroll::findOrFail($row['id']);
        $this->assertEqualsWithDelta($daily * 1.30, (float) $payroll->rest_day_pay, 0.01);
        $this->assertEqualsWithDelta($daily, (float) $payroll->regular_holiday_pay, 0.01);
    }

    /** Undertime deducts minutes; missing check-out only flags. */
    public function test_undertime_deducts_and_incomplete_punch_only_flags(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user, ['2024-06-05', '2024-06-06']);

        // Undertime: left at 15:00 → 120 min early
        $this->punch($user, '2024-06-05', '08:00', '15:00', ['total_hours' => 6]);
        // Incomplete: check-in only — flagged, never deducted
        $this->punch($user, '2024-06-06', '08:00', null, ['total_hours' => null]);

        $preview = $this->computeRow($user);
        $row = $this->generateRow($user);
        $hourly = 25000 / 208;

        $this->assertEquals(13, (float) $row['present_days'], 'Incomplete-punch day still counts present');
        $this->assertEquals(1, (int) $row['incomplete_punch_days']);
        $this->assertEqualsWithDelta(2 * $hourly, (float) $row['undertime_deductions'], 0.05);
        $this->assertStringContainsString(
            'missing check-out',
            implode(' ', $preview['warnings'] ?? [])
        );
    }

    /** Mid-period hires are paid only payable days × daily rate. */
    public function test_mid_period_hire_proration(): void
    {
        $user = $this->staffUser(['employment_date' => '2024-06-10']);

        // Payable workdays Jun 10–15 = 6; punch them all
        foreach (['2024-06-10', '2024-06-11', '2024-06-12', '2024-06-13', '2024-06-14', '2024-06-15'] as $day) {
            $this->punch($user, $day, '08:00', '17:00');
        }

        $row = $this->computeRow($user);

        $this->assertNotNull($row);
        $this->assertTrue($row['is_prorated']);
        $this->assertEquals(6, (float) $row['payable_days']);
        $this->assertEqualsWithDelta((25000 / 26) * 6, (float) $row['period_base_salary'], 0.05);
        // No absences expected: all payable days punched, pre-hire days skipped
        $this->assertEquals(0, (float) $row['absent_days']);
    }

    /** Half-day approved leave: 0.5 paid leave + 0.5 absent when unpunched. */
    public function test_half_day_leave_counts_fractional_days(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user, ['2024-06-05']);

        DB::table('leave_requests')->insert([
            'user_id' => $user->id,
            'type' => 'vacation_leave',
            'start_date' => '2024-06-05',
            'end_date' => '2024-06-05',
            'reason' => 'Half-day errand',
            'half_day' => 1,
            'days_counted' => 0.5,
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = $this->computeRow($user);

        $this->assertEquals(12, (float) $row['present_days']);
        $this->assertEquals(0.5, (float) $row['paid_leave_days']);
        $this->assertEquals(0.5, (float) $row['absent_days']);
        $this->assertEqualsWithDelta((25000 / 26) * 0.5, (float) $row['absent_deductions'], 0.05);
    }

    /** DOLE overtime tiers differ by day type. */
    public function test_overtime_tiers_by_day_type(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user, ['2024-06-03', '2024-06-12']);

        // Workday OT (2h — check-out at 19:00 yields 10h total, 2h OT)
        $this->punch($user, '2024-06-03', '08:00', '19:00');
        // Rest-day OT (Sunday, 2h)
        $this->punch($user, '2024-06-02', '08:00', '19:00');
        // Regular-holiday workday OT (2h)
        DB::table('holidays')->insert([
            'date' => '2024-06-12',
            'name' => 'Independence Day',
            'type' => 'regular',
            'year' => 2024,
        ]);
        $this->punch($user, '2024-06-12', '08:00', '19:00');

        $row = $this->generateRow($user);
        $hourly = 25000 / 208;

        $this->assertEqualsWithDelta(2 * $hourly * 1.5, (float) $row['overtime_pay'], 0.05);
        $this->assertEqualsWithDelta(2 * $hourly * 1.69, (float) $row['rest_day_ot_pay'], 0.05);
        $this->assertEqualsWithDelta(2 * $hourly * 2.6, (float) $row['regular_holiday_ot_pay'], 0.05);
    }

    /** Employer shares computed for remittance; NTA excluded from taxable base. */
    public function test_employer_shares_and_non_taxable_allowance(): void
    {
        $user = $this->staffUser(['base_salary' => 50000]);
        $this->punchAllWorkdays($user);

        $service = app(PayrollComputationService::class);
        $records = Attendance::forPeriod(self::START, self::END)->forUser($user->id)->get();

        $without = $service->computeFromAttendance($user, $records, self::START, self::END);
        $with = $service->computeFromAttendance($user, $records, self::START, self::END, [
            'non_taxable_allowances' => 5000,
        ]);

        // SSS 2025 ER: MSC 35,000 × 10% + ₱10 EC = 3,510 monthly → 1,755 per cutoff
        $this->assertEqualsWithDelta(1755, (float) $without['sss_er_share'], 0.01);
        $this->assertEqualsWithDelta((float) $without['philhealth_contribution'], (float) $without['philhealth_er_share'], 0.01);
        $this->assertEqualsWithDelta((float) $without['pagibig_contribution'], (float) $without['pagibig_er_share'], 0.01);

        $withTaxableAllowance = $service->computeFromAttendance($user, $records, self::START, self::END, [
            'allowances' => 5000,
        ]);

        // Non-taxable allowance raises gross but not taxable income: tax stays
        // identical to no-allowance, while a taxable allowance raises it.
        $this->assertEqualsWithDelta((float) $without['gross_pay'] + 5000, (float) $with['gross_pay'], 0.01);
        $this->assertEqualsWithDelta((float) $without['tax_deduction'], (float) $with['tax_deduction'], 0.01);
        $this->assertGreaterThan(
            (float) $with['tax_deduction'],
            (float) $withTaxableAllowance['tax_deduction']
        );
    }

    /** Loan installment deducts in payroll and settles the balance exactly once on release. */
    public function test_loan_deduction_settles_once_on_release(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user);

        $loanId = DB::table('salary_loans')->insertGetId([
            'user_id' => $user->id,
            'loan_type' => 'salary_loan',
            'principal' => 3000,
            'balance' => 3000,
            'installment_amount' => 500,
            'start_period' => '2024-06-01',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = $this->generateRow($user);
        $this->assertEqualsWithDelta(500, (float) $row['salary_loan'], 0.01);

        // Balance unchanged until released
        $this->assertEquals(3000, (float) DB::table('salary_loans')->where('id', $loanId)->value('balance'));

        $this->postJson("/api/manager/payroll/{$row['id']}/release", [
            'payment_method' => 'Cash',
        ], $this->managerAuth())->assertStatus(200);

        $this->assertEquals(2500, (float) DB::table('salary_loans')->where('id', $loanId)->value('balance'));
        $this->assertTrue((bool) Payroll::find($row['id'])->loans_settled);

        // Second release is blocked → balance can never be reduced twice
        $this->postJson("/api/manager/payroll/{$row['id']}/release", [], $this->managerAuth())
            ->assertStatus(422);
        $this->assertEquals(2500, (float) DB::table('salary_loans')->where('id', $loanId)->value('balance'));
    }

    /** Payslip reconciles line-by-line with every earnings/deduction field. */
    public function test_payslip_reconciles_line_items(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user, ['2024-06-05']);
        $this->punch($user, '2024-06-02', '08:00', '17:00'); // rest day
        $this->punch($user, '2024-06-05', '08:00', '15:00', ['total_hours' => 6]); // undertime

        $row = $this->generateRow($user);
        $this->postJson("/api/manager/payroll/{$row['id']}/release", [
            'payment_method' => 'Cash',
        ], $this->managerAuth())->assertStatus(200);

        $res = $this->getJson("/api/manager/payroll/{$row['id']}/payslip", $this->managerAuth());
        $res->assertStatus(200);
        $p = $res->json('data');

        $earnings = $p['earnings'];
        $earningsTotal = (float) $earnings['base_salary'] + (float) $earnings['overtime_pay']
            + (float) $earnings['rest_day_pay'] + (float) $earnings['rest_day_ot_pay']
            + (float) $earnings['regular_holiday_pay'] + (float) $earnings['special_holiday_pay']
            + (float) $earnings['regular_holiday_ot_pay'] + (float) $earnings['special_holiday_ot_pay']
            + (float) $earnings['night_differential'] + (float) $earnings['bonus']
            + (float) $earnings['allowances'] + (float) $earnings['non_taxable_allowances']
            + (float) $earnings['commission'] + (float) $earnings['other_earnings'];

        $db = Payroll::find($row['id']);

        // gross = earnings − attendance deductions (late/absent/undertime)
        $attendanceDeductions = (float) $db->absent_deductions
            + (float) $db->late_deductions + (float) $db->undertime_deductions;
        $this->assertEqualsWithDelta(
            $earningsTotal - $attendanceDeductions,
            (float) $p['earnings']['gross_pay'],
            0.05,
            'Payslip gross does not reconcile with earnings minus attendance deductions'
        );

        $ded = $p['deductions'];
        $dedTotal = (float) $ded['sss'] + (float) $ded['philhealth'] + (float) $ded['pagibig']
            + (float) $ded['tax'] + (float) $ded['late_deductions'] + (float) $ded['absent_deductions']
            + (float) $ded['undertime_deductions'] + (float) $ded['salary_loan']
            + (float) $ded['cash_advance'] + (float) $ded['other_deductions'];
        $this->assertEqualsWithDelta($dedTotal, (float) $ded['total_deductions'], 0.01);
        $this->assertEqualsWithDelta(
            (float) $p['earnings']['gross_pay'] - (float) $ded['total_deductions'],
            (float) $p['net_pay'],
            0.05
        );
    }
}
